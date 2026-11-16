import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { buildNodeReference, type SerializedNode } from 'text-to-design-shared';
import { describe, expect, it, vi } from 'vitest';
import { Bridge } from '../bridge';
import { createMcpI18n } from '../i18n';
import { buildServer } from '../server';

function node(id: string): SerializedNode {
  return { id, name: id, type: 'FRAME', x: 0, y: 0, width: 100, height: 80 };
}

function mockBridge(available = ['1:1', '1:2']) {
  const bridge = new Bridge();
  const request = vi
    .spyOn(bridge, 'request')
    .mockImplementation(async (method, params) => {
      if (method === 'find') {
        const ids = (params as { ids: string[] }).ids;
        return {
          nodes: ids.filter((id) => available.includes(id)).map(node),
          total: ids.length,
        };
      }
      if (method === 'get_selection')
        return { selection: [], pageName: '当前页' };
      throw new Error(`unexpected ${method}`);
    });
  return { bridge, request };
}

async function withServer<T>(
  bridge: Bridge,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = buildServer(bridge, createMcpI18n('zh-CN'));
  const client = new Client(
    { name: 'reference-resource', version: '1' },
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

function source() {
  return {
    platform: 'jsdesign' as const,
    pageName: '数字孪生运营分析平台',
    selectionSeq: 7,
  };
}

describe('节点引用 resources/read', () => {
  it('整组 URL 按固定 IDs 读取，不落到当前 selection', async () => {
    const { bridge, request } = mockBridge();
    const uri = buildNodeReference({
      mode: 'code',
      roles: ['frontend'],
      scope: 'selection',
      requestedIds: ['1:1', '1:2'],
      source: source(),
    });
    await withServer(bridge, async (client) => {
      const { contents } = await client.readResource({ uri });
      const data = JSON.parse(
        contents
          .map((content) => ('text' in content ? content.text : ''))
          .join(''),
      );
      expect(data.selection.map((item: { id: string }) => item.id)).toEqual([
        '1:1',
        '1:2',
      ]);
      expect(data.pageName).toBe('数字孪生运营分析平台');
      expect(request).toHaveBeenCalledWith('find', {
        ids: ['1:1', '1:2'],
        depth: 2,
      });
      expect(request).not.toHaveBeenCalledWith('get_selection', { depth: 2 });
    });
  });

  it('单节点后端 URL 使用 depth=1', async () => {
    const { bridge, request } = mockBridge(['118:605']);
    const uri = buildNodeReference({
      mode: 'code',
      roles: ['backend'],
      scope: 'node',
      requestedIds: ['118:605'],
      source: source(),
    });
    await withServer(bridge, async (client) => {
      const { contents } = await client.readResource({ uri });
      const data = JSON.parse(
        contents
          .map((content) => ('text' in content ? content.text : ''))
          .join(''),
      );
      expect(data.nodes[0].id).toBe('118:605');
      expect(request).toHaveBeenCalledWith('find', {
        ids: ['118:605'],
        depth: 1,
      });
    });
  });

  it('节点失效或缺失时报错且不替换目标', async () => {
    const { bridge, request } = mockBridge(['1:1']);
    const uri = buildNodeReference({
      mode: 'code',
      roles: ['frontend'],
      scope: 'selection',
      requestedIds: ['1:1', 'missing'],
      source: source(),
    });
    await withServer(bridge, async (client) => {
      await expect(client.readResource({ uri })).rejects.toThrow(/missing/);
      expect(request).toHaveBeenCalledWith('find', {
        ids: ['1:1', 'missing'],
        depth: 2,
      });
    });
  });

  it('超过100个引用 IDs 分批读取', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `node-${index}`);
    const { bridge, request } = mockBridge(ids);
    const uri = buildNodeReference({
      mode: 'code',
      roles: ['backend'],
      scope: 'selection',
      requestedIds: ids,
      source: source(),
    });
    await withServer(bridge, async (client) => {
      await client.readResource({ uri });
      const calls = request.mock.calls.filter(([method]) => method === 'find');
      const batches = calls.map(
        ([, params]) => (params as { ids: string[] }).ids,
      );
      expect(batches).toHaveLength(2);
      expect(batches[0]).toHaveLength(100);
      expect(batches[1]).toEqual(['node-100']);
    });
  });

  it('无参数 selection 资源保持原行为', async () => {
    const { bridge, request } = mockBridge();
    await withServer(bridge, async (client) => {
      await client.readResource({ uri: 'jsd://canvas/selection' });
      expect(request).toHaveBeenCalledWith('get_selection', { depth: 2 });
      expect(request).not.toHaveBeenCalledWith('find', expect.anything());
    });
  });
});
