import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { resolveToolProfile } from '../config';
import { lookupExecutor } from '../core/registry';
import type { ToolProfile } from '../core/tool-catalog';
import { buildServer } from '../server';

async function connect(profile: ToolProfile, bridge = new Bridge()) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = buildServer(bridge, undefined, { toolProfile: profile });
  const client = new Client(
    { name: 'tool-profile-check', version: '1' },
    { capabilities: {} },
  );
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    server,
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe('tool catalog profiles', () => {
  it('keeps stable public catalogs while capabilities remain server-local', async () => {
    const full = await connect('full');
    const compact = await connect(resolveToolProfile(''));
    try {
      const all = (await full.client.listTools()).tools;
      const core = (await compact.client.listTools()).tools;
      expect(all).toHaveLength(60);
      expect(core.map((tool) => tool.name).sort()).toEqual([
        'jsd_batch',
        'jsd_copy',
        'jsd_describe_tools',
        'jsd_export',
        'jsd_find',
        'jsd_get_page',
        'jsd_get_prompt',
        'jsd_get_selection',
        'jsd_list_fonts',
        'jsd_list_prompts',
        'jsd_ping',
        'jsd_search_icons',
      ]);
      expect(core.some((tool) => tool.name === 'jsd_describe_tools')).toBe(
        true,
      );
      expect(core.some((tool) => tool.name === 'jsd_detach_instance')).toBe(
        false,
      );
      expect(lookupExecutor('jsd_manage_nodes', full.server)).toBeDefined();
      expect(
        lookupExecutor('jsd_manage_nodes', compact.server),
      ).toBeUndefined();
      expect(
        lookupExecutor('jsd_detach_instance', compact.server),
      ).toBeDefined();
      expect(lookupExecutor('jsd_get_prompt', compact.server)).toBeDefined();
      expect(lookupExecutor('jsd_copy', compact.server)).toBeDefined();
      expect(core.some((tool) => tool.name === 'jsd_copy')).toBe(true);
    } finally {
      await compact.close();
      await full.close();
    }
  });

  it('discovers full schemas without changing the public catalog', async () => {
    const session = await connect('compact');
    try {
      const before = (await session.client.listTools()).tools.map(
        (tool) => tool.name,
      );
      const result = await session.client.callTool({
        name: 'jsd_describe_tools',
        arguments: { names: ['jsd_detach_instance'] },
      });
      const data = result.structuredContent as {
        tools: {
          public: boolean;
          execution: string;
          inputSchema: { properties: object };
        }[];
      };
      expect(data.tools[0].public).toBe(false);
      expect(data.tools[0].execution).toBe('batch');
      expect(data.tools[0].inputSchema.properties).toHaveProperty('ids');
      expect(
        (await session.client.listTools()).tools.map((tool) => tool.name),
      ).toEqual(before);
      const invalid = await session.client.callTool({
        name: 'jsd_describe_tools',
        arguments: { names: ['not-a-tool'] },
      });
      expect(invalid.isError).toBe(true);
    } finally {
      await session.close();
    }
  });

  it('executes non-public capabilities through batch using the correct bridge', async () => {
    const sent: unknown[] = [];
    const bridge = new Bridge();
    bridge.request = async (method, params) => {
      sent.push({ method, params });
      return { created: [] };
    };
    const compact = await connect('compact', bridge);
    const other = await connect('full');
    try {
      const result = await compact.client.callTool({
        name: 'jsd_batch',
        arguments: {
          calls: [
            {
              id: 'detach',
              tool: 'jsd_detach_instance',
              args: { ids: ['1:2'] },
            },
          ],
        },
      });
      const data = result.structuredContent as { results: { ok: boolean }[] };
      expect(data.results[0].ok).toBe(true);
      expect(sent).toContainEqual({
        method: 'component_op',
        params: { op: 'detach_instance', ids: ['1:2'] },
      });
    } finally {
      await other.close();
      await compact.close();
    }
  });

  it('retains the target-parent drift check on specialized reparent calls', async () => {
    const reads: Record<string, unknown>[] = [];
    const bridge = new Bridge();
    bridge.request = async (method, params) => {
      const args = params as Record<string, unknown>;
      if (method === 'find') {
        reads.push(args);
        return {
          nodes:
            args.depth === 0
              ? [
                  { id: 'child', parentId: 'old' },
                  { id: 'new', parentId: 'page' },
                ]
              : [],
          total: 0,
        };
      }
      return { moved: [], updated: [] };
    };
    const session = await connect('compact', bridge);
    try {
      const result = await session.client.callTool({
        name: 'jsd_batch',
        arguments: {
          calls: [
            {
              tool: 'jsd_reparent_nodes',
              args: { ids: ['child'], parentId: 'new' },
            },
          ],
        },
      });
      expect(result.structuredContent).toMatchObject({ ok: true });
      expect(reads).toContainEqual({ ids: ['new'], depth: 1 });
    } finally {
      await session.close();
    }
  });

  it('fans a multi-node export to one savePath out to one file per node', async () => {
    // 曾经这里直接拒绝(「savePath 仅支持单节点导出」),线上被撞了 5 次:
    // 调用方要的就是「一批节点各落一份盘」,拒绝只能逼它逐个往返。
    let requested = false;
    const bridge = new Bridge();
    bridge.request = async () => {
      requested = true;
      return {
        exports: {
          '1:1': {
            name: 'a',
            format: 'PNG',
            mimeType: 'image/png',
            bytes: Buffer.from([1]),
          },
          '1:2': {
            name: 'b',
            format: 'PNG',
            mimeType: 'image/png',
            bytes: Buffer.from([2]),
          },
        },
      };
    };
    const session = await connect('compact', bridge);
    const dir = mkdtempSync(join(tmpdir(), 'jsd-export-'));
    try {
      const savePath = join(dir, 'export.png');
      const result = await session.client.callTool({
        name: 'jsd_export',
        arguments: { ids: ['1:1', '1:2'], savePath },
      });
      expect(result.isError).toBeUndefined();
      expect(requested).toBe(true);
      const structured = result.structuredContent as {
        exports: { id: string; path?: string }[];
      };
      const paths = structured.exports.map((e) => e.path);
      expect(new Set(paths).size).toBe(2);
      for (const p of paths) expect(p).toBeDefined();
      expect(existsSync(paths[0] as string)).toBe(true);
      expect(existsSync(paths[1] as string)).toBe(true);
      // 单节点仍然是原样的 savePath,不被加序号
      expect(paths[0]).not.toBe(savePath);
    } finally {
      await session.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
