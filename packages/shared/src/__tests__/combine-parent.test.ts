import { describe, expect, it } from 'vitest';
import { combineAsVariantsNodes } from '../core/component';
import type { DesignHost, NodeSkeleton } from '../core/host';
import { runtimeContext } from '../core/runtime';
import { makeFrame, makeHost } from './fixtures';

/**
 * 合并落点必须是**真实的容器节点**(原生签名要 `BaseNode & ChildrenMixin`,
 * `plugin-api.d.ts:127`),**不允许用当前页兜底**。
 *
 * 为什么这条要单独守:`components[0].parent ?? page` 这种写法把两种情况混成一个 ——
 * ① 读不到 parent(失效/孤立节点)② 顶层节点(其实父级是 PageNode)。用 page 顶
 * 等于**猜**,而且落点变了会静默改几何:全局坐标不变、相对基准从原容器换成页面,
 * 集合看着在、子件位置全错 —— 正是 0007 那类「回显成功、实际不对」。
 *
 * 同时守「跨父级拒绝」:Figma 官方语义要求待合并组件同父级,跨父级时
 * `components[0].parent` 只代表第一个组件的落点,其余组件坐标基准不同。
 */
function component(id: string, parent: NodeSkeleton | null): NodeSkeleton {
  const n = {
    ...makeFrame(id, id),
    type: 'COMPONENT',
  } as unknown as NodeSkeleton;
  n.parent = parent;
  return n;
}

function hostOf(nodes: NodeSkeleton[], seen: unknown[]): DesignHost {
  const host = makeHost(nodes) as unknown as DesignHost & {
    combineAsVariants: (n: readonly NodeSkeleton[], p: unknown) => NodeSkeleton;
  };
  host.combineAsVariants = (n, p) => {
    seen.push({ count: n.length, parent: p });
    return {
      ...makeFrame('9:set', 'set'),
      type: 'COMPONENT_SET',
    } as unknown as NodeSkeleton;
  };
  return host;
}

function container(id: string): NodeSkeleton {
  return makeFrame(id, id);
}

describe('合并落点:必须是真容器,不能用 page 兜底', () => {
  it('组件无父级 → 点名报错,绝不拿 page 顶', async () => {
    const seen: unknown[] = [];
    const host = hostOf([component('1:1', null), component('1:2', null)], seen);
    await expect(
      combineAsVariantsNodes(
        host,
        runtimeContext(['inPlaceVariants'], 'figma'),
        {
          ids: ['1:1', '1:2'],
        },
      ),
    ).rejects.toThrow(/没有可用的父容器/);
    // 关键:引擎一次都不该被调用(不能先猜完再报错)
    expect(seen).toEqual([]);
  });

  it('父级不是容器(没有 appendChild)→ 同样拒', async () => {
    const seen: unknown[] = [];
    // makeRect 没有 appendChild(叶子节点),用它冒充父级
    const fakeParent = {
      id: '9:x',
      name: 'x',
      type: 'RECTANGLE',
    } as unknown as NodeSkeleton;
    const host = hostOf(
      [component('1:1', fakeParent), component('1:2', fakeParent)],
      seen,
    );
    await expect(
      combineAsVariantsNodes(
        host,
        runtimeContext(['inPlaceVariants'], 'figma'),
        {
          ids: ['1:1', '1:2'],
        },
      ),
    ).rejects.toThrow(/没有可用的父容器/);
    expect(seen).toEqual([]);
  });

  it('跨父级 → 点名要求先 reparent,不替调用方选落点', async () => {
    const seen: unknown[] = [];
    const p1 = container('2:1');
    const p2 = container('2:2');
    const host = hostOf([component('1:1', p1), component('1:2', p2)], seen);
    await expect(
      combineAsVariantsNodes(
        host,
        runtimeContext(['inPlaceVariants'], 'figma'),
        {
          ids: ['1:1', '1:2'],
        },
      ),
    ).rejects.toThrow(/不在同一父级/);
    expect(seen).toEqual([]);
  });

  it('同父级 → 传给引擎的 parent 就是那个真实容器(不是 page)', async () => {
    const seen: { count: number; parent: unknown }[] = [];
    const p1 = container('2:1');
    const host = hostOf([component('1:1', p1), component('1:2', p1)], seen);
    const r = await combineAsVariantsNodes(
      host,
      runtimeContext(['inPlaceVariants'], 'figma'),
      { ids: ['1:1', '1:2'], name: 'set' },
    );
    expect(r.created.type).toBe('COMPONENT_SET');
    expect(seen[0]?.parent).toBe(p1);
    // 绝不能是 host.currentPage
    expect(seen[0]?.parent).not.toBe(host.currentPage);
  });
});
