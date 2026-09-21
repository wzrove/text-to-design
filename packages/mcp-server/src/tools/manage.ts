import type { McpServer } from '@modelcontextprotocol/server';
import {
  manageComponentsResultSchema,
  manageComponentsSchema,
  manageNodesResultSchema,
  manageNodesSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';
import type { McpI18n } from '../i18n';
import { driftWatch } from './drift-watch';

/**
 * 管理类:两个按 op 分发的聚合入口,保留给批量/混合场景。
 * 单操作已拆成独立小工具(见 nodes.ts / components.ts),每个工具的描述里
 * 带了对应的平台缺陷与正确流程。
 */
export function registerManageTools(
  server: McpServer,
  bridge: Bridge,
  i18n: McpI18n,
): ToolHandle[] {
  const manageNodes = bridgeTool({
    name: 'jsd_manage_nodes',
    title: 'manageNodes.title',
    description: 'manageNodes.description',
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
      description: 'manageNodes.followUp',
    },
  });

  const manageComponents = bridgeTool({
    name: 'jsd_manage_components',
    title: 'manageComponents.title',
    description: 'manageComponents.description',
    method: 'component_op',
    inputSchema: manageComponentsSchema,
    outputSchema: manageComponentsResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: true },
    followUp: {
      type: 'tool',
      tool: 'jsd_set_instance_properties',
      description: 'manageComponents.description2',
    },
  });

  return [
    manageNodes(server, bridge, i18n),
    manageComponents(server, bridge, i18n),
  ];
}
