import {
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import { MCP_TOOL_GUIDANCE } from 'text-to-design-shared';
import type { Bridge } from './bridge';
import {
  CATALOG_TTL_MS,
  MAX_TOOL_INPUT_ELEMENTS,
  resolveToolProfile,
  SERVER_NAME,
  SERVER_VERSION,
} from './config';
import { configureToolProfile, type ToolProfile } from './core/tool-catalog';
import type { McpI18n } from './i18n';
import { createMcpI18n } from './i18n';
import { toolRegistrars } from './tools';

// 每个实例固定目录与语言，避免在会话中改变工具契约。
export function buildServer(
  bridge: Bridge,
  i18n: McpI18n = createMcpI18n(),
  options: { toolProfile?: ToolProfile } = {},
): McpServer {
  const profile = options.toolProfile ?? resolveToolProfile();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      // INSTRUCTIONS 源码里存 MessageKey(0016):它是模型读的纪律文案,
      // 与工具描述同一套翻译,不另起一份
      instructions: `${i18n.t('mcp.instructions')}\n${MCP_TOOL_GUIDANCE[i18n.locale][profile]}`,
      cacheHints: {
        'tools/list': { ttlMs: CATALOG_TTL_MS, cacheScope: 'private' },
        'prompts/list': { ttlMs: CATALOG_TTL_MS, cacheScope: 'private' },
        'resources/list': { ttlMs: CATALOG_TTL_MS, cacheScope: 'private' },
        'resources/templates/list': {
          ttlMs: CATALOG_TTL_MS,
          cacheScope: 'private',
        },
        'resources/read': { ttlMs: 0, cacheScope: 'private' },
      },
      // 入参总量封顶:jsd_batch 内联 50 步 + 每步任意 args,之前没有任何上限。
      // SDK 在派发到执行器之前就按元素数判,畸形的巨型入参到不了业务代码
      ...(MAX_TOOL_INPUT_ELEMENTS != null
        ? { maxToolInputElements: MAX_TOOL_INPUT_ELEMENTS }
        : {}),
    },
  );
  configureToolProfile(server, profile);
  for (const register of toolRegistrars) {
    register(server, bridge, i18n);
  }
  return server;
}
