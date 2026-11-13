import type { Icon, McpServer } from '@modelcontextprotocol/server';
import type { PluginMethod, PluginPlatform } from 'text-to-design-shared';
import type { z } from 'zod';
import type { Bridge } from '../bridge';
import type { FollowUp } from './response';

/**
 * 注册函数返回的工具句柄(结构化最小类型,兼容 SDK 的 RegisteredTool / prompt / resource)。
 * 曾带 enable/disable/alwaysEnabled —— 目录自连接门控取消后不再动态收放,三者已无消费方。
 */
export type ToolHandle = object;

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
export type ToolHookFactory = (server: McpServer) => ToolHook;

/**
 * MCP ToolAnnotations(2026-07-28)。**四个 hint 全部必填**:协议对每个 hint 都有缺省值
 * (`readOnlyHint=false` / `destructiveHint=true` / `idempotentHint=false` /
 * `openWorldHint=true`),不显式声明就等于让客户端按保守默认去猜 —— 后果是「只读工具
 * 被当成会动数据」「幂等 setter 被当成不可重试的破坏性操作」。必填由类型守住:
 * 新增工具不写注解过不了类型检查,不靠人记。
 */
export interface ToolHints {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** 工具回调拿到的请求上下文(只声明用到的字段;SDK 会传入完整 ServerContext) */
export interface ToolCtx {
  mcpReq: { signal: AbortSignal };
}

/**
 * 本步在 jsd_batch 里的位置。只给**判据在本批内**的工具用(见 core/structure-hint.ts):
 * 单步执行体看不见「这批还有几步进同一个父级」,模型也看不见(它只写 args)。
 */
export interface BatchContext {
  /** 本批同工具、同父级(parentId)下的步骤数 —— **含本步** */
  siblingSteps?: number;
}

/** 单次调用的选项:「本次不跑横切钩子」(jsd_batch 的 checkDrift=false)+ 批次上下文 */
export interface ExecutorOptions {
  skipHooks?: boolean;
  batch?: BatchContext;
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

export interface BridgeToolDef {
  name: string;
  title: string;
  /**
   * 模型可见描述,**整体一个键或一段成品文案**,注册期原样下发、不再查表。
   * 所以「裸中文」只能整段写进本字段(拼出来的串查不到表,见 0016);
   * 需要给键追加平台差异句时用 descriptionSuffix,别把两段拼成一个键。
   */
  description: string;
  /** 插件端方法名;与 run 二选一 */
  method?: PluginMethod;
  inputSchema?: z.ZodType;
  outputSchema: z.ZodType;
  /** 四个 hint 全部必填(见 ToolHints) */
  annotations: ToolHints;
  /**
   * 目录图标(协议 Icon[])。缺省按工具名前缀自动分类(见 core/tool-icons.ts);
   * 只有个别工具需要脱离族图标时才在这里显式给。
   */
  icons?: readonly Icon[];
  /** 超时毫秒数;缺省用 PendingManager 默认(30s) */
  timeout?: number;
  /**
   * 适用平台(缺省=两平台通用)。平台状态已缓存且不含当前平台时,调用直接返回
   * 结构化错误,不向插件发起往返(目录仍保持全量,见 server.ts 的目录稳定说明)。
   */
  platforms?: readonly PluginPlatform[];
  /** 同 registry 的 descriptionSuffix(本文件是它的孪生定义,两边须一致) */
  descriptionSuffix?: string;
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
    /** 批次上下文:只有 jsd_batch 内层调用才有(单发调用为 undefined) */
    opts?: ExecutorOptions,
  ) => { type: 'text'; text: string }[];
  /** 工具结果的 followUp 引导(指向推荐的下一个工具/prompt);有则注入结果 followUp 字段 */
  followUp?: FollowUp;
  /** 语义标记(见 ToolTag):横切逻辑据此决定是否对该工具生效 */
  tags?: readonly ToolTag[];
  /** 横切钩子工厂;每次调用新建实例(见 ToolHook) */
  hook?: ToolHookFactory;
}
