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
    description: `对节点执行结构操作(按 op 分发):

- select:设置当前选中
- remove:删除(matchName 可在 ids/选中范围内进一步过滤)
- clone:复制(右下偏移 24px)
- group:编组(支持 auto-layout 参数 layoutMode/itemSpacing/padding*)
- ungroup:取消编组
- flatten:合并为单个矢量(至少 2 个节点)
- outline_stroke:描边转矢量轮廓
- reparent:移动到目标父节点下(parentId 缺省用当前选中第一个)
- repair:清理画布中已损坏的节点

注意:修改属性(位置/尺寸/填充/文本等)请用 jsd_update_node。`,
    method: 'node_op',
    inputSchema: manageNodesSchema,
    outputSchema: manageNodesResultSchema,
    // remove/flatten/repair 会删改结构,如实标注破坏性
    annotations: { readOnlyHint: false, destructiveHint: true },
  });

  const manageComponents = bridgeTool({
    name: 'jsd_manage_components',
    title: '组件与实例操作',
    description: `组件/实例操作(按 op 分发):

- create_component:创建空壳组件(子节点需另用 reparent 归组)
- create_instance:从组件生成实例
- detach_instance:解绑实例(转为 Frame)
- import_component:从团队库按 key 导入组件
- swap_component:交换实例引用的组件
- set_instance_properties:设置实例变体属性(可调属性从 find/selection 的 variantGroupProperties 获取)
- combine_as_variants:合并为组件集(基于副本,原组件保留)`,
    method: 'component_op',
    inputSchema: manageComponentsSchema,
    outputSchema: manageComponentsResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: true },
  });

  return [manageNodes(server, bridge), manageComponents(server, bridge)];
}
