import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
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
    const compact = await connect('compact');
    try {
      const all = (await full.client.listTools()).tools;
      const core = (await compact.client.listTools()).tools;
      expect(all).toHaveLength(58);
      expect(core).toHaveLength(26);
      expect(new Set(core.map((tool) => tool.name)).size).toBe(26);
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
      await session.client.callTool({
        name: 'jsd_reparent_nodes',
        arguments: { ids: ['child'], parentId: 'new' },
      });
      expect(reads).toContainEqual({ ids: ['new'], depth: 1 });
    } finally {
      await session.close();
    }
  });

  it('rejects a multi-node export to one filename before contacting the plugin', async () => {
    let requested = false;
    const bridge = new Bridge();
    bridge.request = async () => {
      requested = true;
      return {};
    };
    const session = await connect('compact', bridge);
    try {
      const result = await session.client.callTool({
        name: 'jsd_export',
        arguments: { ids: ['1:1', '1:2'], savePath: 'export.png' },
      });
      expect(result.isError).toBe(true);
      expect(requested).toBe(false);
    } finally {
      await session.close();
    }
  });
});
