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
    description: `执行平台特有能力(Figma 变量/本地样式/组件属性等)。CRITICAL: 不要凭空猜测 op 名与参数——必须先取 jsd_ping 的 capabilities 确认当前平台支持的操作名与入参结构(随平台而异),params 随 op 而定;平台不支持时返回错误`,
    method: 'platform_op',
    inputSchema: platformOpParamsSchema,
    outputSchema: platformOpResultSchema,
    // 变量/样式多与团队库等外部实体打交道
    annotations: { readOnlyHint: false, openWorldHint: true },
  });
  return [platformOp(server, bridge)];
}
