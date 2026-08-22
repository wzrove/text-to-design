import type { Client } from '@modelcontextprotocol/client';
import {
  fromJsonSchema,
  McpServer,
  ResourceTemplate,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { HTTP_PORT, SERVER_NAME, SERVER_VERSION } from '../config';
import { delay, probeUpstream } from './probe';
import { spawnDaemon } from './spawn';

const RECONNECT_DELAY_MS = 1500;
/** 重连总预算:超时后放弃本次恢复,把错误交还客户端 */
const RECONNECT_BUDGET_MS = 20000;

/** 目录同步节奏:启动/重连后的快速档尽快收敛,稳态转入慢速档省流 */
const POLL_FAST_MS = 2000;
const POLL_FAST_WINDOW_MS = 20000;
const POLL_SLOW_MS = 15000;

/** 可移除的注册句柄(兼容 RegisteredTool/Prompt/Resource 的最小面) */
interface RemovableHandle {
  remove(): void;
}

interface RegisteredEntry {
  handle: RemovableHandle;
  /** 上次注册时的原始线格式,用于 diff 决定是否需要重注册 */
  raw: string;
}

/** stateless HTTP 无常驻连接,上游死亡只会表现为「下一次请求失败」;
 *  onclose 不可依赖,必须同时识别这类传输层错误 */
function isTransportError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /fetch failed|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|terminated|closed/i.test(
    msg,
  );
}

/**
 * shim 模式:stdio 与 daemon 之间的 MCP 代理(McpServer 动态重注册)。
 *
 * 本地注册表只承担「目录」职责,工具调用始终实时转发 daemon;目录新鲜度
 * 由四重机制保证(按到达顺序):
 * ① 下游握手时全量同步 ② 上游 listChanged 通知触发(若可达)
 * ③ 重连成功后补偿同步 ④ 3s 周期轮询兜底(stateless 下通知不可达时的
 * 最终保障)。registerTool/remove 自带下游 listChanged 广播,
 * 规范客户端会自动刷新工具清单。
 */
