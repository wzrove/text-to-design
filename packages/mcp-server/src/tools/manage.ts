import type { McpServer } from '@modelcontextprotocol/server';
import {
  manageComponentsResultSchema,
  manageComponentsSchema,
  manageNodesResultSchema,
  manageNodesSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';

/** 管理类:节点结构操作 + 组件/实例操作 */
export function registerManageTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const manageNodes = bridgeTool({
    name: 'jsd_manage_nodes',
    title: '节点结构操作',
    description: `节点结构操作,按 op 分发:select 设当前选中 | remove 删除(matchName 可再过滤) | clone 复制(右下偏移;注意克隆 COMPONENT 得到的是 INSTANCE 而非可编辑副本) | group 编组(可带 layoutMode/itemSpacing/padding* 参数) | ungroup 解组 | flatten 合并为矢量(至少 2 节点) | outline_stroke 描边转轮廓 | reparent 移到 parentId 下(缺省当前选中第一个;reparent 后坐标按新父相对系解释,需手动修正 x/y) | repair 清理已损坏节点。
属性修改用 jsd_update_node;组件/实例操作(create_component/create_instance/变体合并等)用 jsd_manage_components,两工具 op 不通用。`,
    method: 'node_op',
    inputSchema: manageNodesSchema,
    outputSchema: manageNodesResultSchema,
    // remove/flatten/repair 会删改结构,如实标注破坏性
    annotations: { readOnlyHint: false, destructiveHint: true },
  });

  const manageComponents = bridgeTool({
    name: 'jsd_manage_components',
    title: '组件与实例操作',
    description: `组件/实例操作,按 op 分发:
create_component 建「空壳」组件(不会固化传入节点,返回全新 100×100 空组件,原节点不动)。正确流程:1) resize 空壳到目标尺寸 → 2) reparent 原 Frame 的子节点进空壳 → 3) 删除原 Frame → 4) 需要填充/圆角/阴影时再 jsd_update_node 补。顺序必须先 resize 后 reparent,否则子节点默认 SCALE 约束会被拉伸到错位(或先给子节点 constraints:{horizontal:"MIN",vertical:"MIN"})。
create_instance 生成实例 | import_component 按 key 从团队库导入 | swap_component 换绑组件 | set_instance_properties 设置变体属性(可选值看节点的 variantGroupProperties) | copy_overrides 把源实例的覆盖(变体/组件属性/可见样式文本)复制为快照并缓存,返回 snapshotId(=源实例 id) | apply_overrides 按 snapshotId 把快照批量套用到目标实例(可 swapToSource,缓存 miss 会报错,需先 copy) | sync_overrides 无状态一次性「复制+套用」(不写缓存,适合 jsd_batch)。
⚠ 已知平台缺陷(实测):combine_as_variants 当前不可用(实例不能直接合成,两个 COMPONENT 也报引擎错误),变体需求用「母组件+实例+实例覆盖」替代或引导用户在即时设计 UI 手动合并;detach_instance 当前报引擎错误不可用,需要可编辑副本时用 jsd_create_nodes 重建。
componentProperties 仅 Figma 生效;jsDesign 自动降级为变体属性+可见样式。`,
    method: 'component_op',
    inputSchema: manageComponentsSchema,
    outputSchema: manageComponentsResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: true },
  });

  return [manageNodes(server, bridge), manageComponents(server, bridge)];
}
