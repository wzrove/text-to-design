import type { Client } from '@modelcontextprotocol/client';
import {
  fromJsonSchema,
  McpServer,
  ResourceTemplate,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { SERVER_NAME, SERVER_VERSION } from '../config';
import { log, warn } from '../logger';
import { compactOutputSchema } from './compact-schema';
import { friendlyInputSchema } from './friendly-schema';
import { delay, fetchDaemonHealth, probeUpstream } from './probe';
import { spawnDaemon } from './spawn';

const RECONNECT_DELAY_MS = 1500;
/** 重连总预算:超时后放弃本次恢复,把错误交还客户端 */
const RECONNECT_BUDGET_MS = 20000;

/**
 * 目录新鲜度节奏。**不再是「快速档 / 慢速档」** —— 那个设计的前提已经不成立。
 *
 * 原设计假设「插件上下线会改变上游工具目录」,所以启动/重连后 20s 内按 2s 轮询
 * 抢在目录变化时尽快收敛。但 daemon 早已把目录与连接状态解耦(见 server.ts
 * syncToolAvailability:工具目录保持稳定,可用性下沉到运行时判定),而
 * toolRegistrars 本身是固定清单、平台门控发生在调用时(core/registry.ts)——
 * 也就是说**同一 daemon 版本下目录根本不会变**,2s 轮询每轮都在重拉一份完全
 * 相同的清单然后 diff 出「无变化」。
 *
 * 代价还不止请求数:listTools 单次回包 ~1.27 MB(53 个工具,其中 80% 是各工具
 * 重复的 outputSchema),于是快速档 ≈ 38 MB/分钟、稳态 ≈ 5 MB/分钟,每个会话
 * 各一份。
 *
 * 现在的策略:
 * - 常态只做一次廉价的 `/health` 版本自检(1 个 GET,几百字节);
 * - 只有「上游被换成了别的版本」才全量 resync;
 * - 另留一条极慢的全量兜底,防将来出现条件注册(目录真会变时有个保险)。
 */
const HEALTH_POLL_MS = 60_000;
const FULL_RESYNC_MS = 600_000;

/**
 * 下游目录体积护栏。
 *
 * 为什么需要:目录体积不是"省点带宽"的美化项 —— 下游(宿主)拿它当工具索引的
 * 输入,超预算的直接后果是**工具查不到、调不通**。2026-09-18 实测:1.64 MB 的
 * 目录让 53 个工具里只有 4 个可被检索。投影(./compact-schema.ts)把出参声明从
 * 892 KB 压到 96 KB、下游目录落到约 0.46 MB,这几个数值是回归护栏:越过就打
 * WARN,不阻断(目录仍可用,只是下游可能开始丢工具,得让人在日志里看见)。
 *
 * 整体上限取 500 KB 而不是更紧:剩下的大头是**入参** schema(约 300 KB,尚未
 * 收敛,是这块的地板,见 docs/design-decisions/0006 的第三阶段)。出参与整体
 * 分开设限,是为了看清涨的是谁 —— 出参才是投影自己拥有的那部分。
 */
const CATALOG_WARN_BYTES = 500_000;
const OUTPUT_SCHEMA_WARN_BYTES = 5_000;

interface CatalogSize {
  name: string;
  /** 单个工具下发形态的总字节(含入参 schema) */
  bytes: number;
  /** 其中出参声明的字节(投影负责的部分) */
  outputBytes: number;
}

/** 目录体积读数:一次全量 sync 打一行,越预算额外 WARN */
function reportCatalogSize(sizes: CatalogSize[]): void {
  if (sizes.length === 0) return;
  const total = sizes.reduce((sum, s) => sum + s.bytes, 0);
  const heaviestOutput = sizes.reduce((a, b) =>
    b.outputBytes > a.outputBytes ? b : a,
  );
  log(
    `目录体积: ${sizes.length} 个工具 / ${(total / 1024).toFixed(0)} KB(出参最大 ${heaviestOutput.name} ${(heaviestOutput.outputBytes / 1024).toFixed(1)} KB)`,
  );
  const overBudget = [
    ...(total > CATALOG_WARN_BYTES
      ? [
          `合计 ${(total / 1024).toFixed(0)} KB > ${CATALOG_WARN_BYTES / 1024} KB`,
        ]
      : []),
    ...sizes
      .filter((s) => s.outputBytes > OUTPUT_SCHEMA_WARN_BYTES)
      .map((s) => `出参 ${s.name} ${(s.outputBytes / 1024).toFixed(1)} KB`),
  ];
  if (overBudget.length > 0) {
    warn(
      `目录体积超预算(${overBudget.join(' / ')}):下游可能丢工具,检查 compact-schema 的投影深度与工具定义`,
    );
  }
}

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
 * 本地注册表只承担「目录」职责,工具调用始终实时转发 daemon;目录新鲜度由三重
 * 机制保证(按可靠性排序):
 * ① 下游握手时全量同步;
 * ② 上游重连成功后补偿同步(断连期间错过的变更);
 * ③ 常态只做 `/health` 版本自检,版本变化才全量 resync;另有一条极慢的全量兜底。
 *
 * 注意 ③ 不再是「定时重拉清单」:上游目录在同一 daemon 版本下是静态的
 * (固定注册清单 + 调用时平台门控),定时重拉只会反复取回同一份 1.27 MB 的清单。
 * 历史实现的 2s/15s 轮询在快速档下每分钟拉 38 MB,纯属浪费 —— 见下方节奏常量注释。
 * registerTool/remove 自带下游 listChanged 广播,规范客户端会自动刷新。
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
      warn('shim: 上游请求失败,触发重连后重放');
      await ensureReconnect();
      return fn(upstream);
    }
  };

  // ---- 动态同步:diff 上游清单与本地注册表,增/删/改 ----

  async function syncTools(): Promise<void> {
    const { tools } = await withUpstream((c) => c.listTools());
    const seen = new Set<string>();
    const sizes: CatalogSize[] = [];
    for (const t of tools) {
      seen.add(t.name);
      // 指纹与体积都从 **JSON Schema 本体** 算,不从转换后的注册对象算:
      // fromJsonSchema 返回的东西带函数,JSON.stringify 量不出真实体积
      // (实测会少读一个数量级),也感知不到投影规则的变化。投影规则一改,
      // raw 就变 → 已连接的会话下一轮 sync 自动重注册,不必等 shim 重启。
      const projectedOutput = t.outputSchema
        ? compactOutputSchema(t.outputSchema)
        : undefined;
      const wire: Record<string, unknown> = {
        title: t.title,
        description: t.description,
        annotations: t.annotations,
        ...(t.inputSchema
          ? // 入参失败信息走友好化改写(回显入参+联合分支清单),
            // 避免 ajv 对 oneOf 平铺出的超长报错误导调用方
            { inputSchema: friendlyInputSchema(t.inputSchema as never) }
          : {}),
        ...(projectedOutput === undefined
          ? {}
          : // 出参只投影到「键名 + 类型」级:声明比事实大 25 倍的原样目录会把
            // 下游工具索引撑爆,详见 ./compact-schema.ts
            { outputSchema: fromJsonSchema(projectedOutput as never) }),
      };
      const raw = JSON.stringify({
        title: t.title,
        description: t.description,
        annotations: t.annotations,
        inputSchema: t.inputSchema,
        outputSchema: projectedOutput,
      });
      sizes.push({
        name: t.name,
        bytes: raw.length,
        outputBytes:
          projectedOutput === undefined
            ? 0
            : JSON.stringify(projectedOutput).length,
      });
      const known = toolHandles.get(t.name);
      if (known && known.raw === raw) continue;
      known?.handle.remove();
      toolHandles.delete(t.name);
      const register = mcp.registerTool.bind(mcp) as unknown as (
        name: string,
        config: Record<string, unknown>,
        cb: (args: Record<string, unknown>) => Promise<unknown>,
      ) => RemovableHandle;
      try {
        const handle = register(t.name, wire, async (args) =>
          withUpstream((c) =>
            c.callTool({
              name: t.name,
              arguments: (args ?? {}) as Record<string, unknown>,
            }),
          ),
        );
        toolHandles.set(t.name, { handle, raw });
      } catch (e) {
        // 单工具注册失败不连坐整批:不入 toolHandles,下一轮 diff 会重试
        warn(
          `工具注册失败(${t.name}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    reportCatalogSize(sizes);
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
        warn(`同步清单失败: ${String(r.reason).slice(0, 120)}`);
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
            log('shim: 上游已恢复');
            await resyncAll(); // 补齐断连期间错过的变更
            return;
          }
          // daemon 不在了(被杀/未起) → 按版本自检逻辑重新拉起;
          // starting(在跑但未就绪) 只需等待,无需重复拉起
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
      warn('shim: 上游断开,自动重连');
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
    await resyncAll(); // 下游握手前先对齐一次清单(尽力而为,失败留待兜底轮询补偿)
    return mcp;
  });

  // ---- 新鲜度:廉价版本自检 + 极慢全量兜底 ----
  //
  // 目录在同一 daemon 版本下是静态的,所以常态不重拉清单,只问一次 /health:
  // 版本没变就什么都不做。上游被换成别的版本时(多来源安装、手动重启)才全量 resync。
  // 另一个入口是 withUpstream 的传输层错误路径 —— 上游断连会走 ensureReconnect,
  // 成功后本来就会 resyncAll,那条路不依赖这里的轮询。
  let syncedVersion: string | null = SERVER_VERSION;
  let healthTimer: NodeJS.Timeout | null = null;
  let fullTimer: NodeJS.Timeout | null = null;

  const pollHealth = async (): Promise<void> => {
    const health = await fetchDaemonHealth();
    // 探不到(daemon 不在)什么都不做:真需要目录时 withUpstream 会失败并触发重连
    if (health == null) return;
    if (health.version === syncedVersion) return;
    log(`上游版本变化(${syncedVersion} → ${health.version}),全量重同步目录`);
    syncedVersion = health.version;
    await resyncAll();
  };

  const scheduleHealth = (): void => {
    if (shuttingDown) return;
    healthTimer = setTimeout(() => {
      if (shuttingDown) return;
      void pollHealth().finally(scheduleHealth);
    }, HEALTH_POLL_MS);
    healthTimer.unref();
  };

  const scheduleFullResync = (): void => {
    if (shuttingDown) return;
    fullTimer = setTimeout(() => {
      if (shuttingDown) return;
      void resyncAll().finally(scheduleFullResync);
    }, FULL_RESYNC_MS);
    fullTimer.unref();
  };

  scheduleHealth();
  scheduleFullResync();
  log('shim 模式: stdio → 动态同步,共享 daemon');
  process.on('SIGINT', async () => {
    shuttingDown = true;
    if (healthTimer) clearTimeout(healthTimer);
    if (fullTimer) clearTimeout(fullTimer);
    await stdioHandle.close();
    await upstream.close().catch(() => {});
    process.exit(0);
  });
}
