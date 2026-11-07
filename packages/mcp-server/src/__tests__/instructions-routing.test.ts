import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { createMcpI18n } from '../i18n';
import { buildServer } from '../server';

describe('mcp.instructions 的配方导航', () => {
  it('instructions 引导到覆盖全部已注册配方的索引', async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = buildServer(new Bridge(), createMcpI18n('zh-CN'));
    const client = new Client(
      { name: 'instructions-routing', version: '1' },
      { capabilities: {} },
    );
    await server.connect(serverTransport as never);
    await client.connect(clientTransport as never);
    try {
      const { prompts } = await client.listPrompts();
      const instructions = client.getInstructions() ?? '';
      expect(prompts.length).toBeGreaterThan(0);

      expect(instructions).toContain('jsd://recipes');
      expect(instructions).toContain('skill://canvas/SKILL.md');
      const index = await client.readResource({ uri: 'jsd://recipes' });
      const text = index.contents
        .map((content) => ('text' in content ? content.text : ''))
        .join('\n');
      const missing = prompts
        .map((prompt) => prompt.name)
        .filter((name) => !text.includes(name));
      expect(missing, `这些配方没写进索引:${missing.join(' / ')}`).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
