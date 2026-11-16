import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import type { ToolHandle } from '../core/tool-def';
import { promptIcon } from '../core/tool-icons';
import type { McpI18n } from '../i18n';
import {
  CODE_ENTRY_IDS,
  CODE_INDEX_URI,
  CODE_URI_TEMPLATE,
  completeCodeEntryIds,
  readCodeEntry,
  renderCodeIndex,
} from '../skills/code-catalog';

function markdownContents(uri: string | URL, text: string) {
  return {
    contents: [
      {
        uri: typeof uri === 'string' ? uri : uri.href,
        mimeType: 'text/markdown',
        text,
      },
    ],
  };
}

export function registerCodeResources(
  server: McpServer,
  _bridge: unknown,
  i18n: McpI18n,
): ToolHandle[] {
  const ids = CODE_ENTRY_IDS.join(' / ');
  const index = server.registerResource(
    'code-contract',
    CODE_INDEX_URI,
    {
      title: i18n.t('resources.title9'),
      icons: promptIcon(),
      description: `节点引用 URL 与 design-to-code skill 的普通资源回退。处理 jsd://node 或 jsd://canvas/selection 链接时先读，按 frontend/backend 路由附录；离线可读，不执行脚本。可用 entry:${ids}`,
      mimeType: 'text/markdown',
    },
    async () => markdownContents(CODE_INDEX_URI, renderCodeIndex()),
  );
  const body = server.registerResource(
    'code-contract-entry',
    new ResourceTemplate(CODE_URI_TEMPLATE, {
      list: undefined,
      complete: { entry: completeCodeEntryIds },
    }),
    {
      title: i18n.t('resources.title10'),
      icons: promptIcon(),
      description: `按受控 entry 读取 design-to-code 入口/附录，如 jsd://code/SKILL.md、jsd://code/frontend。拒绝未知 entry 和路径穿越；与 skills 正文同源。可用 entry:${ids}`,
      mimeType: 'text/markdown',
    },
    async (uri, vars) => {
      const raw = vars.entry;
      const entry = Array.isArray(raw) ? raw[0] : raw;
      return markdownContents(uri, readCodeEntry(String(entry ?? '')));
    },
  );
  return [index, body];
}
