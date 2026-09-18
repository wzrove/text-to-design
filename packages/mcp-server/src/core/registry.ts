import type { McpServer } from '@modelcontextprotocol/server';
import type { PluginMethod, PluginPlatform } from 'text-to-design-shared';
import type { z } from 'zod';
import type { Bridge } from '../bridge';
import { error, warn } from '../logger';
import type { RequestOptions } from '../pending';
import { describePlatformGate } from '../platform-state';
import { err, structured } from './response';

/** 注册函数返回的工具句柄(结构化最小类型,兼容 SDK RegisteredTool/Prompt/Resource) */
export interface ToolHandle {
  enable(): void;
  disable(): void;
  /** 语义标记:该工具在插件离线时也应可用(如 jsd_ping);目录已不随连接门控 */
  alwaysEnabled?: boolean;
}

/**
 * 工具语义标记。横切逻辑(如结构变更后的漂移复核)按 tag 决定是否生效,
 * 不再各处手抄工具名清单 —— 那份清单与 tools/nodes.ts 的 opTool 是两份事实。
 */
export type ToolTag = 'structural' | 'destructive';

/**
 * 工具级横切钩子:**每次调用新建一份**,因此钩子内部可以持有本次调用的状态
 * (典型如「变更前的快照」)。不是单例 —— 单例会把上一次调用的状态带给下一次。
 *
 * 钩子抛错只能降级为一行 warning,绝不能让工具本身失败:它是尽力而为的复核,
 * 不是业务步骤。
 */
export interface ToolHook {
  /** 派发到插件之前 */
  before?(args: Record<string, unknown>): Promise<void> | void;
  /** 派发成功之后;返回追加到结果里的文本块 */
  after?(
    args: Record<string, unknown>,
    data: unknown,
  ): Promise<string[]> | string[];
}

/** 钩子工厂:每次调用产出一个新实例 */
export type ToolHookFactory = () => ToolHook;

/** MCP ToolAnnotations 的子集(hint 均为可选) */
export interface ToolHints {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * 工具结果的 followUp 引导(参照 server.ts 参考实现,MCP 协议结果字段):
 * 指向推荐的下一个 prompt 或下一个 tool,结果带该字段即提示调用方继续哪一步。
 */
export type FollowUp =
  | { type: 'prompt'; prompt: string }
  | { type: 'tool'; tool: string; description?: string };

/** 工具回调拿到的请求上下文(只声明用到的字段;SDK 会传入完整 ServerContext) */
export interface ToolCtx {
  mcpReq: { signal: AbortSignal };
}

/** 单次调用的选项:目前只有「本次不跑横切钩子」(jsd_batch 的 checkDrift=false) */
export interface ExecutorOptions {
  skipHooks?: boolean;
}

/**
 * 可编程执行体签名:给定已解析的入参直接执行工具(含统一 try/catch 兜底)。
 * MCP 工具回调内部委托它;jsd_batch 编排按键直调,绕开 MCP 往返。
 */
export type ToolExecutor = (
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  opts?: ExecutorOptions,
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
  /** 语义标记:该工具在插件离线时也应可用(如 jsd_ping);目录已不随连接门控 */
  alwaysEnabled?: boolean;
  /**
   * 适用平台(缺省=两平台通用)。平台状态已缓存且不含当前平台时,调用直接返回
   * 结构化错误,不向插件发起往返(目录仍保持全量,见 server.ts 的目录稳定说明)。
   */
  platforms?: readonly PluginPlatform[];
  /** 平台差异说明:注册时拼进描述末尾;平台不适用时也用作替代路径提示 */
  platformNote?: string;
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
  /** 工具结果的 followUp 引导(指向推荐的下一个工具/prompt);有则注入结果 followUp 字段 */
  followUp?: FollowUp;
  /** 语义标记(见 ToolTag):横切逻辑据此决定是否对该工具生效 */
  tags?: readonly ToolTag[];
  /** 横切钩子工厂;每次调用新建实例(见 ToolHook) */
  hook?: ToolHookFactory;
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
    const executeTool: ToolExecutor = async (args, signal, opts) => {
      try {
        // 平台门控:平台状态已缓存且本工具不适用时,直接给结构化错误(含替代路径),
        // 不向插件发起往返 —— 插件侧同样会拒绝,但报错更晚也更含糊。平台未知放行。
        const gate = describePlatformGate(def);
        if (gate != null) {
          error(`工具 ${def.name} 在当前平台不可用,已拦截`);
          return err(new Error(gate), def.outputSchema, def.followUp);
        }
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
        const requestOpts: RequestOptions = {
          ...(signal != null ? { signal } : {}),
          ...(def.timeout != null ? { timeout: def.timeout } : {}),
        };
        // 横切钩子:每次调用新建一份(钩子内部要按本次调用记账)。
        // 钩子只做尽力而为的复核,抛错一律降级为 warning,不能让工具失败。
        // checkDrift=false 之类的「本次不复核」是**按调用**生效的:钩子工厂本身
        // 仍在 def 上,只是这一次不实例化 —— 不是把开关塞进全局。
        const hook = opts?.skipHooks === true ? undefined : def.hook?.();
        if (hook?.before != null) {
          try {
            await hook.before(args);
          } catch (e) {
            warn(
              `工具 ${def.name} 的前置钩子失败(已忽略): ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
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
            requestOpts,
          );
        }
        const extra = def.extraContent ? def.extraContent(data, args) : [];
        // 钩子产出的告警同时走两条通道:① 人读文本块(单工具调用时直接可见);
        // ② 结果上的 warnings 字段 —— jsd_batch 逐步骤收集后汇总,否则编排里
        // 只看 structuredContent,这些告警会被静默丢掉。
        const warnings: string[] = [];
        if (hook?.after != null) {
          try {
            const lines = (await hook.after(args, data)) ?? [];
            for (const line of lines) {
              warnings.push(line);
              extra.push({ type: 'text', text: line });
            }
          } catch (e) {
            const line = `⚠ 工具 ${def.name} 的后置钩子失败(不影响本次结果): ${e instanceof Error ? e.message : String(e)}`;
            warnings.push(line);
            extra.push({ type: 'text', text: line });
          }
        }
        const result = structured(
          data,
          def.outputSchema,
          extra.length > 0 ? extra : undefined,
          def.followUp,
        );
        return warnings.length > 0 ? { ...result, warnings } : result;
      } catch (e) {
        // 可观测性:插件执行期错误(如引擎校验失败)落日志,便于排查。
        // 注意:入参 schema 校验失败发生在 SDK 内部(validateToolInput),
        // 不经过本回调,无法在此记录 —— 该类错误只体现在返回给客户端的
        // isError 文本中
        const msg = e instanceof Error ? e.message : String(e);
        error(`工具 ${def.name} 执行失败: ${msg.slice(0, 200)}`);
        return err(e, def.outputSchema, def.followUp);
      }
    };
    // daemon 单进程内同名工具重复注册以后者为准(行为一致)
    executors.set(def.name, executeTool);
    const handle = register(
      def.name,
      {
        title: def.title,
        // platformNote 静态拼进描述:注册只在 buildServer 时执行一次,不随平台变化,
        // 具体"当前平台是否适用"由上面的执行期拦截与结果 warnings 表达
        description:
          def.platformNote != null
            ? `${def.description}${def.platformNote}`
            : def.description,
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
