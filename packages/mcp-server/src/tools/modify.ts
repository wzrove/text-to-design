import type { McpServer } from '@modelcontextprotocol/server';
import {
  findResultSchema,
  findSchema,
  updatedResultSchema,
  updateNodeSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';

/** 修改类:选中属性修改 + 节点查找 */
export function registerModifyTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const updateNode = bridgeTool({
    name: 'jsd_update_node',
    title: '修改节点属性',
    description: `按 id 批量修改节点属性(位置/尺寸/填充/文本/效果等,字段见 inputSchema);ids 缺省作用于当前选中。结构操作(分组/删除/移动)用 jsd_manage_nodes。`,
    method: 'update_node',
    inputSchema: updateNodeSchema,
    outputSchema: updatedResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  });

  const find = bridgeTool({
    name: 'jsd_find',
    title: '查找节点',
    description:
      '在当前页面查找节点:ids 精确匹配优先,name 模糊,type 过滤;返回序列化节点列表(最多 100 条)',
    method: 'find',
    inputSchema: findSchema,
    outputSchema: findResultSchema,
    annotations: { readOnlyHint: true },
  });

  return [updateNode(server, bridge), find(server, bridge)];
}