export async function serveProxy(initialClient: Client): Promise<void> {
  let upstream: Client = initialClient;
  let shuttingDown = false;
  let reconnectPromise: Promise<void> | null = null;

  const mcp = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      supportedProtocolVersions: ['2026-07-28', ...SUPPORTED_PROTOCOL_VERSIONS],
      // 中继上游 initialize 下发的使用纪律,下游模型照样拿得到
      ...(initialClient.getInstructions()
        ? { instructions: initialClient.getInstructions() }
        : {}),
    },
  );

  const toolHandles = new Map<string, RegisteredEntry>();
  const promptHandles = new Map<string, RegisteredEntry>();
  const resourceHandles = new Map<string, RegisteredEntry>();
  const templateHandles = new Map<string, RegisteredEntry>();

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

  // ---- 动态同步:diff 上游清单与本地注册表,增/删/改 ----

  async function syncTools(): Promise<void> {
    const { tools } = await withUpstream((c) => c.listTools());
    const seen = new Set<string>();
    for (const t of tools) {
      seen.add(t.name);
      const raw = JSON.stringify(t);
      const known = toolHandles.get(t.name);
      if (known && known.raw === raw) continue;
      known?.handle.remove();
      toolHandles.delete(t.name);
      const register = mcp.registerTool.bind(mcp) as unknown as (
        name: string,
        config: Record<string, unknown>,
        cb: (args: Record<string, unknown>) => Promise<unknown>,
      ) => RemovableHandle;
      const handle = register(
        t.name,
        {
          title: t.title,
          description: t.description,
          annotations: t.annotations,
          ...(t.inputSchema
            ? { inputSchema: fromJsonSchema(t.inputSchema as never) }
            : {}),
          ...(t.outputSchema
            ? { outputSchema: fromJsonSchema(t.outputSchema as never) }
            : {}),
        },
        async (args) =>
          withUpstream((c) =>
            c.callTool({
              name: t.name,
              arguments: (args ?? {}) as Record<string, unknown>,
            }),
          ),
      );
      toolHandles.set(t.name, { handle, raw });
    }
    for (const [name, entry] of [...toolHandles]) {
      if (!seen.has(name)) {
        entry.handle.remove();
        toolHandles.delete(name);
      }
    }
  }

  async function syncPrompts(): Promise<void> {
    const { prompts } = await withUpstream((c) => c.listPrompts());
    const seen = new Set<string>();
    for (const p of prompts) {
      seen.add(p.name);
      const raw = JSON.stringify(p);
      const known = promptHandles.get(p.name);
      if (known && known.raw === raw) continue;
      known?.handle.remove();
      promptHandles.delete(p.name);
      const shape: Record<string, z.ZodType> = {};
      for (const arg of p.arguments ?? []) {
        shape[arg.name] = z.string().describe(arg.description ?? '');
      }
      const handle = mcp.registerPrompt(
        p.name,
        {
          title: p.title,
          description: p.description,
          argsSchema: z.object(shape),
        },
        (args) =>
          withUpstream((c) =>
            c.getPrompt({
              name: p.name,
              ...(args ? { arguments: args as Record<string, string> } : {}),
            }),
          ),
      );
      promptHandles.set(p.name, { handle, raw });
    }
    for (const [name, entry] of [...promptHandles]) {
      if (!seen.has(name)) {
        entry.handle.remove();
        promptHandles.delete(name);
      }
    }
  }

  async function syncResources(): Promise<void> {
    const [{ resources }, { resourceTemplates }] = await Promise.all([
      withUpstream((c) => c.listResources()),
      withUpstream((c) => c.listResourceTemplates()),
    ]);
    const seenStatic = new Set<string>();
    for (const r of resources) {
      const uri = r.uri;
      seenStatic.add(uri);
      const raw = JSON.stringify(r);
      const known = resourceHandles.get(uri);
      if (known && known.raw === raw) continue;
      known?.handle.remove();
      resourceHandles.delete(uri);
      const handle = mcp.registerResource(
        r.name,
        uri,
        { title: r.title, description: r.description, mimeType: r.mimeType },
        async (u: URL) => withUpstream((c) => c.readResource({ uri: u.href })),
      );
      resourceHandles.set(uri, { handle, raw });
    }
    for (const [key, entry] of [...resourceHandles]) {
      if (!seenStatic.has(key)) {
        entry.handle.remove();
        resourceHandles.delete(key);
      }
    }

    const seenTpl = new Set<string>();
    for (const t of resourceTemplates) {
      const tpl = String(t.uriTemplate);
      seenTpl.add(tpl);
      const raw = JSON.stringify(t);
      const known = templateHandles.get(tpl);
      if (known && known.raw === raw) continue;
      known?.handle.remove();
      templateHandles.delete(tpl);
      const handle = mcp.registerResource(
        t.name,
        new ResourceTemplate(tpl, { list: undefined }),
        {
          title: t.title,
          description: t.description,
          mimeType: t.mimeType,
        },
        async (u: URL, vars: Record<string, string | string[]>) => {
          // 模板变量已在上游模板 URI 中声明;读取时原样回传完整 URI
          void vars;
          return withUpstream((c) => c.readResource({ uri: u.href }));
        },
      );
      templateHandles.set(tpl, { handle, raw });
    }
    for (const [key, entry] of [...templateHandles]) {
      if (!seenTpl.has(key)) {
        entry.handle.remove();
        templateHandles.delete(key);
      }
    }
  }

  const resyncAll = async (): Promise<void> => {
    const results = await Promise.allSettled([
      syncTools(),
      syncPrompts(),
      syncResources(),
    ]);
    for (const r of results) {
      if (r.status === 'rejected')
        process.stderr.write(
          `[text-to-design-mcp] shim: 同步清单失败: ${String(r.reason).slice(0, 120)}\n`,
        );
    }
  };

  // ---- 上游生命周期 ----

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
            enterFastPoll(); // 重连后回到快速档,尽快收敛清单
            process.stderr.write('[text-to-design-mcp] shim: 上游已恢复\n');
            await resyncAll(); // 补齐断连期间错过的变更
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

  const wireUpstream = (client: Client): void => {
    client.onclose = () => {
      if (shuttingDown) return;
      // 常驻流断开时兜底触发;stateless 模式通常走请求失败路径
      process.stderr.write('[text-to-design-mcp] shim: 上游断开,自动重连\n');
      ensureReconnect().catch(() => {});
    };
    client.setNotificationHandler(
      'notifications/tools/list_changed',
      async () => syncTools().catch(() => {}),
    );
    client.setNotificationHandler(
      'notifications/prompts/list_changed',
      async () => syncPrompts().catch(() => {}),
    );
    client.setNotificationHandler(
      'notifications/resources/list_changed',
      async () => syncResources().catch(() => {}),
    );
    client.setNotificationHandler(
      'notifications/resources/updated',
      async (notification) => {
        const params = (notification as { params?: { uri?: string } }).params;
        if (params?.uri != null)
          await mcp.server
            .sendResourceUpdated({ uri: params.uri })
            .catch(() => {});
      },
    );
  };

  wireUpstream(upstream);

  const stdioHandle = serveStdio(async () => {
    await resyncAll(); // 下游握手前先对齐一次清单(尽力而为,失败留待轮询补偿)
    return mcp;
  });
  // 新鲜度兜底:stateless 上游的变更通知不可达时,靠轮询收敛。
  // 自适应节奏:启动/重连后 20s 内走快速档(尽快发现插件上线),
  // 稳态转慢速档。registerTool/remove 自带下游 listChanged 广播,
  // 客户端会自动刷新。
  let fastUntil = Date.now() + POLL_FAST_WINDOW_MS;
  let pollTimer: NodeJS.Timeout | null = null;
  const schedulePoll = (): void => {
    if (shuttingDown) return;
    const delayMs = Date.now() < fastUntil ? POLL_FAST_MS : POLL_SLOW_MS;
    pollTimer = setTimeout(() => {
      if (shuttingDown) return;
      void resyncAll();
      schedulePoll();
    }, delayMs);
    pollTimer.unref();
  };
  const enterFastPoll = (): void => {
    fastUntil = Date.now() + POLL_FAST_WINDOW_MS;
  };
  schedulePoll();
  process.stderr.write(
    `[text-to-design-mcp] shim 模式: stdio → http://127.0.0.1:${HTTP_PORT}/mcp (动态同步,共享 daemon)\n`,
  );
  process.on('SIGINT', async () => {
    shuttingDown = true;
    if (pollTimer) clearTimeout(pollTimer);
    await stdioHandle.close();
    await upstream.close().catch(() => {});
    process.exit(0);
  });
}
