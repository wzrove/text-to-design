import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { createMcpI18n } from '../i18n';
import { buildServer } from '../server';

/** 宿主没有 resources/read 时,jsd_get_prompt 用路径别名读同一份技能文件 */
async function withServer<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = buildServer(new Bridge(), createMcpI18n('zh-CN'));
  const client = new Client(
    { name: 'prompt-alias', version: '1' },
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

function textOf(result: { content?: { type: string; text?: string }[] }) {
  return (result.content ?? [])
    .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
    .join('');
}

describe('jsd_get_prompt 资源别名', () => {
  it('canvas/SKILL 返回技能入口正文', async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: 'jsd_get_prompt',
        arguments: { name: 'canvas/SKILL' },
      });
      expect(res.isError).not.toBe(true);
      expect(textOf(res)).toContain('## 先定位任务');
    });
  });

  it('skill://canvas/SKILL.md 同样可读', async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: 'jsd_get_prompt',
        arguments: { name: 'skill://canvas/SKILL.md' },
      });
      expect(res.isError).not.toBe(true);
      expect(textOf(res)).toContain('## 执行闭环');
    });
  });

  it('附录路径等同配方 prompt', async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: 'jsd_get_prompt',
        arguments: { name: 'skill://canvas/references/auto-layout.md' },
      });
      expect(res.isError).not.toBe(true);
      expect(textOf(res)).toContain('# 自动布局');
    });
  });

  it('不存在的路径仍点名,并给出别名与可用配方', async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: 'jsd_get_prompt',
        arguments: { name: 'canvas/references/does-not-exist.md' },
      });
      expect(res.isError).toBe(true);
      const text = textOf(res);
      expect(text).toContain('未知提示词');
      expect(text).toContain('canvas/SKILL');
      expect(text).toContain('design-strategy');
    });
  });
});
