import { Client } from '@modelcontextprotocol/client';
import { SkillsClient } from '@modelcontextprotocol/client/ext/skills';
import {
  InMemoryTransport,
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/server';
import {
  memorySkillFiles,
  RESOURCES_DIRECTORY_READ_METHOD,
  SKILLS_EXTENSION_ID,
  SKILLS_LIST_METHOD,
  SkillCatalog,
} from '@modelcontextprotocol/server/ext/skills';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registerSkillsProxy } from '../daemon/skills-proxy';

async function connect(server: McpServer) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'skills-proxy-test', version: '1' },
    { capabilities: {} },
  );
  await server.connect(serverTransport as never);
  await client.connect(clientTransport as never);
  return client;
}

async function withProxy(
  enabled: boolean,
  fn: (client: Client, upstream: Client) => Promise<void>,
) {
  const origin = new McpServer({ name: 'origin', version: '1' });
  if (enabled) {
    const catalog = await SkillCatalog.load(
      memorySkillFiles({
        'design/SKILL.md':
          '---\nname: design\ndescription: Design screens\n---\n# Design\n',
        'design/references/layout.md': '# Layout\n',
        'charts/SKILL.md':
          '---\nname: charts\ndescription: Create charts\n---\n# Charts\n',
      }),
      { pageSize: 1 },
    );
    catalog.attach(origin);
  }
  const upstream = await connect(origin);
  const proxy = new McpServer({ name: 'proxy', version: '1' });
  registerSkillsProxy(proxy, upstream, (fn) => fn(upstream));
  proxy.registerResource(
    'files',
    new ResourceTemplate('skill://{+path}', { list: undefined }),
    {},
    (uri) => upstream.readResource({ uri: uri.href }),
  );
  const client = await connect(proxy);
  try {
    await fn(client, upstream);
  } finally {
    await client.close();
    await proxy.close();
    await upstream.close();
    await origin.close();
  }
}

describe('skills stdio 代理', () => {
  it('声明扩展，支持发现、取元数据、读正文与引用文件', async () => {
    await withProxy(true, async (client, upstream) => {
      expect(
        client.getServerCapabilities()?.extensions?.[SKILLS_EXTENSION_ID],
      ).toEqual(
        upstream.getServerCapabilities()?.extensions?.[SKILLS_EXTENSION_ID],
      );
      const skills = new SkillsClient(client);
      expect(skills.supported).toBe(true);
      const { skills: entries } = await skills.list();
      expect(entries).toHaveLength(2);
      const design = entries.find(
        (entry) => entry.frontmatter.name === 'design',
      )!;
      expect((await skills.get(design.uri)).skill).toEqual(design);
      expect((await skills.read(design)).verified).toBe(true);
      const reference = await skills.read(design, 'references/layout.md');
      expect(reference.verified).toBe(true);
      expect(reference.text).toBe('# Layout\n');
      // 目录 URI 是不带斜尾的规范形:SDK 按 canonicalUri 查目录表,尾斜杠不算同一个目录
      expect(
        (await skills.readDirectory('skill://design')).resources.length,
      ).toBeGreaterThan(0);
    });
  });

  it('逐页透传 skills 与目录游标、缓存字段', async () => {
    await withProxy(true, async (client, upstream) => {
      for (const [method, params] of [
        [SKILLS_LIST_METHOD, {}],
        [RESOURCES_DIRECTORY_READ_METHOD, { uri: 'skill://design' }],
      ] as const) {
        const schema = z.looseObject({ nextCursor: z.string().optional() });
        const first = await client.request({ method, params }, schema);
        expect(first).toEqual(
          await upstream.request({ method, params }, schema),
        );
        expect(first.nextCursor).toBeDefined();
        const next = { ...params, cursor: first.nextCursor };
        expect(await client.request({ method, params: next }, schema)).toEqual(
          await upstream.request({ method, params: next }, schema),
        );
      }
    });
  });

  it('上游无扩展时不声明 skills 能力', async () => {
    await withProxy(false, async (client) => {
      expect(
        client.getServerCapabilities()?.extensions?.[SKILLS_EXTENSION_ID],
      ).toBeUndefined();
      expect(new SkillsClient(client).supported).toBe(false);
    });
  });
});
