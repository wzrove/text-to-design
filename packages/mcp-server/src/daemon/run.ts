import { AsyncLocalStorage } from 'node:async_hooks';
import { type FSWatcher, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname } from 'node:path';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { HEARTBEAT_MS } from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import {
  DAEMON_POLL_MS,
  DAEMON_REPLACE_MS,
  DAEMON_WAIT_MS,
  HTTP_PORT,
  PORT,
  SERVER_NAME,
  SERVER_VERSION,
  STARTED_AT,
} from '../config';
import { getConsent, initConsent, isAsked, writeConsent } from '../consent';
import { debug, error, log, warn } from '../logger';
import { buildServer } from '../server';
import { captureError, flushTelemetry, stopTelemetry } from '../telemetry';
import { latestVersions } from '../version-check';
import {
  awaitReady,
  clearSelfExitMarker,
  daemonIsStale,
  delay,
  fetchDaemonHealth,
  probeUpstream,
  selfExitMarkerAt,
  selfExitMarkerPath,
  warnIfDaemonStale,
} from './probe';
import { serveProxy } from './proxy';
import { createServerPool, type ServerLease } from './server-pool';
import { loadSkillsCatalog } from './skills';
import { spawnDaemon } from './spawn';

export { spawnDaemon };

/**
 * 幂等守卫:已有 daemon 持有端口就没必要再起一个。
 *
 * 背景:`daemon` 子命令要能被反复执行(开机脚本 / 用户手动唤醒 / shim 与
 * 重连兜底并发 spawn),重复启动旧行为是撞端口直接抛错 —— 用户分不清
 * 「已经跑着」和「起不来」。此处按归属区分:
 *
 * - `proxy` / `starting` —— 本项目的 daemon 已在(或正在)监听 → 静默跳过
 * - `foreign`             —— 端口被外来 MCP 服务占用 → 明确报错退出
 * - `none`                —— 无人监听(含旧版刚被替换掉) → 继续正常启动
 */
async function ensureSoleDaemon(): Promise<boolean> {
  // 首轮探测必做:probeUpstream 自己在旧版本时会先完成替换。之后 starting(旧版在退 /
  // 新版在起)交给 awaitReady 轮询到终态,直到真正 quiet 才算「无人监听」。
  const seen = await probeUpstream();
  if (seen.state === 'starting') {
    const waited = await awaitReady({ first: seen });
    if (waited?.state === 'proxy') {
      await waited.client.close().catch(() => {});
      log('已有 daemon 在运行,本次启动跳过');
      return false;
    }
    if (waited?.state === 'foreign') refuseForeignPort();
    // 等不出终态:仍能探到 health 就是「端口确有人在听」,别再去撞端口
    if (waited == null && (await fetchDaemonHealth()) !== null) {
      log('已有 daemon 持有端口,本次启动跳过');
      return false;
    }
    return true;
  }
  if (seen.state === 'proxy') {
    await seen.client.close().catch(() => {});
    log('已有 daemon 在运行,本次启动跳过');
    return false;
  }
  if (seen.state === 'foreign') refuseForeignPort();
  return true;
}

