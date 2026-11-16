import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { type CopyRequest, parseNodeReference } from 'text-to-design-shared';
import { describe, expect, it, vi } from 'vitest';
import { Bridge } from '../bridge';
import { createMcpI18n } from '../i18n';
import { buildServer } from '../server';
import { executeCopy } from '../tools/copy';

function request(): Extract<CopyRequest, { mode: 'code' }> {
  return {
    mode: 'code',
    roles: ['frontend'],
    scope: 'selection',
    requestedIds: ['1:1', '1:2'],
    source: { platform: 'figma', pageName: '登录页', selectionSeq: 3 },
  };
}

describe('jsd_copy 节点引用', () => {
  it('仅返回一个 URL，不读取画布或设计正文', () => {
    const bridge = new Bridge();
    const read = vi.spyOn(bridge, 'request');
    const result = executeCopy(request(), bridge, new AbortController().signal);
    expect(result.text).toMatch(/^jsd:\/\/canvas\/selection\?/);
    expect(result.text).not.toContain('DATA:');
    expect(result.text).not.toContain('JSON');
    expect(result.text.split('\n')).toHaveLength(1);
    expect(read).not.toHaveBeenCalled();
    expect(parseNodeReference(result.text).requestedIds).toEqual([
      '1:1',
      '1:2',
    ]);
  });

  it('design/node 也只返回节点 URL', () => {
    const bridge = new Bridge();
    const read = vi.spyOn(bridge, 'request');
    const result = executeCopy(
      {
        mode: 'design',
        scope: 'node',
        requestedIds: ['1:1'],
        source: request().source,
      },
      bridge,
      new AbortController().signal,
    );
    expect(result.text).toMatch(/^jsd:\/\/node\/1%3A1\?/);
    expect(parseNodeReference(result.text)).toMatchObject({
      mode: 'design',
      roles: [],
      skill: null,
      requestedIds: ['1:1'],
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('节点失效不在 Copy 时隐式替换目标', () => {
    const bridge = new Bridge();
    const read = vi.spyOn(bridge, 'request');
    const result = executeCopy(
      { ...request(), scope: 'node', requestedIds: ['deleted-node'] },
      bridge,
      new AbortController().signal,
    );
    expect(parseNodeReference(result.text).requestedIds).toEqual([
      'deleted-node',
    ]);
    expect(read).not.toHaveBeenCalled();
  });
});

describe('jsd_copy MCP 注册', () => {
  it('真实 tools/call 返回可解析 URL', async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = buildServer(new Bridge(), createMcpI18n('zh-CN'));
    const client = new Client(
      { name: 'copy-tool', version: '1' },
      { capabilities: {} },
    );
    await server.connect(serverTransport as never);
    await client.connect(clientTransport as never);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toContain('jsd_copy');
      const result = await client.callTool({
        name: 'jsd_copy',
        arguments: request(),
      });
      const text = (result.structuredContent as { text: string }).text;
      expect(parseNodeReference(text)).toMatchObject({
        mode: 'code',
        roles: ['frontend'],
        requestedIds: ['1:1', '1:2'],
      });
      expect(result.isError).not.toBe(true);
    } finally {
      await client.close();
    }
  });

  it('缺平台或页面时返回错误，不生成弱定位链接', async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = buildServer(new Bridge(), createMcpI18n('zh-CN'));
    const client = new Client(
      { name: 'copy-tool-error', version: '1' },
      { capabilities: {} },
    );
    await server.connect(serverTransport as never);
    await client.connect(clientTransport as never);
    try {
      const result = await client.callTool({
        name: 'jsd_copy',
        arguments: {
          ...request(),
          source: { platform: null, pageName: null, selectionSeq: null },
        },
      });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
    }
  });
});
