import type { McpServer } from '@modelcontextprotocol/server';
import {
  findResultSchema,
  findSchema,
  updatedResultSchema,
  updateSelectionSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { err, structured } from '../core/response';

/** 修改类:选中属性修改 + 节点查找 */
export function registerModifyTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'jsd_update_selection',
    {
      description:
        '修改画布选中的节点(可用 ids 指定、matchName 按名过滤、recursive 递归子节点)。props 为要修改的属性对象,字段/枚举以 inputSchema 为准(枚举大小写不敏感)。',
      inputSchema: updateSelectionSchema,
      outputSchema: updatedResultSchema,
    },
    async ({ ids, matchName, recursive, props }) => {
      try {
        const data = await bridge.request('update_selection', {
          ids,
          matchName,
          recursive,
          props,
        });
        return structured(data, updatedResultSchema);
      } catch (e) {
        return err(e, updatedResultSchema);
      }
    },
  );

  server.registerTool(
    'jsd_find',
    {
      description:
        '在当前页面查找节点,可按名称/类型过滤,返回序列化节点列表(最多 100 条)',
      inputSchema: findSchema,
      outputSchema: findResultSchema,
    },
    async (params) => {
      try {
        const data = await bridge.request('find', params);
        return structured(data, findResultSchema);
      } catch (e) {
        return err(e, findResultSchema);
      }
    },
  );
}
