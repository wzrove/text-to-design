import type { McpServer } from '@modelcontextprotocol/server';
import {
  moveNodeSchema,
  renameNodeSchema,
  resizeNodeSchema,
  setCornerRadiusSchema,
  setEffectsSchema,
  setFillColorSchema,
  setLayoutSchema,
  setShapeSchema,
  setStrokeSchema,
  setTextSchema,
  setVisibilitySchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';
import { propUpdateTool } from './update-common';

/**
 * 属性操作:从 jsd_update_node 的 50 键大表拆出的单职责工具,每个只负责一组字段。
 * 聚合入口 jsd_update_node 已删除;原长尾字段(pointCount/innerRadius)由 jsd_set_shape 承接。
 * 每个工具结果带 followUp 引导下一步(参照 server.ts)。
 */
export function registerPropTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const defs = [
    propUpdateTool({
      name: 'jsd_set_fill_color',
      title: '设置填充',
      description: `设置填充色/渐变(fills 为 Paint 数组,整体替换非合并,需保留的现有填充项要一并传入)、混合模式与团队库填充样式。⚠ 已知平台缺陷(实测):对 INSTANCE 子文字节点(Instance:<实例id>;<原id>)改 fills 时,返回回显是新值但画布/导出渲染仍是组件原样式(引擎静默丢弃);需要实例级文字颜色差异时用静态节点重建`,
      method: 'set_fill',
      inputSchema: setFillColorSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_stroke',
        description: '接着设置描边',
      },
    }),
    propUpdateTool({
      name: 'jsd_set_stroke',
      title: '设置描边',
      description:
        '设置描边列表、宽度(可四边分开)、对齐/端点/连接、虚线模式与团队库描边样式。strokes 整体替换非合并。把描边烘焙成矢量用 jsd_outline_stroke',
      method: 'set_stroke',
      inputSchema: setStrokeSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_fill_color',
        description: '接着设置填充',
      },
    }),
    propUpdateTool({
      name: 'jsd_set_cornerRadius',
      title: '设置圆角',
      description:
        '设置圆角半径(corners 四角可分开)与圆角平滑度。仅 FRAME/RECTANGLE/ELLIPSE/POLYGON/STAR/VECTOR/BOOLEAN_OPERATION 生效,LINE/TEXT 无圆角',
      method: 'set_corner_radius',
      inputSchema: setCornerRadiusSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_effects',
        description: '接着设置阴影/模糊效果',
      },
    }),
    propUpdateTool({
      name: 'jsd_set_text',
      title: '修改文本',
      description: `修改文本内容与排版(仅 TEXT 节点生效):characters/fontSize/fontName/对齐/自适应/大小写/装饰/行高/字距,以及 Figma 的截断与最大行数。字体需精确匹配,建议先 jsd_list_fonts 查可用字体(不可用时静默回退默认)。⚠ 已知平台缺陷(实测):对 INSTANCE 子文字节点改 fontName 时返回回显是新值但渲染仍是组件原样式;characters 内容覆盖正常`,
      method: 'set_text',
      inputSchema: setTextSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_rename_node',
        description: '给文本起个语义名称',
      },
    }),
    propUpdateTool({
      name: 'jsd_move_node',
      title: '移动节点',
      description:
        '设置节点 x/y(相对父节点)与 rotation(绕左上角原点)。auto-layout 子节点的位置由父容器接管,修改可能被布局覆盖——那种情况请改 jsd_set_layout 的间距/对齐',
      method: 'move',
      inputSchema: moveNodeSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_resize_node',
        description: '接着调整尺寸',
      },
    }),
    propUpdateTool({
      name: 'jsd_resize_node',
      title: '调整节点尺寸',
      description:
        '设置节点 width/height。TEXT 默认自适应(WIDTH_AND_HEIGHT)时会覆盖显式尺寸,要固定文本框先 jsd_set_text 设 textAutoResize=NONE',
      method: 'resize',
      inputSchema: resizeNodeSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_visibility',
        description: '接着设置可见性/锁定',
      },
    }),
    propUpdateTool({
      name: 'jsd_set_layout',
      title: '设置自动布局',
      description:
        '设置 FRAME 的 auto-layout:layoutMode 与 itemSpacing/padding*/主轴交叉轴尺寸和对齐/约束/伸缩可在同一次调用里一起传(引擎先应用 layoutMode 再应用间距)。建议建节点时不要混着传,归组并摆好后再单独设',
      method: 'set_layout',
      inputSchema: setLayoutSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_reparent_nodes',
        description: '把子节点移入容器完成排布',
      },
    }),
    propUpdateTool({
      name: 'jsd_set_effects',
      title: '设置效果与高级属性',
      description:
        '设置阴影/模糊效果(可多层叠加,整体替换)、团队库效果样式、溢出裁剪、布局网格(参考线)与椭圆环形参数(仅 ELLIPSE)',
      method: 'set_effects',
      inputSchema: setEffectsSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_visibility',
        description: '接着设置可见性/锁定',
      },
    }),
    propUpdateTool({
      name: 'jsd_set_visibility',
      title: '设置可见性与锁定',
      description:
        '设置不透明度 opacity(0-1)、visible 显示开关与 locked 锁定。锁定后节点不能被选中或编辑',
      method: 'set_visibility',
      inputSchema: setVisibilitySchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_get_selection',
        description: '复核改动后的画布选中',
      },
    }),
    propUpdateTool({
      name: 'jsd_rename_node',
      title: '重命名节点',
      description:
        '重命名节点。命名建议说明用途(如「登录页/邮箱输入/主按钮」),不用「矩形 1」「Frame 2」;批量替换文案用 jsd_set_text',
      method: 'rename',
      inputSchema: renameNodeSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_text',
        description: '接着改文本内容/排版',
      },
    }),
    propUpdateTool({
      name: 'jsd_set_shape',
      title: '设置多边形/星形形状',
      description:
        '设置形状参数(承接原 jsd_update_node 的长尾字段):pointCount 多边形/星形角点数(仅 POLYGON/STAR 生效)、innerRadius 星形内半径比例(0-1,仅 STAR 生效)。改尺寸/圆角用 jsd_resize_node / jsd_set_cornerRadius',
      method: 'set_shape',
      inputSchema: setShapeSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_fill_color',
        description: '接着设置填充',
      },
    }),
  ];
  return defs.map((d) => bridgeTool(d)(server, bridge));
}
