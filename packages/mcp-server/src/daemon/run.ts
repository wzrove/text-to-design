import { createServer } from 'node:http';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Bridge } from '../bridge';
import {
  DAEMON_POLL_MS,
  DAEMON_WAIT_MS,
  HTTP_PORT,
  PORT,
  SERVER_NAME,
  SERVER_VERSION,
  STARTED_AT,
} from '../config';
import { debug, error, log } from '../logger';
import { buildServer } from '../server';
import {
  delay,
  fetchDaemonHealth,
  probeUpstream,
  warnIfDaemonStale,
} from './probe';
import { serveProxy } from './proxy';
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
  const deadline = Date.now() + DAEMON_WAIT_MS;
  do {
    const probe = await probeUpstream();
    if (probe.state === 'proxy') {
      await probe.client.close().catch(() => {});
      log('已有 daemon 在运行,本次启动跳过');
      return false;
    }
    if (probe.state === 'foreign') {
      error(`端口 ${HTTP_PORT} 被非 text-to-design MCP 服务占用,请先释放`);
      process.exit(1);
    }
    if (probe.state === 'none') return true;
    // starting:旧版在退/新版在起,等它把端口交出来
    await delay(DAEMON_POLL_MS);
  } while (Date.now() < deadline);

  // 超时仍可探到 health:端口确有人在听,别再去撞端口
  if ((await fetchDaemonHealth()) !== null) {
    log('已有 daemon 持有端口,本次启动跳过');
    return false;
  }
  return true;
}

/** daemon 模式:WS 桥(插件) + HTTP MCP(各会话 shim 连接),无 stdio,常驻 */
export async function runDaemon(bridge: Bridge): Promise<void> {
  if (!(await ensureSoleDaemon())) {
    // 本次启动被跳过 = 端口上已有实例,同样要提醒它可能是旧构建
    await warnIfDaemonStale();
    return;
  }
  await bridge.start(PORT);
  log(`daemon: 插件 WS ws://localhost:${bridge.port}`);

  const handler = createMcpHandler(() => buildServer(bridge));
  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  let httpServer: ReturnType<typeof createServer> | null = null;

  const shutdown = (reason: string): void => {
    log(`daemon 退出: ${reason}`);
    // 关闭是尽力而为:失败也必须退出,但不能静默(见决策 0007/0013)
    void handler.close().catch((e) => {
      debug(
        `关闭 MCP handler 失败(忽略): ${e instanceof Error ? e.message : String(e)}`,
      );
    });
    bridge.stop();
    httpServer?.close();
    process.exit(0);
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
      void nodeHandler(req, res);
    });
    httpServer.once('error', reject);
    httpServer.listen(HTTP_PORT, '127.0.0.1', () => resolve());
  });

  log(`daemon: MCP HTTP http://127.0.0.1:${HTTP_PORT}/mcp`);
  log('daemon 就绪,常驻运行(更新时由版本自检自动替换)');

  process.on('SIGINT', () => shutdown('SIGINT'));
}

/** shim 模式:探测 daemon;无则拉起并等待就绪 */
export async function runShim(): Promise<void> {
  // 先看一眼常驻实例是不是跑在旧构建上:同版本号会让版本自检放行,
  // 这个盲区正是「改了代码却不生效」的来源
  await warnIfDaemonStale();
  const probe = await probeUpstream();
  if (probe.state === 'foreign') {
    error(`端口 ${HTTP_PORT} 被非 text-to-design MCP 服务占用,请先释放`);
    process.exit(1);
  } else if (probe.state === 'proxy') {
    await serveProxy(probe.client);
    return;
  }

  // starting:本项目 daemon 在跑但未就绪,不必重复拉起,静候即可
  if (probe.state === 'none') {
    log('未发现 daemon,自动拉起...');
    spawnDaemon();
  } else {
    log('daemon 正在启动,等待就绪...');
  }
  const deadline = Date.now() + DAEMON_WAIT_MS;
  while (Date.now() < deadline) {
    await delay(DAEMON_POLL_MS);
    const retry = await probeUpstream();
    if (retry.state === 'proxy') {
      await serveProxy(retry.client);
      return;
    }
    if (retry.state === 'foreign') {
      error(`端口 ${HTTP_PORT} 被非 text-to-design MCP 服务占用,请先释放`);
      process.exit(1);
    }
  }
  error(`daemon 启动超时(${DAEMON_WAIT_MS / 1000}s),请检查残留进程后重试`);
  process.exit(1);
}
