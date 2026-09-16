import { statSync } from 'node:fs';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import {
  DAEMON_POLL_MS,
  DAEMON_REPLACE_MS,
  HTTP_PORT,
  SERVER_VERSION,
} from '../config';
import { log, warn } from '../logger';

/** GET daemon /health;无 /health 端点(旧版/外来服务/未启动)或失败 → null */
export async function fetchDaemonHealth(): Promise<{
  name: string;
  version: string;
  /** 该实例的启动时刻(旧版无此字段);用于识别「跑在旧构建上」 */
  startedAt?: number;
} | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      name?: string;
      version?: string;
      startedAt?: number;
    };
    return body.name && body.version
      ? {
          name: body.name,
          version: body.version,
          ...(typeof body.startedAt === 'number'
            ? { startedAt: body.startedAt }
            : {}),
        }
      : null;
  } catch {
    return null;
  }
}

let staleWarned = false;

/**
 * 构建陈旧告警(每次进程只报一次,且只告警不自动替换)。
 *
 * 为什么需要:版本自检比的是 `version`,而开发期反复 `pnpm build` 不改版本号,
 * 于是「改了服务端代码 → 重启 AI 会话 → 改动不生效」会静默发生 —— 新 shim 探到
 * 同版本的旧 daemon,直接当上游用。这里用「daemon 启动时刻 < 本地产物 mtime」
 * 把盲区变成一条明确告警。
 *
 * 为什么不自动替换:不同来源的两个同版本构建(仓库 dist 与 npx 缓存)会互相
 * 判定对方陈旧,替换成环。替换只由用户显式动作触发。
 */
export async function warnIfDaemonStale(): Promise<void> {
  if (staleWarned) return;
  staleWarned = true;
  const entry = process.argv[1];
  if (!entry) return;
  let mtime: number;
  try {
    mtime = statSync(entry).mtimeMs;
  } catch {
    return; // 读不到产物 mtime(打包进快照等)就跳过
  }
  const health = await fetchDaemonHealth();
  if (health?.startedAt == null || health.startedAt >= mtime) return;
  warn(
    `常驻 daemon 跑在旧构建上(daemon 启动 ${new Date(health.startedAt).toISOString()} < 产物 ${new Date(mtime).toISOString()}),本次代码改动未生效。` +
      `收掉它:curl -X POST http://127.0.0.1:${HTTP_PORT}/shutdown,再重新拉起`,
  );
}

/**
 * 探测 47820 的归属。
 *
 * - `proxy`   —— 已有同版本 text-to-design daemon,返回代理客户端
 * - `starting`—— 本项目的 daemon 在跑但 MCP 面尚未就绪(替换窗口/刚启动),
 *                调用方应稍后重试,而不是当成外来服务
 * - `foreign` —— 外来 MCP 服务占用
 * - `none`    —— 无服务
 */
export async function probeUpstream(): Promise<
  | { state: 'proxy'; client: Client }
  | { state: 'foreign' }
  | { state: 'starting' }
  | { state: 'none' }
> {
  const health = await fetchDaemonHealth();
  if (health && health.version !== SERVER_VERSION) {
    log(
      `检测到旧版 daemon (${health.version} → ${SERVER_VERSION}),正在替换...`,
    );
    await fetch(`http://127.0.0.1:${HTTP_PORT}/shutdown`, {
      method: 'POST',
    }).catch(() => {});
    const deadline = Date.now() + DAEMON_REPLACE_MS;
    while (Date.now() < deadline) {
      await delay(DAEMON_POLL_MS);
      if ((await fetchDaemonHealth()) === null) break;
    }
    // 仍未退干净:明确告知调用方下一轮重试,不要落入 foreign 误报
    if ((await fetchDaemonHealth()) !== null) {
      log('旧版 daemon 尚未释放端口,等待下一轮探测');
      return { state: 'starting' };
    }
    return { state: 'none' };
  }
  const client = new Client(
    { name: 'text-to-design-proxy', version: SERVER_VERSION },
    { versionNegotiation: { mode: 'auto' } },
  );
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${HTTP_PORT}/mcp`),
      ),
    );
    const { tools } = await client.listTools();
    if (tools.length === 0 || !tools.every((t) => t.name.startsWith('jsd_'))) {
      await client.close();
      return { state: 'foreign' };
    }
    return { state: 'proxy', client };
  } catch {
    await client.close().catch(() => {});
    // health 可达但 /mcp 连不上 → 本项目 daemon 正在启动/重启,不是没有服务
    return (await fetchDaemonHealth()) !== null
      ? { state: 'starting' }
      : { state: 'none' };
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
