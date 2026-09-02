import type { McpServer } from '@modelcontextprotocol/server';
import {
  findResultSchema,
  findSchema,
  updatedResultSchema,
  updateNodeSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';

/**
 * runtime 会按节点类型静默跳过的字段 → 适用类型(与 core/update.ts 的显式类型
 * gate 保持同步)。仅收录类型 gate 字段;'in' 守卫类字段各类型普遍存在,不收录,
 * 避免误报"未生效"。extraContent 用它把「请求了但没生效」的属性点名给调用方。
 */
const PROP_APPLICABILITY: Record<string, readonly string[]> = {
  pointCount: ['POLYGON', 'STAR'],
  innerRadius: ['STAR'],
  arcData: ['ELLIPSE'],
  characters: ['TEXT'],
  fontSize: ['TEXT'],
  fontName: ['TEXT'],
  textAlignHorizontal: ['TEXT'],
  textAlignVertical: ['TEXT'],
  textAutoResize: ['TEXT'],
  textCase: ['TEXT'],
  textDecoration: ['TEXT'],
  lineHeight: ['TEXT'],
  letterSpacing: ['TEXT'],
  textTruncation: ['TEXT'],
  maxLines: ['TEXT'],
  layoutMode: ['FRAME'],
  itemSpacing: ['FRAME'],
  paddingTop: ['FRAME'],
  paddingRight: ['FRAME'],
  paddingBottom: ['FRAME'],
  paddingLeft: ['FRAME'],
  primaryAxisSizingMode: ['FRAME'],
  counterAxisSizingMode: ['FRAME'],
  primaryAxisAlignItems: ['FRAME'],
  counterAxisAlignItems: ['FRAME'],
  cornerRadius: [
    'FRAME',
    'RECTANGLE',
    'ELLIPSE',
    'POLYGON',
    'STAR',
    'VECTOR',
    'BOOLEAN_OPERATION',
  ],
  cornerSmoothing: [
    'FRAME',
    'RECTANGLE',
    'ELLIPSE',
    'POLYGON',
    'STAR',
    'VECTOR',
    'BOOLEAN_OPERATION',
  ],
  topLeftRadius: ['FRAME', 'RECTANGLE'],
  topRightRadius: ['FRAME', 'RECTANGLE'],
  bottomLeftRadius: ['FRAME', 'RECTANGLE'],
  bottomRightRadius: ['FRAME', 'RECTANGLE'],
};

/** 修改类:选中属性修改 + 节点查找 */
export function registerModifyTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const updateNode = bridgeTool({
    name: 'jsd_update_node',
    title: '修改节点属性',
    description: `按 id 批量修改节点属性(位置/尺寸/填充/文本/效果等,字段见 inputSchema,写错键名会直接报错);ids 缺省作用于当前选中;与目标节点类型不匹配的属性会被忽略并在结果中点名。结构操作(分组/删除/移动)用 jsd_manage_nodes。
⚠ 已知平台缺陷(实测):对 INSTANCE 子文字节点(Instance:<实例id>;<原id>)改 fills/fontName 时,返回回显是新值但画布/导出渲染仍是组件原样式(引擎静默丢弃);characters 内容、形状节点 strokes、文字 visible 的覆盖正常。需要实例级文字颜色/字重差异时,用静态节点重建。`,
    method: 'update_node',
    inputSchema: updateNodeSchema,
    outputSchema: updatedResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
    // 多 id 反馈:点名「请求了但没更新」的节点(引擎静默跳过失效 id,需要显式提示)
    extraContent: (data, args) => {
      const ids = (args.ids as string[] | undefined) ?? [];
      const updated =
        (data as { updated: { id: string; type?: string }[] }).updated ?? [];
      const blocks: { type: 'text'; text: string }[] = [];
      if (updated.length > 0)
        blocks.push({ type: 'text', text: `已更新 ${updated.length} 个节点` });
      // 类型不匹配的属性被 runtime 静默跳过,这里显式点名,避免调用方误以为生效
      const props = (args.props ?? {}) as Record<string, unknown>;
      const requested = Object.keys(props).filter(
        (k) => props[k] !== undefined,
      );
      if (updated.length > 0 && requested.length === 0) {
        blocks.push({ type: 'text', text: 'props 为空,本次未修改任何属性' });
      } else if (updated.length > 0 && requested.length > 0) {
        const skipped = requested.filter((k) => {
          const applicable = PROP_APPLICABILITY[k];
          return (
            applicable != null &&
            !updated.some((n) => n.type != null && applicable.includes(n.type))
          );
        });
        if (skipped.length > 0) {
          blocks.push({
            type: 'text',
            text: `以下属性与目标节点类型不匹配,已被忽略:${skipped
              .map((k) => `${k}(仅适用于 ${PROP_APPLICABILITY[k].join('/')})`)
              .join('、')}`,
          });
        }
      }
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
      '在当前页面查找节点:ids 精确匹配优先,name 模糊,type 过滤;返回序列化节点列表(最多 100 条)。大区域查询先 depth:0 拿节点清单,再按 ids/name 定向小范围查,避免大响应被截断丢尾部节点 id',
    method: 'find',
    inputSchema: findSchema,
    outputSchema: findResultSchema,
    annotations: { readOnlyHint: true },
  });

  return [updateNode(server, bridge), find(server, bridge)];
}
