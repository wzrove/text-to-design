import type { McpServer } from '@modelcontextprotocol/server';
import {
  getSelectionResultSchema,
  pingResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { CLIENT } from '../config';
import { err, structured } from '../core/response';

/** 会话类:连接探测 + 选中读取 */
export function registerSessionTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'jsd_ping',
    {
      description: `检查 ${CLIENT.runtime} 插件是否在线(需先启动插件并保持运行)`,
      outputSchema: pingResultSchema,
    },
    async () => {
      try {
        await bridge.request('ping', {});
        return structured({ connected: true });
      } catch (e) {
        return structured({
          connected: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );

  server.registerTool(
    'jsd_get_selection',
    {
      description: `获取${CLIENT.label}画布当前选中的节点信息(名称/类型/尺寸/位置/填充/文本/子树结构)`,
      outputSchema: getSelectionResultSchema,
    },
    async () => {
      try {
        const data = await bridge.request('get_selection', {});
        return structured(data, getSelectionResultSchema);
      } catch (e) {
        return err(e, getSelectionResultSchema);
      }
    },
  );
}
