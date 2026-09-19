import type { McpServer } from '@modelcontextprotocol/server';
import {
  applyOverridesSchema,
  combineAsVariantsSchema,
  copyOverridesSchema,
  createComponentSchema,
  createInstanceSchema,
  detachInstanceSchema,
  importComponentSchema,
  manageComponentsResultSchema,
  type manageComponentsSchema,
  setInstancePropertiesSchema,
  swapComponentSchema,
  syncOverridesSchema,
} from 'text-to-design-shared';
import type { z } from 'zod';
import type { Bridge } from '../bridge';
import {
  type BridgeToolDef,
  bridgeTool,
  type ToolHandle,
  type ToolHints,
} from '../core/registry';

type ComponentOpKind = z.infer<typeof manageComponentsSchema>['op'];

type ComponentOpDef = Pick<
  BridgeToolDef,
  'name' | 'title' | 'description' | 'inputSchema' | 'followUp'
> & { annotations?: ToolHints };

/** 构造「固定 op」工具定义:args 原样透传并注入 op 字面量,插件协议不变 */
function opTool(op: ComponentOpKind, rest: ComponentOpDef): BridgeToolDef {
  return {
    method: 'component_op',
    outputSchema: manageComponentsResultSchema,
    payload: (args) => ({ op, ...args }),
    ...rest,
  };
}

/**
 * 组件/实例操作:从 jsd_manage_components 的 10 个 op 拆出的单职责工具。
 * 聚合入口 jsd_manage_components 保留,此处每个工具只管一件事,结果带 followUp 引导。
 */
