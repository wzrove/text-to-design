import type { McpServer } from '@modelcontextprotocol/server';
import {
  platformOpParamsSchema,
  platformOpResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';
import type { McpI18n } from '../i18n';

/** 平台特有操作:通用通道;op 名单与参数形状由 ping 的 platformOps 下发(不再靠猜) */
export function registerPlatformTools(
  server: McpServer,
  bridge: Bridge,
  i18n: McpI18n,
): ToolHandle[] {
  const platformOp = bridgeTool({
    name: 'jsd_platform_op',
    title: 'platformOp.title',
    description: 'platformOp.description',
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
      description: 'platformOp.description2',
    },
  });
  return [platformOp(server, bridge, i18n)];
}
