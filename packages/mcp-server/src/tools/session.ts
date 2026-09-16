import type { McpServer } from '@modelcontextprotocol/server';
import {
  getSelectionResultSchema,
  pingResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { CLIENT, PING_TIMEOUT_MS } from '../config';
import { bridgeTool, type ToolHandle } from '../core/registry';

/** 会话类:连接探测 + 选中读取 */
export function registerSessionTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const ping = bridgeTool({
    name: 'jsd_ping',
    title: `检查 ${CLIENT.runtime} 插件连接`,
    description: `检查插件是否在线(需先启动 ${CLIENT.runtime} 插件并保持运行)。返回三个能力表:coreCapabilities 为核心能力(create/modify/structure/component/export/image,两平台一致);capabilities 只列平台差异超集(如 variables/componentProperties/textTruncation),jsDesign 通常只有 styles;platformOps 列当前平台可用的特有操作(名/标题/参数说明),调 jsd_platform_op 前先读它。回包会被 daemon 缓存,后续可直接读 jsd://platform/state(不必重复 ping)`,
    outputSchema: pingResultSchema,
    annotations: { readOnlyHint: true },
    alwaysEnabled: true,
    timeout: PING_TIMEOUT_MS,
    followUp: {
      type: 'tool',
      tool: 'jsd_get_selection',
      description: '连接确认后读取当前选中',
    },
    run: async () => {
      try {
        const data = (await bridge.request(
          'ping',
          {},
          { timeout: PING_TIMEOUT_MS },
        )) as {
          pong?: boolean;
          platform?: unknown;
          capabilities?: unknown;
          coreCapabilities?: unknown;
          platformOps?: unknown;
        };
        return {
          connected: true,
          platform: data?.platform,
          capabilities: data?.capabilities,
          coreCapabilities: data?.coreCapabilities,
          platformOps: data?.platformOps,
        };
      } catch (e) {
        return {
          connected: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  });

  const getSelection = bridgeTool({
    name: 'jsd_get_selection',
    title: '读取画布选中',
    description: `获取画布当前选中节点的序列化树(名称/类型/尺寸/位置/填充/子结构);depth 控制层级深度,默认 2。⚠ 每个节点带 z = 在父级 children 里的下标 = 绘制顺序(0 = 最底层,越大越靠上),判断遮挡读 z 即可`,
    method: 'get_selection',
    outputSchema: getSelectionResultSchema,
    annotations: { readOnlyHint: true },
    followUp: {
      type: 'tool',
      tool: 'jsd_find',
      description: '在选中范围内继续精确查找节点',
    },
  });

  return [ping(server, bridge), getSelection(server, bridge)];
}