export function registerComponentTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const defs: BridgeToolDef[] = [
    opTool('create_component', {
      name: 'jsd_create_component',
      title: '建组件',
      description: `建「空壳」组件——不会固化传入节点,返回全新 100×100 空组件,原节点不动。正确流程:1) jsd_resize_node 把空壳改成目标尺寸 → 2) jsd_reparent_nodes 把原 Frame 的子节点移进空壳 → 3) jsd_delete_node 删原 Frame → 4) 需要填充/圆角/阴影时再 jsd_set_fill_color / jsd_set_cornerRadius / jsd_set_effects 补。顺序必须先 resize 后 reparent,否则子节点默认 SCALE 约束会被拉伸到错位(或先给子节点 constraints:{horizontal:"MIN",vertical:"MIN"})`,
      inputSchema: createComponentSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_resize_node',
        description: '把空壳组件调到目标尺寸',
      },
    }),
    opTool('create_instance', {
      name: 'jsd_create_instance',
      title: '生成组件实例',
      description:
        '按 COMPONENT 节点生成实例并返回新 id。同类实例样式/文案批量套用用 jsd_sync_overrides,变体属性用 jsd_set_instance_properties',
      inputSchema: createInstanceSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_instance_properties',
        description: '设置实例的变体属性',
      },
    }),
    opTool('detach_instance', {
      name: 'jsd_detach_instance',
      title: '取消实例链接',
      description:
        '把实例(INSTANCE)转成可自由编辑的普通节点,之后与组件不再联动。⚠ 已知平台缺陷(实测):引擎报错时已内置克隆副本兜底,仍失败按报错提示操作;需要可编辑副本也可用 jsd_create_rectangle / jsd_create_text 等手工重建',
      inputSchema: detachInstanceSchema,
      annotations: { readOnlyHint: false, destructiveHint: true },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_fill_color',
        description: '解链后自由编辑新节点样式',
      },
    }),
    opTool('import_component', {
      name: 'jsd_import_component',
      title: '从团队库导入组件',
      description:
        '按 key 从团队库导入组件到当前页(与团队库等外部实体打交道,可能受库权限/网络影响)。key 需是团队库组件唯一标识,导入后再 jsd_create_instance 生成实例',
      inputSchema: importComponentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      followUp: {
        type: 'tool',
        tool: 'jsd_create_instance',
        description: '为导入的组件生成实例',
      },
    }),
    opTool('swap_component', {
      name: 'jsd_swap_component',
      title: '换绑组件',
      description:
        '把实例换绑到另一个组件(componentId 为 COMPONENT 节点 id),会丢弃目标实例既有覆盖(破坏性)。只想套样式不换绑用 jsd_apply_overrides 且 swapToSource=false',
      inputSchema: swapComponentSchema,
      annotations: { readOnlyHint: false, destructiveHint: true },
      followUp: {
        type: 'tool',
        tool: 'jsd_set_instance_properties',
        description: '换绑后设置变体属性',
      },
    }),
    opTool('set_instance_properties', {
      name: 'jsd_set_instance_properties',
      title: '设置变体属性',
      description:
        '设置实例的变体属性(如 {"状态":"禁用"})。可调属性与可选值需先 jsd_find / jsd_get_selection 读 variantGroupProperties,属性名必须完全匹配。componentProperties 仅 Figma 生效,jsDesign 自动降级为变体属性+可见样式',
      inputSchema: setInstancePropertiesSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_sync_overrides',
        description: '批量同步其他实例的覆盖',
      },
    }),
    opTool('combine_as_variants', {
      name: 'jsd_combine_as_variants',
      title: '合并为变体集',
      description:
        '把多个组件合并为变体集(分量)。必须传 COMPONENT 节点,实例不能直接合成。**两平台行为不同,按能力位 inPlaceVariants 分流**:①声明该能力的平台(如 Figma,原生 combineAsVariants 即原位合并)—— 并入集合的就是实例所指的 COMPONENT 本身,**已有实例链接不断、页面不残留冗余原件**,这是首选姿势,直接调即可;②未声明的平台(jsDesign,平台缺陷:引擎内部把节点按 BOOLEAN_OPERATION 取属性 → get_booleanOperation: Value is not a string,与组件结构无关)会退化为「克隆并入 / 克隆移入后合并」兜底 —— 兜底成功时页面上会同时留下**原件与集合内克隆**,已有实例仍指向原件,需自行 swap 到克隆变体后再删原件;全败时返回可执行出口,别重试、也别去改组件结构。jsDesign 上变体集的替代做法:每个状态各做一个 COMPONENT,按「族名 / 状态」命名(如 Nav / Inbox、Nav / Me),调用方按名字取用。「一个主件 + 每屏改子节点颜色」这条捷径同样不通(实例子节点样式 override 不保证渲染生效)',
      inputSchema: combineAsVariantsSchema,
      annotations: { readOnlyHint: false, destructiveHint: true },
      followUp: {
        type: 'tool',
        tool: 'jsd_create_component',
        description:
          '按「族名 / 状态」逐个建独立主件(变体集不可用时的替代方案)',
      },
    }),
    opTool('copy_overrides', {
      name: 'jsd_copy_overrides',
      title: '复制实例覆盖快照',
      description:
        '把源实例的覆盖(变体/组件属性/可见样式文本)复制为快照并缓存,返回 snapshotId(=源实例 id)。要先审后套或多次套用同一快照时用它,随后 jsd_apply_overrides;一次性复制+套用用 jsd_sync_overrides',
      inputSchema: copyOverridesSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_apply_overrides',
        description: '把快照套用到目标实例',
      },
    }),
    opTool('apply_overrides', {
      name: 'jsd_apply_overrides',
      title: '套用实例覆盖快照',
      description:
        '按 sourceId(先前 jsd_copy_overrides 返回的 snapshotId)把快照批量套用到目标实例。缓存 miss 会报错,需先 copy;swapToSource=true 会把目标换绑成源组件(丢失目标既有覆盖,需显式开启)',
      inputSchema: applyOverridesSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_sync_overrides',
        description: '继续同步其他实例的覆盖',
      },
    }),
    opTool('sync_overrides', {
      name: 'jsd_sync_overrides',
      title: '同步实例覆盖',
      description:
        '无状态一次性「复制+套用」:sourceId 源实例,ids 全部目标实例。不写缓存,适合 jsd_batch 编排;需要多次套用同一快照时用 jsd_copy_overrides + jsd_apply_overrides',
      inputSchema: syncOverridesSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      followUp: {
        type: 'tool',
        tool: 'jsd_get_selection',
        description: '复核同步后的实例',
      },
    }),
  ];
  return defs.map((d) => bridgeTool(d)(server, bridge));
}
