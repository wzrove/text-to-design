import type { Client } from '@modelcontextprotocol/client';
import type { ServerContext } from '@modelcontextprotocol/server';
import {
  fromJsonSchema,
  McpServer,
  ResourceTemplate,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  MAX_TOOL_INPUT_ELEMENTS,
  SERVER_NAME,
  SERVER_VERSION,
} from '../config';
import { log, warn } from '../logger';
import { compactOutputSchema } from './compact-schema';
import { friendlyInputSchema } from './friendly-schema';
import {
  proxyNotification,
  proxyRequestOptions,
  serializeSync,
  type UpstreamCall,
} from './proxy-protocol';
import { registerSkillsProxy } from './skills-proxy';

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

/**
 * 上游 prompt 的参数声明 → shim 侧注册用的 zod schema。
 *
 * **必须保住可选性**:上游把参数声明成 `required: false`(如 `design-strategy` 的
 * `screen`、`variant-set` 的 `family`),镜像时一律写成 `z.string()` 会让下游
 * 「不填就调不动」—— 而这些配方的用法恰恰是「参数留空 = 只要纪律」。
 * 2026-09-29 实测:镜像丢失可选性时 `getPrompt({name:'design-strategy', arguments:{}})`
 * 被本层拒成 `screen: Invalid input: expected string, received undefined`,
 * 而 `prompts/list` 也把每个参数都报成 `required: true`。
 *
 * MCP 的 prompt 参数在线上都是字符串,故这里一律 `z.string()`;真正的取值校验仍在
 * 上游(它有原始 schema),本层只负责把「要不要填」如实转达给下游。
 */
export function promptArgsSchema(
  args:
    | readonly { name: string; description?: string; required?: boolean }[]
    | undefined,
): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const arg of args ?? []) {
    const field = z.string().describe(arg.description ?? '');
    shape[arg.name] = arg.required === true ? field : field.optional();
  }
  return z.object(shape);
}

