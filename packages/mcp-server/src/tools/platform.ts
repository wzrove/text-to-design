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
    description: `执行平台特有能力(Figma 变量/本地样式/组件属性等)。先用 jsd_ping 查看 platform、capabilities 及支持的操作名,params 随 op 而定;平台不支持时返回错误`,
    method: 'platform_op',
    inputSchema: platformOpParamsSchema,
    outputSchema: platformOpResultSchema,
    // 变量/样式多与团队库等外部实体打交道
    annotations: { readOnlyHint: false, openWorldHint: true },
  });
  return [platformOp(server, bridge)];
}
