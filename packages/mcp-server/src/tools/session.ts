import type { McpServer } from '@modelcontextprotocol/server';
import {
  getSelectionResultSchema,
  pingResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { CLIENT, PING_TIMEOUT_MS } from '../config';
import { bridgeTool, type ToolHandle } from '../core/registry';
import type { McpI18n } from '../i18n';

/** 会话类:连接探测 + 选中读取 */
export function registerSessionTools(
  server: McpServer,
  bridge: Bridge,
  i18n: McpI18n,
): ToolHandle[] {
  const ping = bridgeTool({
    name: 'jsd_ping',
    title: i18n.t('ping.title', { client: CLIENT.label }),
    description: i18n.t('ping.description', { client: CLIENT.label }),
    outputSchema: pingResultSchema,
    annotations: { readOnlyHint: true },
    alwaysEnabled: true,
    timeout: PING_TIMEOUT_MS,
    followUp: {
      type: 'tool',
      tool: 'jsd_get_selection',
      description: 'ping.followUp',
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
    title: 'getSelection.title',
    description: 'getSelection.description',
    method: 'get_selection',
    outputSchema: getSelectionResultSchema,
    annotations: { readOnlyHint: true },
    followUp: {
      type: 'tool',
      tool: 'jsd_find',
      description: 'getSelection.description2',
    },
  });

  return [ping(server, bridge, i18n), getSelection(server, bridge, i18n)];
}
