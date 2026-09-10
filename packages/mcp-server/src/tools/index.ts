import type { McpServer } from '@modelcontextprotocol/server';
import type { Bridge } from '../bridge';
import type { ToolHandle } from '../core/registry';
import { registerBatchTools } from './batch';
import { registerComponentTools } from './components';
import { registerCreateTools } from './create';
import { registerManageTools } from './manage';
import { registerModifyTools } from './modify';
import { registerNodeOpTools } from './nodes';
import { registerPlatformTools } from './platform';
import { registerPrompts } from './prompts';
import { registerPropTools } from './props';
import { registerRawTools } from './raw';
import { registerResources } from './resources';
import { registerSessionTools } from './session';

/** 单个工具组的注册签名:返回句柄供连接状态联动 enable/disable */
export type RegisterTools = (server: McpServer, bridge: Bridge) => ToolHandle[];

export const toolRegistrars: RegisterTools[] = [
  registerSessionTools,
  registerCreateTools,
  registerModifyTools,
  // 从聚合入口拆出的单职责小工具(节点结构 / 组件 / 属性)
  registerNodeOpTools,
  registerComponentTools,
  registerPropTools,
  registerManageTools,
  registerRawTools,
  // 编排器依赖其它工具的执行体注册表,放在功能组之后注册
  registerBatchTools,
  registerPlatformTools,
  registerResources,
  // 配方 prompt 不依赖插件连接,恒可用
  (server) => registerPrompts(server),
];
