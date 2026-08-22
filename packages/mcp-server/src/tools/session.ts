import type { McpServer } from '@modelcontextprotocol/server';
import {
  getSelectionResultSchema,
  pingResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { CLIENT, PING_TIMEOUT_MS } from '../config';
import { bridgeTool, type ToolHandle } from '../core/registry';

/** 会话类:连接探测 + 选中读取 */
export function registerSessionTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const ping = bridgeTool({
    name: 'jsd_ping',
    title: `检查 ${CLIENT.runtime} 插件连接`,
    description: `检查 ${CLIENT.runtime} 插件是否在线(需先启动插件并保持运行)`,
    outputSchema: pingResultSchema,
    annotations: { readOnlyHint: true },
    alwaysEnabled: true,
    timeout: PING_TIMEOUT_MS,
    run: async () => {
      try {
        const data = (await bridge.request(
          'ping',
          {},
          { timeout: PING_TIMEOUT_MS },
        )) as {
          pong?: boolean;
          platform?: unknown;
          capabilities?: unknown;
        };
        return {
          connected: true,
          platform: data?.platform,
          capabilities: data?.capabilities,
        };
      } catch (e) {
        return {
          connected: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  });

  const getSelection = bridgeTool({
    name: 'jsd_get_selection',
    title: '读取画布选中',
    description: `获取画布当前选中的节点信息(名称/类型/尺寸/位置/填充/文本/子树结构)。

可选 depth 参数控制序列化深度:0=仅自身,1=含直接子节点,2=含孙节点,默认 2。`,
    method: 'get_selection',
    outputSchema: getSelectionResultSchema,
    annotations: { readOnlyHint: true },
  });

  return [ping(server, bridge), getSelection(server, bridge)];
}
