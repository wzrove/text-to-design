import type { McpServer } from '@modelcontextprotocol/server';
import type { Bridge } from '../bridge';
import { registerCreateTools } from './create';
import { registerManageTools } from './manage';
import { registerModifyTools } from './modify';
import { registerPlatformTools } from './platform';
import { registerRawTools } from './raw';
import { registerSessionTools } from './session';

/** 单个工具组的注册签名 */
export type RegisterTool = (server: McpServer, bridge: Bridge) => void;

export const toolRegistrars: RegisterTool[] = [
  registerSessionTools,
  registerCreateTools,
  registerModifyTools,
  registerManageTools,
  registerRawTools,
  registerPlatformTools,
];
