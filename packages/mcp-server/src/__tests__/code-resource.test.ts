import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { createMcpI18n } from '../i18n';
import { buildServer } from '../server';
import {
  CODE_ENTRY_IDS,
  CODE_INDEX_URI,
  CODE_URI_TEMPLATE,
  readCodeEntry,
} from '../skills/code-catalog';

async function withOfflineServer<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = buildServer(new Bridge(), createMcpI18n('zh-CN'));
  const client = new Client(
    { name: 'code-resource', version: '1' },
    { capabilities: {} },
  );
  await server.connect(serverTransport as never);
  await client.connect(clientTransport as never);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

describe('design-to-code 普通资源回退', () => {
  it('索引和受控模板均发布', async () => {
    await withOfflineServer(async (client) => {
      const { resources } = await client.listResources();
      const index = resources.find(
        (resource) => resource.uri === CODE_INDEX_URI,
      );
      expect(index).toBeTruthy();
      expect(index?.description).toContain('frontend');
      expect(index?.description).toContain('backend');
      const { resourceTemplates } = await client.listResourceTemplates();
      expect(
        resourceTemplates.map((template) => String(template.uriTemplate)),
      ).toContain(CODE_URI_TEMPLATE);
    });
  });

  it('索引列出角色路由', async () => {
    await withOfflineServer(async (client) => {
      const { contents } = await client.readResource({ uri: CODE_INDEX_URI });
      const text = contents
        .map((content) => ('text' in content ? content.text : ''))
        .join('');
      for (const id of CODE_ENTRY_IDS)
        expect(text).toContain(`jsd://code/${id}`);
      expect(text).toContain('v=1');
      expect(text).toContain('节点详情由后续 skill');
    });
  });

  it('插件离线仍逐字读取同源入口与附录', async () => {
    await withOfflineServer(async (client) => {
      for (const entry of CODE_ENTRY_IDS) {
        const { contents } = await client.readResource({
          uri: `jsd://code/${entry}`,
        });
        expect(contents[0]?.mimeType).toBe('text/markdown');
        expect(
          contents
            .map((content) => ('text' in content ? content.text : ''))
            .join(''),
        ).toBe(readCodeEntry(entry));
      }
    });
  });

  it('未知 entry 返回可用清单', async () => {
    await withOfflineServer(async (client) => {
      await expect(
        client.readResource({ uri: 'jsd://code/does-not-exist' }),
      ).rejects.toThrow(/可用 entry/);
      await expect(
        client.readResource({ uri: 'jsd://code/does-not-exist' }),
      ).rejects.toThrow(/frontend/);
    });
  });
});
