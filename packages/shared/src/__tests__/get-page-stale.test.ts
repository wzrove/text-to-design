import { describe, expect, it } from 'vitest';
import type { NodeSkeleton } from '../core/host';
import { getPageStructure } from '../core/nodes';
import { runtimeContext } from '../core/runtime';
import { makeFrame, makeHost, makeRect } from './fixtures';

/**
 * 线上错误组 `jsd_get_page {code:engine_error}`:
 * `in get_name: The node with id "0:102" does not exist`。
 *
 * 顶层清单只读 id / name / type 三个身份字段(0039)—— 任一读即抛说明节点已失效,
 * 该节点必须被跳过,其余顶层节点照常返回。整调用失败会让调用方连好节点都拿不到。
 */

const CTX = runtimeContext([]);

function staleNode(id: string, brokenField: 'id' | 'name' | 'type') {
  const node = makeFrame(id, 'stale');
  Object.defineProperty(node, brokenField, {
    get: () => {
      throw new Error(`in get_${brokenField}: The node with id does not exist`);
    },
    configurable: true,
  });
  return node as NodeSkeleton;
}

describe('get_page 对失效顶层节点容错', () => {
  it('name 读取即抛:跳过该节点,返回其余节点', async () => {
    const stale = staleNode('0:102', 'name');
    const good = makeRect('1:1', '好节点');

    const result = await getPageStructure(makeHost([stale, good]), CTX);

    expect(result.nodes.map((n) => n.id)).toEqual(['1:1']);
    expect(result.count).toBe(1);
    expect(result.note).toContain('跳过 1 个失效顶层节点');
  });

  it('id / type 读取即抛同样只丢该节点', async () => {
    const results = await Promise.all(
      (['id', 'type'] as const).map(async (field) => {
        const stale = staleNode(`0:2${field.length}`, field);
        const good = makeRect(`1:${field.length}`, `好节点-${field}`);
        // 不做 makeHost([stale]) —— registry 建表要读 id,失效 id 在那里就抛了
        const host = makeHost([good]);
        (host.currentPage as unknown as { children: NodeSkeleton[] }).children =
          [stale, good];
        return getPageStructure(host, CTX);
      }),
    );

    for (const result of results) {
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].name).toContain('好节点');
    }
  });
});
