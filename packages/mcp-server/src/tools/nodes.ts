import type { McpServer } from '@modelcontextprotocol/server';
import {
  cloneNodeSchema,
  deleteNodeSchema,
  flattenNodesSchema,
  groupNodesSchema,
  manageNodesResultSchema,
  type manageNodesSchema,
  outlineStrokeSchema,
  repairNodesSchema,
  reparentNodesSchema,
  selectNodesSchema,
  ungroupNodesSchema,
} from 'text-to-design-shared';
import type { z } from 'zod';
import type { Bridge } from '../bridge';
import {
  type BridgeToolDef,
  bridgeTool,
  type ToolHandle,
  type ToolHints,
} from '../core/registry';
import type { McpI18n } from '../i18n';
import { driftWatch, STRUCTURAL_NODE_OPS } from './drift-watch';

type NodeOpKind = z.infer<typeof manageNodesSchema>['op'];

type NodeOpDef = Pick<
  BridgeToolDef,
  | 'name'
  | 'title'
  | 'description'
  | 'inputSchema'
  | 'followUp'
  | 'platforms'
  | 'platformNote'
> & {
  annotations?: ToolHints;
};

/**
 * 构造「固定 op」工具定义:args 原样透传并注入 op 字面量,插件协议不变。
 *
 * 结构变更类 op 自动带上 `structural` tag 与漂移复核钩子 —— tag 与钩子的判定都来自
 * drift-watch 的 STRUCTURAL_NODE_OPS,这里不手抄名单。
 */
function opTool(op: NodeOpKind, rest: NodeOpDef): BridgeToolDef {
  const structural = STRUCTURAL_NODE_OPS.has(op);
  return {
    method: 'node_op',
    outputSchema: manageNodesResultSchema,
    payload: (args) => ({ op, ...args }),
    ...(structural ? { tags: ['structural'] as const, hook: driftWatch } : {}),
    ...rest,
  };
}

/**
 * 节点结构操作:从 jsd_manage_nodes 的 9 个 op 拆出的单职责工具。
 * 聚合入口 jsd_manage_nodes 保留(批量/混合场景),此处每个工具只管一件事。
 */
