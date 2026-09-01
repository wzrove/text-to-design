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
    description: `节点结构操作,按 op 分发:select 设当前选中 | remove 删除(matchName 可再过滤) | clone 复制(右下偏移) | group 编组(可带 layoutMode/itemSpacing/padding* 参数) | ungroup 解组 | flatten 合并为矢量(至少 2 节点) | outline_stroke 描边转轮廓 | reparent 移到 parentId 下(缺省当前选中第一个) | repair 清理已损坏节点。
属性修改用 jsd_update_node。`,
    method: 'node_op',
    inputSchema: manageNodesSchema,
    outputSchema: manageNodesResultSchema,
    // remove/flatten/repair 会删改结构,如实标注破坏性
    annotations: { readOnlyHint: false, destructiveHint: true },
  });

  const manageComponents = bridgeTool({
    name: 'jsd_manage_components',
    title: '组件与实例操作',
    description: `组件/实例操作,按 op 分发:create_component 建空壳组件(子节点需再 reparent 归入) | create_instance 生成实例 | detach_instance 解绑为 Frame | import_component 按 key 从团队库导入 | swap_component 换绑组件 | set_instance_properties 设置变体属性(可选值看节点的 variantGroupProperties) | combine_as_variants 合并为组件集(基于副本,原组件保留) | copy_overrides 把源实例的覆盖(变体/组件属性/可见样式文本)复制为快照并缓存,返回 snapshotId(=源实例 id) | apply_overrides 按 snapshotId 把快照批量套用到目标实例(可 swapToSource,缓存 miss 会报错,需先 copy) | sync_overrides 无状态一次性「复制+套用」(不写缓存,适合 jsd_batch)。
componentProperties 仅 Figma 生效;jsDesign 自动降级为变体属性+可见样式。`,
    method: 'component_op',
    inputSchema: manageComponentsSchema,
    outputSchema: manageComponentsResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: true },
  });

  return [manageNodes(server, bridge), manageComponents(server, bridge)];
}
