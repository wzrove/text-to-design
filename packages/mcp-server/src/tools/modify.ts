import type { McpServer } from '@modelcontextprotocol/server';
import {
  findResultSchema,
  findSchema,
  updatedResultSchema,
  updateNodeSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { err, structured } from '../core/response';

/** 修改类:选中属性修改 + 节点查找 */
export function registerModifyTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'jsd_update_node',
    {
      description: `按 id 修改节点属性(位置/尺寸/填充/文本/效果等)。

参数说明:
- ids:指定要修改的节点 id 列表(优先级高于当前选中)
- matchName:在 ids 范围内进一步过滤,仅修改 name 精确匹配的节点
- recursive:是否递归应用到子节点
- props:要修改的属性对象,字段与枚举以 inputSchema 为准

注意:结构操作(分组/删除/移动)请用 jsd_manage_nodes。`,
      inputSchema: updateNodeSchema,
      outputSchema: updatedResultSchema,
    },
    async ({ ids, matchName, recursive, props }) => {
      try {
        const data = await bridge.request('update_node', {
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
        '在当前页面查找节点,可按 ids 精确查找(优先级最高)/名称模糊匹配/类型过滤,返回序列化节点列表(最多 100 条)',
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
