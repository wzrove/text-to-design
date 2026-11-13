/**
 * 兼容导出面:拆分前的旧入口。
 *
 * 定义本体已分到 tool-def(类型)/ tool-exec(执行体)/ schema-error(入参报错改写),
 * 这里只为既有 import 路径保一个稳定门面;新增代码请直接 import 对应模块。
 */
export { describeInvalidArgs } from './schema-error';
export {
  type BatchContext,
  type BridgeToolDef,
  type ExecutorOptions,
  type ToolCtx,
  type ToolExecutor,
  type ToolHandle,
  type ToolHook,
  type ToolHookFactory,
  type ToolHints,
  type ToolTag,
} from './tool-def';
export { bridgeTool, executorNames, lookupExecutor } from './tool-exec';
export type { FollowUp } from './response';
