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
import { log } from '../logger';

/** GET daemon /health;无 /health 端点(旧版/外来服务/未启动)或失败 → null */
export async function fetchDaemonHealth(): Promise<{
  name: string;
  version: string;
} | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { name?: string; version?: string };
    return body.name && body.version
      ? { name: body.name, version: body.version }
      : null;
  } catch {
    return null;
  }
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