export function registerNodeOpTools(
  server: McpServer,
  bridge: Bridge,
  i18n: McpI18n,
): ToolHandle[] {
  const defs: BridgeToolDef[] = [
    opTool('select', {
      name: 'jsd_select_nodes',
      title: 'selectNodes.title',
      description:
        '把指定节点设为当前选中,后续不传 ids 的工具会作用于它们。只读类工具(jsd_get_selection/jsd_find)不用它——那些工具直接接受 ids',
      inputSchema: selectNodesSchema,
      followUp: {
        type: 'tool',
        tool: 'jsd_move_node',
        description: 'selectNodes.description',
      },
    }),
    opTool('remove', {
      name: 'jsd_delete_node',
      title: 'deleteNode.title',
      description:
        '删除节点(破坏性,仅编辑器 undo 可回退)。ids 缺省删当前选中;matchName 可在范围内再按 name 精确过滤。多个删除动作建议用 jsd_batch 串起来',
      inputSchema: deleteNodeSchema,
      annotations: { readOnlyHint: false, destructiveHint: true },
      followUp: {
        type: 'tool',
        tool: 'jsd_find',
        description: 'deleteNode.description',
      },
    }),
    opTool('clone', {
      name: 'jsd_clone_node',
      title: 'cloneNode.title',
      description:
        '复制节点,新副本右下偏移放置并返回新 id。注意:克隆 COMPONENT 得到的是 INSTANCE,不是可编辑副本;文本批量替换前先用它留安全底稿',
      inputSchema: cloneNodeSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_move_node',
        description: 'cloneNode.description',
      },
    }),
    opTool('group', {
      name: 'jsd_group_nodes',
      title: 'groupNodes.title',
      description:
        '把多个节点编组(内部用 Frame 实现),可同时设置 auto-layout(layoutMode/itemSpacing/padding*/主轴对齐);只归组不排布时 layoutMode=NONE。复杂结构建议先用 per-type create 工具(jsd_create_frame 等)平铺建好再编组',
      inputSchema: groupNodesSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_layout',
        description: 'groupNodes.description',
      },
    }),
    opTool('ungroup', {
      name: 'jsd_ungroup_nodes',
      title: 'ungroupNodes.title',
      description:
        '解散分组,子节点回到原父节点下(坐标变为相对新父,可能需要重新摆位)',
      // MasterGo 两级 API 都没有 ungroup(PluginAPI 与 GroupNode 都没有该符号,
      // 见 0017 的实测记录),宿主层无从实现 → 平台拒绝,不给「假成功」
      platforms: ['jsdesign', 'figma'],
      platformNote: '(MasterGo 未提供解组 API;该平台请改用拆分/重排替代)',
      inputSchema: ungroupNodesSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_move_node',
        description: 'ungroupNodes.description',
      },
    }),
    opTool('flatten', {
      name: 'jsd_flatten_nodes',
      title: 'flattenNodes.title',
      description:
        '把至少 2 个节点合并为单一矢量(破坏性,原节点层级消失),常用于把文本/图标烘焙成不可编辑图形',
      inputSchema: flattenNodesSchema,
      annotations: { readOnlyHint: false, destructiveHint: true },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_fill_color',
        description: 'flattenNodes.description',
      },
    }),
    opTool('outline_stroke', {
      name: 'jsd_outline_stroke',
      title: 'outlineStroke.title',
      description:
        '把描边转成轮廓矢量(几何被烘焙,原描边属性不再可改)。改描边颜色/宽度请用 jsd_set_stroke',
      inputSchema: outlineStrokeSchema,
      annotations: { readOnlyHint: false, destructiveHint: true },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_stroke',
        description: 'outlineStroke.description',
      },
    }),
    opTool('reparent', {
      name: 'jsd_reparent_nodes',
      title: 'reparentNodes.title',
      description:
        '把节点移入 parentId 成为其子节点,可指定插入位置。⚠ **实例不能当 parentId**:引擎直接拒(`in insertChild: Cannot move node. New parent is an instance or is inside of an instance`),往实例里加东西请先 jsd_detach_instance 拆链接。⚠ **parentId 请显式传**:缺省值取「当前选中里第一个不是被移动节点的节点」——当前选中为空或不含父容器时该值不可靠(会报「没有找到目标父节点」,或把节点误移进另一个被选中的节点下)。需要依赖缺省时的两种姿势:①先 jsd_select_nodes 选中目标容器;②只调层序 → 传 index 且 ids 里含被调整节点本身,此时缺省父级 = 该节点的原父级。⚠ 层序语义:index 是 children 数组下标(0 = 最底层),children 顺序即绘制顺序(末位 = 最上层),序列化里对应字段是 z —— 判断遮挡读 z,调层序就用本工具 + index。节点已在该父级下时本工具只调层序,x/y 不变;auto-layout 容器同样支持(index 会在内部临时关掉布局插入再恢复),若引擎没落位会明确报错并提示改 itemSpacing / 对齐。⚠ **跨父级移动保持节点绝对位置**:内部按页面系记账(移动前取绝对原点,移动后换算成新父下的 x/y),不要再按「相对系重新解释」手动摆回 —— 那会把节点推走。唯一例外是移入 auto-layout 容器:位置由布局接管,写 x/y 无效,想调排布改 itemSpacing / 对齐。确需手工定位(按坐标排布等)时用 jsd_resize_node 传 x/y(可与 width/height 一次改完)或 jsd_move_node',
      inputSchema: reparentNodesSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_move_node',
        description: 'reparentNodes.description',
      },
    }),
    opTool('repair', {
      name: 'jsd_repair_nodes',
      title: 'repairNodes.title',
      description:
        '清理已损坏节点(破坏性)。ids 缺省时清理当前页全部损坏节点;批量删除后报「没找到 X 节点」时先复核 jsd_find 再修',
      inputSchema: repairNodesSchema,
      annotations: { readOnlyHint: false, destructiveHint: true },
      followUp: {
        type: 'tool',
        tool: 'jsd_find',
        description: 'repairNodes.description',
      },
    }),
  ];
  return defs.map((d) => bridgeTool(d)(server, bridge, i18n));
}
