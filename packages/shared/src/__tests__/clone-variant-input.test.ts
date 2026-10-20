import { describe, expect, it } from 'vitest';
import { combineAsVariantsNodes } from '../core/component';
import type { DesignHost, NodeSkeleton } from '../core/host';
import { runtimeContext } from '../core/runtime';
import { makeFrame, makeHost } from './fixtures';

/**
 * 未声明 `inPlaceVariants` 的平台**在调用引擎前就中止**(快速失败)。
 *
 * 历史:这里原先测「clone 返回 INSTANCE 时过滤掉,别把 INSTANCE 交给引擎」——
 * 那是为 jsDesign 的克隆兜底姿势写的。2026-10-20 真机逐层取证后,克隆姿势被整体
 * 删除,因为:
 * · 裸调(零判断)证明引擎把「合并组件」路由到布尔运算,返回 BOOLEAN_OPERATION
 *   并把入参组件搬走 —— 与入参无关;
 * · 克隆拿到的是 INSTANCE(typings 说 ComponentNode),即使过滤也凑不出 2 个
 *   合规 COMPONENT,必然失败;
 * · 每次失败都可能留 BOOLEAN_OPERATION 残骸、把用户组件搬走。
 * ⇒ 与其跑一轮注定失败的引擎调用,不如直接点名(这正是「快速失败」的取舍)。
 *
 * 现在锁的是:未声明能力位时**一次引擎调用都不发生**。
 */
function component(id: string, parent: NodeSkeleton): NodeSkeleton {
  const n = { ...makeFrame(id, id), type: 'COMPONENT' } as unknown as NodeSkeleton;
  n.parent = parent;
  return n;
}

function container(id: string): NodeSkeleton {
  return makeFrame(id, id);
}

describe('变体合并:未声明 inPlaceVariants 时快速失败,不落引擎', () => {
  it('jsDesign(不声明 inPlaceVariants)→ 引擎一次都不被调用', async () => {
    const parent = container('2:parent');
    const seen: unknown[] = [];
    const host = makeHost([component('1:1', parent), component('1:2', parent)]) as unknown as DesignHost & {
      combineAsVariants: (...a: unknown[]) => NodeSkeleton;
    };
    host.combineAsVariants = (...a) => {
      seen.push(a);
      return { ...makeFrame('9:1', 'x'), type: 'COMPONENT_SET' } as unknown as NodeSkeleton;
    };
    await expect(
      combineAsVariantsNodes(host, runtimeContext([], 'jsdesign'), {
        ids: ['1:1', '1:2'],
      }),
    ).rejects.toThrow(/做不出来|布尔运算/);
    // 关键:引擎一次都不该收到调用(快速失败的全部意义)
    expect(seen).toEqual([]);
  });

  it('报错要带根因与可执行出口(不允许只说「失败」)', async () => {
    const parent = container('2:parent');
    const host = makeHost([component('1:1', parent), component('1:2', parent)]) as unknown as DesignHost;
    const err = await combineAsVariantsNodes(host, runtimeContext([], 'jsdesign'), {
      ids: ['1:1', '1:2'],
    }).catch((e: Error) => e.message);
    expect(err).toContain('BOOLEAN_OPERATION');
    expect(err).toContain('画布上手动合并');
    expect(err).toContain('独立 COMPONENT');
  });

  it('声明了 inPlaceVariants(Figma / MasterGo)→ 正常走原生合并', async () => {
    const parent = container('2:parent');
    const seen: unknown[] = [];
    const host = makeHost([component('1:1', parent), component('1:2', parent)]) as unknown as DesignHost & {
      combineAsVariants: (n: readonly NodeSkeleton[], p: unknown) => NodeSkeleton;
    };
    host.combineAsVariants = (n, p) => {
      seen.push({ count: n.length, parent: p });
      return { ...makeFrame('9:1', 'set'), type: 'COMPONENT_SET' } as unknown as NodeSkeleton;
    };
    const r = await combineAsVariantsNodes(
      host,
      runtimeContext(['inPlaceVariants'], 'figma'),
      { ids: ['1:1', '1:2'], name: 'set' },
    );
    expect(r.created.type).toBe('COMPONENT_SET');
    expect(seen).toHaveLength(1);
  });
});
