import type { McpServer } from '@modelcontextprotocol/server';
import {
  platformOpParamsSchema,
  platformOpResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { err, structured } from '../core/response';

/** 平台特有操作:通用通道,op 名与参数由 ping.capabilities + op.description 引导 */
export function registerPlatformTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'jsd_platform_op',
    {
      description: `执行平台特有操作(如 Figma 的变量/团队库样式/组件属性等流程级能力)。
先 jsd_ping 查看返回的 platform 与 capabilities,确认平台支持哪些能力;
op 取平台支持的操作名(常见: figma_variables_create / figma_variables_apply / figma_style_apply_by_name / figma_component_properties_set)。
当前平台不支持时会返回"平台不支持操作"错误。`,
      inputSchema: platformOpParamsSchema,
      outputSchema: platformOpResultSchema,
    },
    async ({ op, params }) => {
      try {
        const data = await bridge.request('platform_op', { op, params });
        return structured(data, platformOpResultSchema);
      } catch (e) {
        return err(e, platformOpResultSchema);
      }
    },
  );
}
