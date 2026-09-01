import type { McpServer } from '@modelcontextprotocol/server';
import type { PluginMethod } from 'text-to-design-shared';
import type { z } from 'zod';
import type { Bridge } from '../bridge';
import { error } from '../logger';
import type { RequestOptions } from '../pending';
import { err, structured } from './response';

/** 注册函数返回的工具句柄(结构化最小类型,兼容 SDK RegisteredTool/Prompt/Resource) */
export interface ToolHandle {
  enable(): void;
  disable(): void;
  /** 插件离线时保持可用(如 jsd_ping);由注册方按需注入 */
  alwaysEnabled?: boolean;
}

/** MCP ToolAnnotations 的子集(hint 均为可选) */
export interface ToolHints {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** 工具回调拿到的请求上下文(只声明用到的字段;SDK 会传入完整 ServerContext) */
export interface ToolCtx {
  mcpReq: { signal: AbortSignal };
}

/**
 * 可编程执行体签名:给定已解析的入参直接执行工具(含统一 try/catch 兜底)。
 * MCP 工具回调内部委托它;jsd_batch 编排按键直调,绕开 MCP 往返。
 */
export type ToolExecutor = (
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
) => Promise<unknown>;

/** 工具名 → 执行体(daemon 单进程多会话共享;重复注册以后者为准,行为一致) */
const executors = new Map<string, ToolExecutor>();

/** 按名查找执行体;未注册工具返回 undefined */
export function lookupExecutor(name: string): ToolExecutor | undefined {
  return executors.get(name);
}

/** 全部已注册工具名(排序;jsd_batch 报错提示用) */
export function executorNames(): string[] {
  return [...executors.keys()].sort();
}

export interface BridgeToolDef {
  name: string;
  title: string;
  description: string;
  /** 插件端方法名;与 run 二选一 */
  method?: PluginMethod;
  inputSchema?: z.ZodType;
  outputSchema: z.ZodType;
  annotations?: ToolHints;
  /** 超时毫秒数;缺省用 PendingManager 默认(30s) */
  timeout?: number;
  /** 插件离线时保持可用(如 jsd_ping);默认随连接状态 enable/disable */
  alwaysEnabled?: boolean;
  /** args → 插件 params 映射;缺省恒等透传 */
  payload?: (args: Record<string, unknown>) => unknown;
  /**
   * 完全自定义执行(有前置逻辑的工具用,如图标解析/导出落盘/读文件)。
   * 给出时忽略 method/payload。抛错走 err() 统一兜底。
   */
  run?: (
    args: Record<string, unknown>,
    bridge: Bridge,
    signal: AbortSignal,
  ) => Promise<unknown>;
  /**
   * 成功响应的附加文本块(置于结构化 JSON 文本之前),用于进度/汇总/逐条失败提示。
   * 典型用例:多 id 操作对比「请求的 ids」与返回结果,点名未命中的节点。
   */
  extraContent?: (
    data: unknown,
    args: Record<string, unknown>,
  ) => { type: 'text'; text: string }[];
}

/**
 * 声明式工具工厂:统一 try/catch → structured/err 兜底、超时分级、
 * annotations、客户端取消(signal)传播。返回注册函数,产出工具句柄
 * (供插件离线时动态 disable)。
 */
export function bridgeTool(
  def: BridgeToolDef,
): (server: McpServer, bridge: Bridge) => ToolHandle {
  return (server: McpServer, bridge: Bridge): ToolHandle => {
    // 边界处单点转型:SDK 的泛型重载无法穿透本工厂推断 zod schema,
    // 运行时调用形状与直接 registerTool 完全一致
    type RegisterFn = (
      name: string,
      config: {
        title?: string;
        description?: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
        annotations?: unknown;
      },
      cb: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown>,
    ) => ToolHandle;
    const register = server.registerTool.bind(server) as unknown as RegisterFn;
    // 可编程执行体:MCP 回调与 jsd_batch 编排共用(统一兜底/超时/取消传播)
    const executeTool: ToolExecutor = async (args, signal) => {
      try {
        // 入参 schema 校验:直接 MCP 调用已由 SDK validateToolInput 校验过(幂等,
        // 成本可忽略),这里补齐 jsd_batch 直调 executor 的路径——内层工具的
        // inputSchema 不生效,坏载荷(颜色带 a / 0-255 / 渐变带 color / 缺
        // blendMode 等)会原样穿透到引擎抛 in set_fills/set_effects。
        if (def.inputSchema != null) {
          const parsed = def.inputSchema.safeParse(args);
          if (!parsed.success) {
            const detail = parsed.error.issues
              .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('; ');
            throw new Error(`参数校验失败(${def.name}): ${detail}`);
          }
          args = parsed.data as Record<string, unknown>;
        }
        const opts: RequestOptions = {
          ...(signal != null ? { signal } : {}),
          ...(def.timeout != null ? { timeout: def.timeout } : {}),
        };
        let data: unknown;
        if (def.run) {
          data = await def.run(
            args,
            bridge,
            signal ?? new AbortController().signal,
          );
        } else {
          data = await bridge.request(
            def.method as PluginMethod,
            def.payload ? def.payload(args) : args,
            opts,
          );
        }
        return structured(
          data,
          def.outputSchema,
          def.extraContent ? def.extraContent(data, args) : undefined,
        );
      } catch (e) {
        // 可观测性:插件执行期错误(如引擎校验失败)落日志,便于排查。
        // 注意:入参 schema 校验失败发生在 SDK 内部(validateToolInput),
        // 不经过本回调,无法在此记录 —— 该类错误只体现在返回给客户端的
        // isError 文本中
        const msg = e instanceof Error ? e.message : String(e);
        error(`工具 ${def.name} 执行失败: ${msg.slice(0, 200)}`);
        return err(e, def.outputSchema);
      }
    };
    // daemon 单进程内同名工具重复注册以后者为准(行为一致)
    executors.set(def.name, executeTool);
    const handle = register(
      def.name,
      {
        title: def.title,
        description: def.description,
        ...(def.inputSchema ? { inputSchema: def.inputSchema } : {}),
        outputSchema: def.outputSchema,
        ...(def.annotations ? { annotations: def.annotations } : {}),
      },
      // 注意:SDK 对「无 inputSchema」的工具会以 callback(ctx) 形态调用
      // (ctx 作为唯一入参),有 inputSchema 时才是 callback(args, ctx)。
      // 这里统一兼容两种形态,避免 ctx 误位。
      async (...cbArgs: unknown[]) => {
        const hasInput = def.inputSchema != null;
        const first = cbArgs[0] as Record<string, unknown> | undefined;
        const second = cbArgs[1] as ToolCtx | undefined;
        const args: Record<string, unknown> = hasInput ? (first ?? {}) : {};
        const ctx = (hasInput ? second : first) as ToolCtx | undefined;
        const signal =
          ctx?.mcpReq?.signal ??
          (ctx as unknown as { signal?: AbortSignal } | undefined)?.signal;
        return executeTool(args, signal);
      },
    );
    handle.alwaysEnabled = def.alwaysEnabled ?? false;
    return handle;
  };
}
