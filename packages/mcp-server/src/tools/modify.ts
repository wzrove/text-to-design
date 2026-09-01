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
    // 多 id 反馈:点名「请求了但没更新」的节点(引擎静默跳过失效 id,需要显式提示)
    extraContent: (data, args) => {
      const ids = (args.ids as string[] | undefined) ?? [];
      const updated = (data as { updated: { id: string }[] }).updated ?? [];
      const blocks: { type: 'text'; text: string }[] = [];
      if (updated.length > 0)
        blocks.push({ type: 'text', text: `已更新 ${updated.length} 个节点` });
      if (ids.length > 0) {
        const got = new Set(updated.map((n) => n.id));
        const missing = ids.filter((id) => !got.has(id));
        if (missing.length > 0) {
          blocks.push({
            type: 'text',
            text: `以下节点未更新(可能已失效/被连坐删除): ${missing.join(', ')}。可用 jsd_find 复核后重试`,
          });
        }
      }
      return blocks;
    },
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
