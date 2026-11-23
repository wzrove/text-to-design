import type { McpServer } from '@modelcontextprotocol/server';
import {
  searchIconsInputSchema,
  searchIconsResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import type { ToolHandle } from '../core/tool-def';
import { bridgeTool } from '../core/tool-exec';
import type { McpI18n } from '../i18n';
import { searchIconify } from '../iconify';

/**
 * 只读检索工具:不碰插件,单独注册。图标需求先走 Iconify,
 * 本地 Lucide 只在离线/无命中时兜底(见 skills/canvas/references/icon-grid.md)。
 */
export function registerIconSearchTools(
  server: McpServer,
  bridge: Bridge,
  i18n: McpI18n,
): ToolHandle[] {
  const searchIcons = bridgeTool({
    name: 'jsd_search_icons',
    title: 'searchIcons.title',
    description:
      '按语义检索 Iconify 图标(默认只查 MIT/Apache/ISC 等宽松许可集合),可按项目风格筛 line/solid,返回 prefix:name 与 license。把 id 传给 jsd_create_icon 插入;无可用结果再手绘 SVG。只读、需联网',
    inputSchema: searchIconsInputSchema,
    outputSchema: searchIconsResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    timeout: 15_000,
    run: async (args, _bridge, signal) => {
      const { query, limit, prefixes, style } = args as {
        query: string;
        limit?: number;
        prefixes?: string[];
        style?: 'line' | 'solid' | 'any';
      };
      return searchIconify(query, {
        ...(limit == null ? {} : { limit }),
        ...(prefixes == null ? {} : { prefixes }),
        ...(style == null ? {} : { style }),
        signal,
      });
    },
  });
  return [searchIcons(server, bridge, i18n)];
}
