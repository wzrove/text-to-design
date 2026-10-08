import type { McpServer } from '@modelcontextprotocol/server';
import {
  platformOpParamsSchema,
  platformOpResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';
import type { McpI18n } from '../i18n';
import {
  componentFaceText,
  componentWriteText,
  variableFaceText,
} from './platform-facts';

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
    platformNote: `(平台特有 op 名单以 jsd_ping 的 platformOps 为准 —— 有的平台该名单是空数组,此时没有平台 op 可调;本地样式读 jsd://styles(只读资源,没有同名工具);变体值读 jsd_find 的 variantProperties、切已存在的值用 jsd_set_instance_properties;**变体集本身**(建维度/加成分/改取值/删维度)只有提供集合级 op 的平台才改得动,名单同样在 platformOps 里 —— 没这组 op 的平台只能靠主件命名承载。${componentFaceText(null)}${componentWriteText(null)}。变量面:${variableFaceText(null)})`,
    method: 'platform_op',
    inputSchema: platformOpParamsSchema,
    outputSchema: platformOpResultSchema,
    // op 名与参数形状由 ping 的 platformOps 下发;op 集合随平台演进,重复调用不保证无副作用
    // (变量/样式写是追加语义),故不声明幂等。openWorldHint 恒 false:它操作的是**当前文档**
    // 的变量与样式表,不发网络请求 —— 标成 open world 会让客户端以为要联网而弹确认。
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    followUp: {
      type: 'tool',
      tool: 'jsd_get_selection',
      description: 'platformOp.description2',
    },
  });
  return [platformOp(server, bridge, i18n)];
}
