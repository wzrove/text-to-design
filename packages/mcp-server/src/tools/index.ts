import type { McpServer } from '@modelcontextprotocol/server';
import type { Bridge } from '../bridge';
import type { ToolHandle } from '../core/registry';
import { registerCreateTools } from './create';
import { registerManageTools } from './manage';
import { registerModifyTools } from './modify';
import { registerPlatformTools } from './platform';
import { registerRawTools } from './raw';
import { registerSessionTools } from './session';

/** 单个工具组的注册签名:返回句柄供连接状态联动 enable/disable */
export type RegisterTools = (server: McpServer, bridge: Bridge) => ToolHandle[];

export const toolRegistrars: RegisterTools[] = [
  registerSessionTools,
  registerCreateTools,
  registerModifyTools,
  registerManageTools,
  registerRawTools,
  registerPlatformTools,
];
