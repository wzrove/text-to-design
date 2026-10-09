import type { McpServer } from '@modelcontextprotocol/server';
import {
  getPageStructureSchema,
  getSelectionResultSchema,
  getSelectionSchema,
  pageStructureResultSchema,
  pingResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { CLIENT, PING_TIMEOUT_MS } from '../config';
import { bridgeTool, type ToolHandle } from '../core/registry';
import type { McpI18n } from '../i18n';

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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    // 同 jsd_list_fonts:没有 inputSchema 时 MCP 侧按空对象校验,depth 会被静默丢掉
    // (实测:传 depth 与不传结果一样,永远是默认层级)
    inputSchema: getSelectionSchema,
    outputSchema: getSelectionResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    followUp: {
      type: 'tool',
      tool: 'jsd_find',
      description: 'getSelection.description2',
    },
  });

  /**
   * 页面结构总览。与 `jsd://page` 资源同一件事(资源是给「客户端主动读上下文」的,
   * 工具是给「模型明确要读」的,同 jsd_get_selection / jsd://canvas/selection 一对)。
   *
   * 名字不是随便起的:drift-watch 的「当前页顶层」复核按 `jsd_get_page` 走
   * `lookupExecutor`,此前该工具**不存在** —— lookupExecutor 返 undefined,
   * 那一层静默进 dead,复核从未执行过。改名/删名会再次静默打断它。
   */
  const getPage = bridgeTool({
    name: 'jsd_get_page',
    title: 'getPage.title',
    description: 'getPage.description',
    method: 'get_page',
    // 无参工具也显式给 inputSchema:不给的话 SDK 走 callback(ctx) 形态,
    // 目录里也看不出「这个工具不收参数」(同 jsd_get_selection 的注释)
    inputSchema: getPageStructureSchema,
    outputSchema: pageStructureResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    followUp: {
      type: 'tool',
      tool: 'jsd_find',
      description: 'getPage.followUp',
    },
  });

  return [
    ping(server, bridge, i18n),
    getSelection(server, bridge, i18n),
    getPage(server, bridge, i18n),
  ];
}
