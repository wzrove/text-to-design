import { describe, expect, it } from 'vitest';
import { combineAsVariantsNodes } from '../core/component';
import type { DesignHost, NodeSkeleton } from '../core/host';
import { runtimeContext } from '../core/runtime';
import { makeFrame, makeHost } from './fixtures';

/**
 * 引擎把 `combineAsVariants` 路由到了别的实现(真机 2026-10-20,即时设计)。
 *
 * typings 声明返回 `ComponentSetNode`(`plugin-api.d.ts:127`),契约放宽成
 * `NodeSkeleton` ⇒ 「返回类型对不对」在两处都没有编译期信号。实测该调用**成功返回**、
 * `name` 也设得上,但 `type` 是 `BOOLEAN_OPERATION` —— 引擎按布尔节点去取
 * `booleanOperation` 才炸 `Value is not a string`。
 *
 * 关键:这个假成功**不能当成功**。回包 `created` 里躺一个布尔节点、画布上没有变体集,
 * 正是 0007 的「回显成功、实际没发生」。故按实际类型分流。
 */
/** 真容器:合并落点必须是 BaseNode & ChildrenMixin,不能是 null(见 combine-parent.test) */
function container(id: string): NodeSkeleton {
  return makeFrame(id, id);
}

function makeComponent(
  id: string,
  parent: NodeSkeleton = container('2:parent'),
): NodeSkeleton {
  const n = {
    ...makeFrame(id, id),
    type: 'COMPONENT',
  } as unknown as NodeSkeleton;
  n.parent = parent;
  return n;
}

/** 让 host.combineAsVariants 返回指定类型的节点(模拟引擎的错误路由) */
function hostReturning(type: string): DesignHost {
  const parent = container('2:parent');
  const a = makeComponent('1:1', parent);
  const b = makeComponent('1:2', parent);
  const host = makeHost([a, b]) as unknown as DesignHost & {
    combineAsVariants: () => NodeSkeleton;
  };
  host.combineAsVariants = () =>
    ({ ...makeFrame('9:1', '假的集合'), type }) as unknown as NodeSkeleton;
  return host;
}

describe('combineAsVariants:按**实际返回类型**校验,不只判「调用有没有抛」', () => {
  it('返回 BOOLEAN_OPERATION(真机形态)→ 不算成功,报平台缺陷', async () => {
    const host = hostReturning('BOOLEAN_OPERATION');
    await expect(
      combineAsVariantsNodes(
        host,
        runtimeContext(['inPlaceVariants'], 'figma'),
        {
          ids: ['1:1', '1:2'],
        },
      ),
    ).rejects.toThrow(/不是 COMPONENT_SET/);
  });

  it('返回 FRAME 同样不算(任何非 COMPONENT_SET 都拒)', async () => {
    const host = hostReturning('FRAME');
    await expect(
      combineAsVariantsNodes(
        host,
        runtimeContext(['inPlaceVariants'], 'figma'),
        {
          ids: ['1:1', '1:2'],
        },
      ),
    ).rejects.toThrow(/不是 COMPONENT_SET/);
  });

  it('真返回 COMPONENT_SET 时正常通过(不误伤)', async () => {
    const host = hostReturning('COMPONENT_SET');
    const r = await combineAsVariantsNodes(
      host,
      runtimeContext(['inPlaceVariants'], 'figma'),
      { ids: ['1:1', '1:2'], name: '真集合' },
    );
    expect(r.created.type).toBe('COMPONENT_SET');
    expect(r.created.name).toBe('真集合');
  });

  it('未声明 inPlaceVariants 时**拿不到原件**:所有姿势传的都是克隆件(避免毁入参组件)', async () => {
    // 判据不能是「combineAsVariants 有没有被调」—— 克隆姿势也调它。
    // 要判的是**传进去的是不是原件**:原位姿势会把 components 本身交出去,
    // 而真机实测该姿势失败后会毁掉入参组件(用户丢组件),故本平台绝不能走到它。
    // 夹具的 clone() 返回 this(同一个对象),身份判据会失效 —— 这里装真 clone
    const withRealClone = (n: NodeSkeleton, id: string): NodeSkeleton => {
      (n as unknown as { clone: () => NodeSkeleton }).clone = () =>
        makeComponent(id);
      return n;
    };
    const a = withRealClone(makeComponent('1:1'), '1:1c');
    const b = withRealClone(makeComponent('1:2'), '1:2c');
    const originals = new Set([a, b]);
    const passedOriginals: string[] = [];
    const host = makeHost([a, b]) as unknown as DesignHost & {
      combineAsVariants: (nodes: readonly NodeSkeleton[]) => NodeSkeleton;
    };
    host.combineAsVariants = (nodes) => {
      for (const n of nodes) {
        if (originals.has(n)) passedOriginals.push(n.id);
      }
      return makeFrame('9:1', 'x');
    };
    await expect(
      combineAsVariantsNodes(host, runtimeContext([], 'jsdesign'), {
        ids: ['1:1', '1:2'],
      }),
    ).rejects.toThrow();
    expect(passedOriginals).toEqual([]);
  });
});
