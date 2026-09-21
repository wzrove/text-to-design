import type { McpServer } from '@modelcontextprotocol/server';
import { findResultSchema, findSchema } from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';
import type { McpI18n } from '../i18n';

/**
 * 修改类:节点查找。属性修改已全部拆成 jsd_set_* 单属性小工具(props.ts),
 * 原聚合入口 jsd_update_node 已删除(长尾字段 pointCount/innerRadius 并入
 * jsd_set_shape)。
 */
export function registerModifyTools(
  server: McpServer,
  bridge: Bridge,
  i18n: McpI18n,
): ToolHandle[] {
  const find = bridgeTool({
    name: 'jsd_find',
    title: 'find.title',
    description:
      '在当前页面查找节点:ids 精确匹配优先,name 模糊,type 过滤;返回序列化节点列表(最多 100 条)。scope:"document" 跨页全文档查找(触发一次全量页加载,大文档有一次性成本,结果 note 点名;默认 page 只查当前页)。⚠ 每个节点带 `z` = 它在父级 children 里的下标 = **绘制顺序**(0 = 最底层,越大越靠上);判断遮挡/层序读 z 即可,children 数组顺序与 z 一致。大区域查询先 depth:0 拿节点清单,再按 ids/name 定向小范围查,避免大响应被截断丢尾部节点 id',
    method: 'find',
    inputSchema: findSchema,
    outputSchema: findResultSchema,
    annotations: { readOnlyHint: true },
    followUp: {
      type: 'tool',
      tool: 'jsd_select_nodes',
      description: 'find.description',
    },
  });

  return [find(server, bridge, i18n)];
}
