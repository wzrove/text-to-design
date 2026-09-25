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
    // 平台归属:Figma 与 MasterGo 各有一档 op(jsDesign 仍是空数组)。先 jsd_ping 读
    // platformOps 名单再调;平台不匹配时 daemon 直接拦截,不必等插件侧报「平台不支持」
    platforms: ['figma', 'mastergo'],
    platformNote:
      '(仅 Figma / MasterGo 有平台特有操作,名单见 jsd_ping 的 platformOps;jsDesign 没有对应 op —— 本地样式读 jsd://styles(只读资源,没有同名工具);变体值读 jsd_find 的 variantProperties、写用 jsd_set_instance_properties;**组件的布尔/文本/换绑属性(componentProperties)在 jsDesign 上不存在**,别去找该字段;MG 上新增组件属性用 mg_add_component_property,Figma 上用 figma_component_property_add)',
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
