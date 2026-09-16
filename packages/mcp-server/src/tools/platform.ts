import type { McpServer } from '@modelcontextprotocol/server';
import {
  platformOpParamsSchema,
  platformOpResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';

/** 平台特有操作:通用通道;op 名单与参数形状由 ping 的 platformOps 下发(不再靠猜) */
export function registerPlatformTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const platformOp = bridgeTool({
    name: 'jsd_platform_op',
    title: '平台特有操作',
    description: `执行平台特有能力(Figma 变量/本地样式/组件属性等)。CRITICAL: 不要凭空猜测 op 名与参数——先 jsd_ping 读 platformOps 名单(含每个 op 的参数形状说明)与 capabilities,再按名单里的名字调用;平台不支持或 op 名写错时返回错误并列出当前平台支持的 op`,
    // 平台归属:当前只有 Figma 实现了 op(jsDesign 的 meta.platformOps 为空数组),
    // 平台已知时 daemon 直接拦截,不必等插件侧报「平台不支持」
    platforms: ['figma'],
    platformNote:
      '(仅 Figma 有平台特有操作;jsDesign 没有对应 op,本地样式改用 jsd_list_styles 或读 jsd://styles,组件属性用 jsd_set_instance_properties)',
    method: 'platform_op',
    inputSchema: platformOpParamsSchema,
    outputSchema: platformOpResultSchema,
    // 变量/样式多与团队库等外部实体打交道
    annotations: { readOnlyHint: false, openWorldHint: true },
    followUp: {
      type: 'tool',
      tool: 'jsd_get_selection',
      description: '复核平台操作在画布上的效果',
    },
  });
  return [platformOp(server, bridge)];
}
