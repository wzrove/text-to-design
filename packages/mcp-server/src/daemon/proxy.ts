import type { Client } from '@modelcontextprotocol/client';
import {
  Server,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { HTTP_PORT, SERVER_NAME, SERVER_VERSION } from '../config';
import { delay, probeUpstream } from './probe';
import { spawnDaemon } from './spawn';

const RECONNECT_DELAY_MS = 1500;
/** 重连总预算:超时后放弃本次恢复,把错误交还客户端 */
const RECONNECT_BUDGET_MS = 20000;

type RpcRequest = { params?: Record<string, unknown> };

/** stateless HTTP 无常驻连接,上游死亡只会表现为「下一次请求失败」;
 *  onclose 不可依赖,必须同时识别这类传输层错误 */
function isTransportError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /fetch failed|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|terminated|closed/i.test(
    msg,
  );
}

/**
 * shim 模式:stdio 与 daemon 之间的透明代理(不快照工具清单)。
 *
 * - tools/prompts/resources 的 list 与调用全部实时转发,任何时刻接入的
 *   会话看到的都是 daemon 当前真实可用集合(不再被启动瞬间的插件状态锁死)
 * - 上游 listChanged / resources/updated 通知实时转发给下游客户端
 * - 上游断线(daemon 被替换/崩溃)自动重探测重连,并在恢复后重放一次
 *   失败请求 —— 会话不再「终身残废」
 */
export async function serveProxy(initialClient: Client): Promise<void> {
  let upstream: Client = initialClient;
  let shuttingDown = false;
  let reconnectPromise: Promise<void> | null = null;

  const wireUpstream = (client: Client): void => {
    client.onclose = () => {
      if (shuttingDown) return;
      // 常驻流断开时兜底触发;stateless 模式通常走请求失败路径
      process.stderr.write('[text-to-design-mcp] shim: 上游断开,自动重连\n');
      ensureReconnect().catch(() => {});
    };
    const relayChanged =
      (downstreamMethod: string) => async (): Promise<void> => {
        await server.notification({ method: downstreamMethod }).catch(() => {}); // 下游已退出时忽略
      };
    client.setNotificationHandler(
      'notifications/tools/list_changed',
      relayChanged('notifications/tools/list_changed'),
    );
    client.setNotificationHandler(
      'notifications/prompts/list_changed',
      relayChanged('notifications/prompts/list_changed'),
    );
    client.setNotificationHandler(
      'notifications/resources/list_changed',
      relayChanged('notifications/resources/list_changed'),
    );
    client.setNotificationHandler(
      'notifications/resources/updated',
      async (notification) => {
        const params = (notification as { params?: Record<string, unknown> })
          .params;
        await server
          .notification({
            method: 'notifications/resources/updated',
            ...(params ? { params } : {}),
          })
          .catch(() => {});
      },
    );
  };

  const ensureReconnect = (): Promise<void> => {
    if (reconnectPromise) return reconnectPromise;
    reconnectPromise = (async () => {
      const deadline = Date.now() + RECONNECT_BUDGET_MS;
      let lastError: unknown = null;
      while (Date.now() < deadline) {
        try {
          const p = await probeUpstream();
          if (p.state === 'proxy') {
            upstream = p.client;
            wireUpstream(upstream);
            process.stderr.write('[text-to-design-mcp] shim: 上游已恢复\n');
            return;
          }
          // daemon 不在了(被杀/未起) → 按版本自检逻辑重新拉起
          if (p.state === 'none') spawnDaemon();
        } catch (e) {
          lastError = e; /* 单轮失败,下轮重试 */
        }
        await delay(RECONNECT_DELAY_MS);
      }
      throw lastError ?? new Error(`上游重连超时(${RECONNECT_BUDGET_MS}ms)`);
    })().finally(() => {
      reconnectPromise = null;
    });
    return reconnectPromise;
  };

  /** 统一出口:传输层错误 → 触发重连并重放一次;恢复后仍失败才交给下游 */
  const withUpstream = async <T>(
    fn: (client: Client) => Promise<T>,
  ): Promise<T> => {
    try {
      return await fn(upstream);
    } catch (e) {
      if (shuttingDown || !isTransportError(e)) throw e;
      process.stderr.write(
        '[text-to-design-mcp] shim: 上游请求失败,触发重连后重放\n',
      );
      await ensureReconnect();
      return fn(upstream);
    }
  };

  // 有意使用低层 Server(标记 @deprecated):shim 是透明代理,工具清单必须
  // 逐请求实时转发、不能在本地注册表快照 —— 这正是 SDK 所说的 advanced
  // use case。McpServer 的高层注册模型(registerTool 快照 + 懒加载 handler)
  // 与该目标相悖;若未来 SDK 移除 Server,再评估基于 McpServer 动态重注册。
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      supportedProtocolVersions: ['2026-07-28', ...SUPPORTED_PROTOCOL_VERSIONS],
      // 中继上游 initialize 下发的使用纪律,下游模型照样拿得到
      ...(initialClient.getInstructions()
        ? { instructions: initialClient.getInstructions() }
        : {}),
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true },
      },
    },
  );

  server.setRequestHandler('tools/list', async () =>
    withUpstream((c) => c.listTools()),
  );
  server.setRequestHandler('tools/call', async (request) => {
    const p = (request as RpcRequest).params ?? {};
    return withUpstream((c) =>
      c.callTool({
        name: p.name as string,
        arguments: (p.arguments ?? {}) as Record<string, unknown>,
      }),
    );
  });

  server.setRequestHandler('prompts/list', async () =>
    withUpstream((c) => c.listPrompts()),
  );
  server.setRequestHandler('prompts/get', async (request) => {
    const p = (request as RpcRequest).params ?? {};
    return withUpstream((c) =>
      c.getPrompt({
        name: p.name as string,
        ...((p.arguments as Record<string, string> | undefined)
          ? { arguments: p.arguments as Record<string, string> }
          : {}),
      }),
    );
  });

  server.setRequestHandler('resources/list', async () =>
    withUpstream((c) => c.listResources()),
  );
  server.setRequestHandler('resources/templates/list', async () =>
    withUpstream((c) => c.listResourceTemplates()),
  );
  server.setRequestHandler('resources/read', async (request) =>
    withUpstream((c) =>
      c.readResource({
        uri: ((request as RpcRequest).params as { uri: string }).uri,
      }),
    ),
  );

  wireUpstream(upstream);

  const stdioHandle = serveStdio(async () => server);
  process.stderr.write(
    `[text-to-design-mcp] shim 模式: stdio → http://127.0.0.1:${HTTP_PORT}/mcp (透明代理,共享 daemon)\n`,
  );
  process.on('SIGINT', async () => {
    shuttingDown = true;
    await stdioHandle.close();
    await upstream.close().catch(() => {});
    process.exit(0);
  });
}
