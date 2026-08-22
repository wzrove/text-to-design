import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { DAEMON_POLL_MS, HTTP_PORT, SERVER_VERSION } from '../config';
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
 * 探测 47820:已有 text-to-design daemon → 返回代理客户端;外来 MCP 服务 → 'foreign';无 → 'none'
 */
export async function probeUpstream(): Promise<
  { state: 'proxy'; client: Client } | { state: 'foreign' } | { state: 'none' }
> {
  const health = await fetchDaemonHealth();
  if (health && health.version !== SERVER_VERSION) {
    log(
      `检测到旧版 daemon (${health.version} → ${SERVER_VERSION}),正在替换...`,
    );
    await fetch(`http://127.0.0.1:${HTTP_PORT}/shutdown`, {
      method: 'POST',
    }).catch(() => {});
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      await delay(DAEMON_POLL_MS);
      if ((await fetchDaemonHealth()) === null) break;
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
    return { state: 'none' };
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