export function createCatalogProxy(
  initialClient: Client,
  withUpstream: UpstreamCall,
) {
  const mcp = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      supportedProtocolVersions: ['2026-07-28', ...SUPPORTED_PROTOCOL_VERSIONS],
      ...(MAX_TOOL_INPUT_ELEMENTS == null
        ? {}
        : { maxToolInputElements: MAX_TOOL_INPUT_ELEMENTS }),
      // 中继上游 initialize 下发的使用纪律,下游模型照样拿得到
      ...(initialClient.getInstructions()
        ? { instructions: initialClient.getInstructions() }
        : {}),
      /**
       * shim 的目录**不是**静态的:它是上游目录的镜像,syncTools/syncPrompts/
       * syncResources 会按上游变化增删注册。所以这里与 daemon 侧(schema.ts 给了
       * 5 分钟)相反 —— 全部 ttlMs=0,不许下游缓存目录;变化靠 registerTool/remove
       * 自带的 list_changed 广播,而不是靠 TTL 过期。
       * resources/read 的上游结果字段优先于此处的默认值，保留源端缓存策略。
       */
      cacheHints: {
        'tools/list': { ttlMs: 0, cacheScope: 'private' },
        'prompts/list': { ttlMs: 0, cacheScope: 'private' },
        'resources/list': { ttlMs: 0, cacheScope: 'private' },
        'resources/templates/list': { ttlMs: 0, cacheScope: 'private' },
        'resources/read': { ttlMs: 0, cacheScope: 'private' },
      },
    },
  );

  const toolHandles = new Map<string, RegisteredEntry>();
  const promptHandles = new Map<string, RegisteredEntry>();
  const resourceHandles = new Map<string, RegisteredEntry>();
  const templateHandles = new Map<string, RegisteredEntry>();

  // ---- 动态同步:diff 上游清单与本地注册表,增/删/改 ----

  async function syncTools(): Promise<void> {
    const { tools } = await withUpstream((c) =>
      c.listTools(undefined, { cacheMode: 'refresh' }),
    );
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
        icons: t.icons,
        _meta: t._meta,
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
        icons: t.icons,
        _meta: t._meta,
        inputSchema: t.inputSchema,
        outputSchema: projectedOutput,
      });
      sizes.push({
        name: t.name,
        bytes: Buffer.byteLength(raw, 'utf8'),
        outputBytes:
          projectedOutput === undefined
            ? 0
            : Buffer.byteLength(JSON.stringify(projectedOutput), 'utf8'),
      });
      const known = toolHandles.get(t.name);
      if (known && known.raw === raw) continue;
      known?.handle.remove();
      toolHandles.delete(t.name);
      const register = mcp.registerTool.bind(mcp) as unknown as (
        name: string,
        config: Record<string, unknown>,
        cb: (
          args: Record<string, unknown>,
          ctx: ServerContext,
        ) => Promise<unknown>,
      ) => RemovableHandle;
      try {
        const handle = register(t.name, wire, async (args, ctx) =>
          withUpstream(
            (c) =>
              c.callTool(
                {
                  name: t.name,
                  arguments: (args ?? {}) as Record<string, unknown>,
                  _meta: ctx.mcpReq._meta,
                },
                proxyRequestOptions(ctx),
              ),
            {
              replay:
                t.annotations?.readOnlyHint === true ||
                t.annotations?.idempotentHint === true,
            },
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
    const { prompts } = await withUpstream((c) =>
      c.listPrompts(undefined, { cacheMode: 'refresh' }),
    );
    const seen = new Set<string>();
    for (const p of prompts) {
      seen.add(p.name);
      const raw = JSON.stringify(p);
      const known = promptHandles.get(p.name);
      if (known && known.raw === raw) continue;
      known?.handle.remove();
      promptHandles.delete(p.name);
      const handle = mcp.registerPrompt(
        p.name,
        {
          title: p.title,
          description: p.description,
          icons: p.icons,
          _meta: p._meta,
          argsSchema: promptArgsSchema(p.arguments),
        },
        (args, ctx) =>
          withUpstream((c) =>
            c.getPrompt(
              {
                name: p.name,
                ...(args ? { arguments: args as Record<string, string> } : {}),
                _meta: ctx.mcpReq._meta,
              },
              proxyRequestOptions(ctx),
            ),
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
      withUpstream((c) => c.listResources(undefined, { cacheMode: 'refresh' })),
      withUpstream((c) =>
        c.listResourceTemplates(undefined, { cacheMode: 'refresh' }),
      ),
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
        {
          title: r.title,
          description: r.description,
          mimeType: r.mimeType,
          icons: r.icons,
          annotations: r.annotations,
          _meta: r._meta,
        },
        async (u, ctx) =>
          withUpstream((c) =>
            c.readResource(
              { uri: u.href, _meta: ctx.mcpReq._meta },
              { ...proxyRequestOptions(ctx), cacheMode: 'bypass' },
            ),
          ),
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
          icons: t.icons,
          annotations: t.annotations,
          _meta: t._meta,
        },
        async (u, vars, ctx) => {
          // 模板变量已在上游模板 URI 中声明;读取时原样回传完整 URI
          void vars;
          return withUpstream((c) =>
            c.readResource(
              { uri: u.href, _meta: ctx.mcpReq._meta },
              { ...proxyRequestOptions(ctx), cacheMode: 'bypass' },
            ),
          );
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

  const syncToolsInOrder = serializeSync(syncTools);
  const syncPromptsInOrder = serializeSync(syncPrompts);
  const syncResourcesInOrder = serializeSync(syncResources);
  const resyncAll = async (): Promise<void> => {
    const results = await Promise.allSettled([
      syncToolsInOrder(),
      syncPromptsInOrder(),
      syncResourcesInOrder(),
    ]);
    for (const r of results) {
      if (r.status === 'rejected')
        warn(`同步清单失败: ${String(r.reason).slice(0, 120)}`);
    }
  };

  registerSkillsProxy(mcp, initialClient, withUpstream);
  if (initialClient.getServerCapabilities()?.completions) {
    mcp.server.registerCapabilities({ completions: {} });
    mcp.server.setRequestHandler('completion/complete', (request, ctx) =>
      withUpstream((client) =>
        client.complete(request.params, proxyRequestOptions(ctx)),
      ),
    );
  }

  function wireNotifications(client: Client): void {
    client.setNotificationHandler(
      'notifications/tools/list_changed',
      async (notification) => {
        await syncToolsInOrder();
        if (mcp.isConnected())
          await mcp.server.notification(proxyNotification(notification));
      },
    );
    client.setNotificationHandler(
      'notifications/prompts/list_changed',
      async (notification) => {
        await syncPromptsInOrder();
        if (mcp.isConnected())
          await mcp.server.notification(proxyNotification(notification));
      },
    );
    client.setNotificationHandler(
      'notifications/resources/list_changed',
      async (notification) => {
        await syncResourcesInOrder();
        if (mcp.isConnected())
          await mcp.server.notification(proxyNotification(notification));
      },
    );
    client.setNotificationHandler(
      'notifications/resources/updated',
      async (notification) => {
        if (mcp.isConnected())
          await mcp.server.notification(proxyNotification(notification));
      },
    );
  }

  return { server: mcp, syncAll: resyncAll, wireNotifications };
}
