import { describe, expect, it } from 'vitest';
import type { DesignHost, NodeSkeleton } from '../core/host';
import { groupNodes } from '../core/nodes';
import { runtimeContext } from '../core/runtime';
import { makeFrame, makeHost } from './fixtures';

/**
 * 线上错误组 `jsd_ungroup_nodes {code:engine_error}`:
 * `in ungroup: First argument to ungroup() must be an array`。
 *
 * 即时设计的全局 `ungroup(children)` 只收数组;core 之前把单个节点交下去,引擎当场抛。
 * 本测试用记录器假宿主驱动真实解组分支,断言**实际下发的实参是数组**且回包 status 一致。
 */

const CTX = runtimeContext([]);

function makeGroup(id: string): NodeSkeleton {
  const group = makeFrame(id, '拼接层');
  (group as unknown as { type: string }).type = 'GROUP';
  return group;
}

describe('解组下发宿主 API 要求的数组形态', () => {
  it('jsDesign 形态:host.ungroup 收到 [node],回包 ungrouped 含该节点', async () => {
    const group = makeGroup('2:9');
    const host = makeHost([group]) as DesignHost & {
      ungroup?: (nodes: readonly NodeSkeleton[]) => readonly NodeSkeleton[];
    };
    const calls: (readonly NodeSkeleton[])[] = [];
    host.ungroup = (nodes) => {
      calls.push(nodes);
      return nodes;
    };

    const result = await groupNodes(host, CTX, { ids: ['2:9'], ungroup: true });

    expect(calls).toHaveLength(1);
    expect(Array.isArray(calls[0])).toBe(true);
    expect(calls[0]).toHaveLength(1);
    expect(calls[0][0]).toBe(group);
    expect(result).toEqual({ ungrouped: ['2:9'] });
  });

  it('平台两级 API 都不可用才报「未提供解组 API」', async () => {
    const group = makeGroup('2:9');
    const host = makeHost([group]) as DesignHost;

    await expect(
      groupNodes(host, CTX, { ids: ['2:9'], ungroup: true }),
    ).rejects.toThrow('未提供解组 API');
  });
});
