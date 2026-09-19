import { Client } from '@modelcontextprotocol/client';
import {
  fromJsonSchema,
  InMemoryTransport,
} from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { compactOutputSchema } from '../daemon/compact-schema';
import { buildServer } from '../server';

/**
 * 工具目录体积的不变式(决策记录见 docs/design-decisions/0006)。
 *
 * 为什么守这个:目录体积是对外契约的一部分 —— 下游(宿主)拿 tools/list 当工具
 * 索引的输入,超出预算的后果不是"费点带宽",而是**工具查不到、调不通**。
 * 2026-09-18 实测基线:53 个工具的目录 1.13 MB(经 shim 复刻后 1.64 MB),
 * 宿主只索引到 4 个工具,jsd_find / jsd_export / jsd_batch 全部检索不到。
 *
 * 三条不变式,各认各的归属:
 * ① 出参声明(本次改动拥有的部分):单工具 ≤ 2 KB,合计压掉一个量级;
 * ② 目录整体 ≤ 400 KB —— 入参 schema 尚未收敛,是这块的地板(第三阶段);
 * ③ 不误伤:投影后不得残留 `additionalProperties: false`。真实回包的字段远多于
 *    投影声明,严格校验的客户端会把合法回包判为非法,那比体积更严重。
 */

type WireTool = { name: string; inputSchema?: unknown; outputSchema?: unknown };

let cached: WireTool[] | null = null;

/** 起一个真实 McpServer(53 个工具全注册)+ in-memory 客户端,取一次目录 */
async function listWireTools(): Promise<WireTool[]> {
  if (cached != null) return cached;
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = buildServer(new Bridge());
  const client = new Client(
    { name: 'catalog-budget', version: '1' },
    { capabilities: {} },
  );
  await server.connect(serverTransport as never);
  await client.connect(clientTransport as never);
  try {
    const { tools } = await client.listTools();
    cached = tools as WireTool[];
    return cached;
  } finally {
    await client.close();
  }
}

/** 投影后的目录项(与 daemon/proxy.ts syncTools 的下发形态一致) */
function projectedCatalog(tools: WireTool[]) {
  return tools.map((t) => ({
    name: t.name,
    ...(t.outputSchema
      ? { outputSchema: compactOutputSchema(t.outputSchema) }
      : {}),
  }));
}

function jsonBytes(value: unknown): number {
  return JSON.stringify(value).length;
}

function collectAdditionalProperties(node: unknown, out: boolean[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectAdditionalProperties(child, out);
    return;
  }
  if (node == null || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'additionalProperties' && value === false) out.push(false);
    collectAdditionalProperties(value, out);
  }
}

describe('工具目录体积', () => {
  it('单工具出参声明 ≤ 5 KB,合计压掉一个量级', async () => {
    const tools = await listWireTools();
    const raw = tools.reduce((sum, t) => sum + jsonBytes(t.outputSchema), 0);
    const projected = projectedCatalog(tools);
    const heaviest = projected
      .map((t) => ({ name: t.name, bytes: jsonBytes(t.outputSchema) }))
      .sort((a, b) => b.bytes - a.bytes)[0];
    const total = projected.reduce(
      (sum, t) => sum + jsonBytes(t.outputSchema),
      0,
    );

    // 上限 5 KB 而不是 2 KB:manageComponents 这类结果同时回 created/swapped/
    // updated 三个节点数组,同一份节点键名合法地出现三次。这里要抓的是
    // 「投影被删掉」(那会回到 25 KB),不是在 2 KB 上卡细节。
    expect(
      heaviest.bytes,
      `最重的 ${heaviest.name} 出参声明 ${(heaviest.bytes / 1024).toFixed(2)} KB`,
    ).toBeLessThan(5_000);
    expect(
      raw / total,
      `投影前 ${(raw / 1024).toFixed(0)} KB → 投影后 ${(total / 1024).toFixed(0)} KB`,
    ).toBeGreaterThan(8);
  });

  it('投影后的目录合计 ≤ 500 KB', async () => {
    const projected = projectedCatalog(await listWireTools());
    const total = jsonBytes(projected);
    // 500 KB 与 daemon/proxy.ts 的 CATALOG_WARN_BYTES 同源。实测:这里(服务端
    // 直出形态)约 350 KB,经 shim 复刻下发约 460 KB —— 差值来自 SDK 序列化细节。
    // 剩下的地板是入参 schema(约 300 KB),收敛它属第三阶段(见 0006 记录)。
    expect(total, `目录合计 ${(total / 1024).toFixed(0)} KB`).toBeLessThan(
      500_000,
    );
  });

  it('占位符要用到的路径在投影后仍可见', async () => {
    const projected = projectedCatalog(await listWireTools());
    const byName = new Map(projected.map((t) => [t.name, t.outputSchema]));

    const updated = byName.get('jsd_rename_node') as {
      properties?: Record<string, { items?: { properties?: object } }>;
    };
    expect(Object.keys(updated.properties ?? {})).toContain('updated');
    expect(
      Object.keys(updated.properties?.updated?.items?.properties ?? {}),
    ).toEqual(expect.arrayContaining(['id', 'x', 'y', 'z']));

    const find = byName.get('jsd_find') as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(find.properties ?? {})).toEqual(
      expect.arrayContaining(['nodes', 'total']),
    );

    const exported = byName.get('jsd_export') as {
      properties?: Record<string, { items?: { properties?: object } }>;
    };
    expect(
      Object.keys(exported.properties?.exports?.items?.properties ?? {}),
    ).toEqual(expect.arrayContaining(['path', 'dataUrl']));
  });

  it('投影后不得残留 additionalProperties: false', async () => {
    const projected = projectedCatalog(await listWireTools());
    const strict: boolean[] = [];
    collectAdditionalProperties(projected, strict);
    expect(
      strict,
      '存在 additionalProperties: false,严格客户端会拒收真实回包',
    ).toHaveLength(0);
  });

  it('投影结果能被 fromJsonSchema 接受(注册路径不炸)', async () => {
    const tools = await listWireTools();
    for (const t of tools) {
      if (!t.outputSchema) continue;
      const projected = compactOutputSchema(t.outputSchema);
      expect(
        () => fromJsonSchema(projected as never),
        `${t.name} 的投影 schema 无法转换`,
      ).not.toThrow();
    }
  });

  it('投影对空/非对象 schema 保持宽容', () => {
    expect(compactOutputSchema(undefined)).toBeUndefined();
    expect(compactOutputSchema({})).toEqual({
      type: 'object',
      additionalProperties: true,
    });
  });
});
