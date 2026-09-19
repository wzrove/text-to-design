import type { McpServer } from '@modelcontextprotocol/server';
import {
  manageComponentsResultSchema,
  manageComponentsSchema,
  manageNodesResultSchema,
  manageNodesSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';
import { driftWatch } from './drift-watch';

/**
 * 管理类:两个按 op 分发的聚合入口,保留给批量/混合场景。
 * 单操作已拆成独立小工具(见 nodes.ts / components.ts),每个工具的描述里
 * 带了对应的平台缺陷与正确流程。
 */
export function registerManageTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const manageNodes = bridgeTool({
    name: 'jsd_manage_nodes',
    title: '节点结构操作(聚合)',
    description: `按 op 分发的节点结构操作聚合入口:select|remove|clone|group|ungroup|flatten|outline_stroke|reparent|repair。单次单操作请优先用对应小工具:jsd_select_nodes / jsd_delete_node / jsd_clone_node / jsd_group_nodes / jsd_ungroup_nodes / jsd_flatten_nodes / jsd_outline_stroke / jsd_reparent_nodes / jsd_repair_nodes(描述含平台缺陷与正确流程)。属性修改用 jsd_set_* 系列(含 jsd_set_shape);组件/实例操作用 jsd_manage_components 或 jsd_create_component / jsd_sync_overrides 等,两工具 op 不通用。
各 op 的返回键(在 jsd_batch 里用占位符引用时才不会写错,写错会中止整批):select→selected[](id 字符串)、remove→removed[](id 字符串)、clone/outline_stroke→created[](节点**数组**)、group/flatten→created(节点**单对象**:这两个 op 内部走的就是 jsd_group_nodes / jsd_flatten_nodes 那条路)、ungroup→ungrouped[](id 字符串)、reparent→moved[](同时附 updated[],两者同一份数组)、repair→cleaned[](id 字符串)。id 字符串数组取 {{步骤id.selected[0]}},节点数组取 {{步骤id.created[0].id}},节点单对象取 {{步骤id.created.id}}(写成 [0] 会报无法解析)。`,
    method: 'node_op',
    inputSchema: manageNodesSchema,
    outputSchema: manageNodesResultSchema,
    // remove/flatten/repair 会删改结构,如实标注破坏性
    annotations: { readOnlyHint: false, destructiveHint: true },
    // 结构变更类的漂移复核:聚合入口此前**没挂**这个钩子,于是「走 jsd_batch 里的
    // jsd_manage_nodes{op:'remove'}」这一步不复核,而固定 op 小工具有复核 ——
    // 同一份暴露面两种待遇(见 0003 与 drift-watch.ts)。DriftWatch.before 已按
    // 入参 op 自过滤(非结构变更调用直接返回),所以这里无条件挂上即可。
    hook: driftWatch,
    followUp: {
      type: 'tool',
      tool: 'jsd_set_layout',
      description: '结构改完后设置容器自动布局',
    },
  });

  const manageComponents = bridgeTool({
    name: 'jsd_manage_components',
    title: '组件与实例操作(聚合)',
    description: `按 op 分发的组件/实例操作聚合入口:create_component|create_instance|detach_instance|import_component|swap_component|set_instance_properties|combine_as_variants|copy_overrides|apply_overrides|sync_overrides。单次单操作请优先用对应小工具:jsd_create_component / jsd_create_instance / jsd_detach_instance / jsd_import_component / jsd_swap_component / jsd_set_instance_properties / jsd_combine_as_variants / jsd_copy_overrides / jsd_apply_overrides / jsd_sync_overrides(描述含平台缺陷与正确流程)。节点结构操作用 jsd_manage_nodes,两工具 op 不通用`,
    method: 'component_op',
    inputSchema: manageComponentsSchema,
    outputSchema: manageComponentsResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: true },
    followUp: {
      type: 'tool',
      tool: 'jsd_set_instance_properties',
      description: '组件/实例改完后设置变体属性',
    },
  });

  return [manageNodes(server, bridge), manageComponents(server, bridge)];
}
