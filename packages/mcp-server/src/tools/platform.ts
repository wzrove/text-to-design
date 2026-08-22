import type { McpServer } from '@modelcontextprotocol/server';
import {
  platformOpParamsSchema,
  platformOpResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';

/** 平台特有操作:通用通道,op 名与参数由 ping.capabilities + op.description 引导 */
export function registerPlatformTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const platformOp = bridgeTool({
    name: 'jsd_platform_op',
    title: '平台特有操作',
    description: `执行平台特有操作(如 Figma 的变量/本地样式/组件属性等流程级能力)。
先 jsd_ping 查看返回的 platform 与 capabilities,确认平台支持哪些能力;
op 取平台支持的操作名(常见: figma_variables_create / figma_variables_apply / figma_style_apply_by_name / figma_component_properties_set),参数结构见各 op 描述。
当前平台不支持时会返回"平台不支持操作"错误。`,
    method: 'platform_op',
    inputSchema: platformOpParamsSchema,
    outputSchema: platformOpResultSchema,
    // 变量/样式多与团队库等外部实体打交道
    annotations: { readOnlyHint: false, openWorldHint: true },
  });
  return [platformOp(server, bridge)];
}