/** daemon 模式:WS 桥(插件) + HTTP MCP(各会话 shim 连接),无 stdio,常驻 */
export async function runDaemon(bridge: Bridge): Promise<void> {
  if (!(await ensureSoleDaemon())) {
    // 本次启动被跳过 = 端口上已有实例,同样要提醒它可能是旧构建
    await warnIfDaemonStale();
    return;
  }
  await initConsent();
  bridge.start(PORT);
  log(`daemon: 插件 WS ws://localhost:${bridge.port}`);

  // SDK 每次交换独占实例，租约在请求结束后释放。
  const skills = await loadSkillsCatalog();
  // 装到这个实例上。目录跟着 dist 走(load 会 reload),所以每次挂的都是当下那份
  const attachSkills = (
    server: ReturnType<typeof buildServer>,
    catalog: typeof skills,
  ): void => {
    // 每个实例各挂一次:一个 server 只能有一个 skills 扩展,重复 attach 会抛
    if (catalog == null) return;
    try {
      catalog.attach(server);
    } catch (e) {
      warn(
        `skills 挂载失败(该实例继续提供工具): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };
  // 池是同步建例的,而技能目录要异步读 —— 先按首轮结果建,读不动就空挂,
  // 不为此把整条建例路径改成异步(池的接口因此不必跟着变)
  const pool = createServerPool(() => {
    const server = buildServer(bridge);
    attachSkills(server, skills);
    return server;
  });
  const requestLease = new AsyncLocalStorage<ServerLease>();
  const handler = createMcpHandler(
    () => {
      const lease = requestLease.getStore();
      if (lease == null) throw new Error('Missing MCP server lease');
      return lease.server;
    },
    { legacy: 'reject' },
  );
  const nodeHandler = toNodeHandler({
    fetch: async (request, options) => {
      const response = await handler.fetch(request, options);
      const lease = requestLease.getStore();
      // 订阅流由 SDK 总线持有，不应持续占用已断开的服务实例。
      if (lease != null && !lease.server.isConnected()) lease.release();
      return response;
    },
  });
  // 上一次退出留下的标记不能算在本次头上,否则冷启动 2s 就自己又退了
  clearSelfExitMarker();
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  let httpServer: ReturnType<typeof createServer> | null = null;
  let versionTimer: ReturnType<typeof setInterval> | null = null;
  let markerWatcher: FSWatcher | null = null;

  /**
   * 版本提示:查一次(缓存未过期就不真查),连着就把结论推下去。
   *
   * **三个触发点,各有分工**:
   * - 启动:只为**预热缓存** —— 此刻面板通常还没连上,但不查的话面板连上时要现等
   *   一次 registry 往返(最坏 4s)才看得到提示;
   * - 面板连上:立刻推,缓存是热的,这就是「一打开就看到」的那一次;
   * - 心跳:兜住「会话中途发了新版」—— 面板一直开着时,只有它还会再推。
   *
   * 查询频率由 `latestVersions` 内的 VERSION_CHECK_MS 缓存守着,投递才跟心跳。
   */
  const syncLatest = (): void => {
    void latestVersions().then((latest) => {
      const brief = `ui=${latest.ui ?? '未查到'} mcp=${latest.mcp ?? '未查到'}`;
      if (!bridge.isConnected) {
        log(`版本同步: ${brief} (面板未连接,只更新缓存)`);
        return;
      }
      bridge.pushVersion({ type: 'version', latest });
      log(`版本同步: ${brief} (已推送面板)`);
    });
  };
  // 同意状态先于版本推:面板要拿它渲染二级菜单里的当前档;没问过时面板
  // 还要靠 asked 自动弹一次首问框
  bridge.onPluginConnect = () => {
    bridge.pushConsent({
      type: 'consent',
      granted: getConsent(),
      asked: isAsked(),
    });
    syncLatest();
  };

  /**
   * 面板改了同意:持久化 + 回执。回执必发(包括离线前最后一次)——
   * 面板按回执校准菜单显示,不靠发送方自觉。
   */
  bridge.onConsentSet = (granted) => {
    void writeConsent(granted);
    log(`错误上报同意: ${granted ? '开启' : '关闭'}`);
    bridge.pushConsent({ type: 'consent', granted, asked: true });
  };

  /**
   * 进程级异常:采一条 fatal、尽力冲一次上报,然后按 Node 默认语义退出。
   * 不吞异常 —— 遥测不允许改变「崩就是崩」的行为。
   */
  process.on('uncaughtException', (err) => {
    captureError({
      level: 'fatal',
      message: err.message,
      stack: err.stack,
      scope: 'daemon',
    });
    void flushTelemetry(3_000).finally(() => process.exit(1));
  });
  process.on('unhandledRejection', (reason) => {
    captureError({
      level: 'fatal',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      scope: 'daemon',
    });
    void flushTelemetry(3_000).finally(() => process.exit(1));
  });

  const shutdown = (reason: string): void => {
    log(`daemon 退出: ${reason}`);
    if (versionTimer != null) clearInterval(versionTimer);
    markerWatcher?.close();
    stopTelemetry();
    // 退出前尽力冲一次遥测(短预算,失败随进程消失);关闭是尽力而为:
    // 失败也必须退出,但不能静默(见决策 0007/0013)
    void flushTelemetry(1_500).finally(() => {
      void handler.close().catch((e) => {
        debug(
          `关闭 MCP handler 失败(忽略): ${e instanceof Error ? e.message : String(e)}`,
        );
      });
      bridge.stop();
      httpServer?.close();
      process.exit(0);
    });
  };

  await new Promise<void>((resolve, reject) => {
    httpServer = createServer((req, res) => {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;
      const start = Date.now();
      const url = req.url ?? '';
      res.on('finish', () => {
        // 成功请求降为 debug:shim 轮询会周期性打出大量 200,避免刷屏;
        // 排查轮询节奏时开 TEXT_TO_DESIGN_MCP_LOG_LEVEL=debug 可见
        const line = `HTTP ${req.method} ${url} → ${res.statusCode} (${Date.now() - start}ms)`;
        if (res.statusCode >= 400) log(line);
        else debug(line);
      });
      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            name: SERVER_NAME,
            version: SERVER_VERSION,
            pid: process.pid,
            startedAt: STARTED_AT,
          }),
        );
        return;
      }
      if (req.method === 'POST' && url === '/shutdown') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        setTimeout(() => shutdown('收到 /shutdown 请求'), 100);
        return;
      }
      const lease = pool.acquire();
      if (lease == null) {
        res.writeHead(503, {
          'content-type': 'application/json',
          'retry-after': '1',
        });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'MCP server busy; retry later' },
          }),
        );
        return;
      }
      void requestLease.run(lease, async () => {
        try {
          await nodeHandler(req, res);
        } catch (failure) {
          warn(`HTTP handler failed: ${String(failure)}`);
          res.destroy();
        } finally {
          lease.release();
          // 请求收尾是「退役请求因池满而暂缓」的第二个时机(第一个是标记事件本身)
          tryRetire();
        }
      });
    });
    httpServer.once('error', reject);
    httpServer.listen(HTTP_PORT, '127.0.0.1', () => resolve());
  });

  log(`daemon: MCP HTTP http://127.0.0.1:${HTTP_PORT}/mcp`);
  log('daemon 就绪,常驻运行(shim 重启时轮换到新构建)');

  versionTimer = setInterval(syncLatest, HEARTBEAT_MS);
  // 先查一次把缓存预热(此刻多半还没连面板,推不出去也值得查)
  syncLatest();

  /**
   * 退役:shim 重启后写标记,这里**事件驱动**地看见就退 —— 不轮询。
   *
   * 为什么不能轮询:那等于给常驻进程装一个永久定时器,只为等一个可能永远不来
   * 的标记;而标记本来就是「有人刚加载了新产物」这种一次性事件,用文件系统
   * 通知(FSEvents/inotify)接才对得上它的发生方式。
   *
   * 池满时不丢请求:记 pending,等下一次租约释放再试(见 finally 里的 tryRetire)。
   */
  let retirePending = false;
  const tryRetire = (): void => {
    if (!retirePending) return;
    const lease = pool.acquire();
    if (lease == null) return; // 正在服务,等某个请求收尾
    lease.release();
    retirePending = false;
    warn('shim 已换上当前构建,常驻 daemon 退出轮换');
    shutdown('shim 请求轮换');
  };
  const onMarker = (): void => {
    if (selfExitMarkerAt() == null) return;
    retirePending = true;
    tryRetire();
  };
  const markerPath = selfExitMarkerPath();
  try {
    markerWatcher = watch(dirname(markerPath), (_event, filename) => {
      // 只认自己那个文件:状态目录里还可能有别的
      if (filename != null && filename !== basename(markerPath)) return;
      onMarker();
    });
    markerWatcher.on('error', (e) =>
      debug(`退役标记监听失败(只剩 shim 下次启动时轮换): ${String(e)}`),
    );
  } catch (e) {
    debug(`装不上退役标记监听: ${String(e)}`);
  }
  // 监听装好前标记可能已落地(两进程几乎同时起),补看一次
  onMarker();

  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * 请运行中的 daemon 退役(自检退出),并等它放掉端口。
 *
 * 为什么不直接 POST /shutdown:那个口子对任何本机进程开放,拿到就能杀 daemon。
 * 「谁都能杀」本身就多余 —— 退出决策归身份,依据只**暴露**不授权:把「我已换成
 * 新构建」写进 daemon 正在监听的那个标记文件,退不退由 daemon 自己判。
 *
 * 标记的生命周期由两端共同决定:daemon 启动时抹掉,下一个 shim 连上时重写。
 * 于是标记的含义恒定 —— 「上一个 shim 请它退过」,等价于「shim 一重启就换新」。
 * 不这么配对会在冷启动后立刻误杀:daemon 退出后留下的标记若无人抹,新 daemon
 * 一装好监听就自己又退了,冷启动直接成环。
 */
async function retireDaemon(): Promise<void> {
  try {
    writeFileSync(selfExitMarkerPath(), String(STARTED_AT));
  } catch {
    debug('自检标记写不进去(只读安装?),交给产物自检兜底');
    return;
  }
  const deadline = Date.now() + DAEMON_REPLACE_MS;
  while (Date.now() < deadline) {
    await delay(DAEMON_POLL_MS);
    if ((await fetchDaemonHealth()) == null) return;
  }
  warn(`daemon 在 ${DAEMON_REPLACE_MS / 1000}s 内未退役,交给产物自检继续兜底`);
}

/** 端口被外来服务占着:各入口同一句,不各抄一遍 */
function refuseForeignPort(): never {
  error(`端口 ${HTTP_PORT} 被非 text-to-design MCP 服务占用,请先释放`);
  process.exit(1);
}

/** awaitReady 超时(null)统一收口:同一个预算、同一句报错 */
function timeoutExit(): never {
  error(`daemon 启动超时(${DAEMON_WAIT_MS / 1000}s),请检查残留进程后重试`);
  process.exit(1);
}

/** shim 模式:探测 daemon;无则拉起并等待就绪 */
export async function runShim(): Promise<void> {
  // 先看一眼常驻实例是不是跑在旧构建上:同版本号会让版本自检放行,
  // 这个盲区正是「改了代码却不生效」的来源
  await warnIfDaemonStale();
  const probe = await probeUpstream();
  if (probe.state === 'foreign') refuseForeignPort();
  if (probe.state === 'proxy') {
    // 「shim 重启」只说明宿主重连了,**不说明产物换了**(见 daemonIsStale 的注释)。
    // 只有 daemon 真跑在旧构建上才值得轮换;否则直接复用它 —— 无条件轮换会让宿主
    // 的重连抖动把 daemon 连环杀掉,每次都不及就绪,最终 MCP 面永久 disconnected。
    if ((await daemonIsStale()) == null) {
      log('复用常驻 daemon(已跑在当前构建上,不轮换)');
      await serveProxy(probe.client);
      return;
    }
    await probe.client.close().catch(() => {});
    await retireDaemon();
    // 退役窗口里探到的永远是刚死那个:等到终态再定起不起,否则会撞端口。
    // 这里**不**拉起 —— 拉起只发生在确认 none 之后。
    const after = await awaitReady();
    if (after?.state === 'proxy') {
      await serveProxy(after.client);
      return;
    }
    if (after?.state === 'foreign') refuseForeignPort();
    if (after == null) timeoutExit();
  }

  // starting:本项目 daemon 在跑但未就绪,不必重复拉起,静候即可
  if (probe.state === 'none') log('未发现 daemon,自动拉起...');
  else log('daemon 正在启动,等待就绪...');
  const ready = await awaitReady({ spawnIfNone: true, first: probe });
  if (ready?.state === 'proxy') {
    await serveProxy(ready.client);
    return;
  }
  if (ready?.state === 'foreign') refuseForeignPort();
  timeoutExit();
}
