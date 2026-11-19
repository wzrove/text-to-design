import { describe, expect, it } from 'vitest';
import { removeNodes, reparentNodes } from '../core/nodes';
import { NO_CAPABILITIES } from '../core/runtime';
import {
  attach,
  type FakeHost,
  makeFrame,
  makeHost,
  makeInstance,
  makeRect,
} from './fixtures';

/**
 * error_reports 2026-11-17 当天记录里的两类(engine_error / 不可行动文案)。
 *
 * ① `jsd_reparent_nodes` → `in insertChild: Cannot insert node at index greater than
 *    the number of existing siblings`:节点已在该父级下又要挪到末位时,引擎**先摘后插**,
 *    那一刻兄弟数少一,index == 原长度 就越界。夹取必须按「插入瞬间」的兄弟数算。
 * ② `jsd_delete_node` → `没有要删除的节点`:同样一句话既可能是 id 失效、也可能是
 *    matchName 全过滤掉、也可能是什么都没选,调用方无从下手。
 */

/** 复刻引擎 insertChild 的「先摘后插」:已在场的节点先从 children 移除,再按下标插入 */
function engineLikeFrame(id: string, name: string) {
  const parent = makeFrame(id, name);
  const self = parent as unknown as {
    children: unknown[];
    insertChild: (index: number, child: unknown) => void;
  };
  self.insertChild = (index: number, child: unknown) => {
    const kids = [...self.children].filter(
      (c) => (c as { id?: string }).id !== (child as { id?: string }).id,
    );
    if (index > kids.length) {
      throw new Error(
        'in insertChild: Cannot insert node at index greater than the number of existing siblings',
      );
    }
    kids.splice(index, 0, child);
    self.children = kids;
    (child as { parent?: unknown }).parent = parent;
  };
  return parent;
}

describe('reparent 层序:index 按插入瞬间的兄弟数夹取', () => {
  it('已在父级下挪到末位(index = children.length)不再撞 insertChild 越界', async () => {
    const parent = engineLikeFrame('1:1', '容器');
    const a = makeRect('1:2', 'a');
    const b = makeRect('1:3', 'b');
    const c = makeRect('1:4', 'c');
    attach(parent, a, b, c);
    const host: FakeHost = makeHost([parent, a, b, c]);
    // 把 c 挪到「最后一位」:调用方按 children.length(=3)算,正是线上那次入参
    const r = await reparentNodes(host, NO_CAPABILITIES, {
      ids: [c.id],
      parentId: parent.id,
      index: 3,
    });
    expect(r.moved.map((n) => n.id)).toEqual([c.id]);
    const kids = (parent as unknown as { children: { id: string }[] }).children;
    expect(kids.map((n) => n.id)).toEqual(['1:2', '1:3', '1:4']);
  });

  it('跨父级移动的 index 上限是目标父级兄弟数(不受旧父级影响)', async () => {
    const to = engineLikeFrame('2:1', '目标');
    const x = makeRect('2:2', 'x');
    attach(to, x);
    const from = makeFrame('3:1', '来源');
    const mover = makeRect('3:2', 'moving');
    attach(from, mover);
    const host = makeHost([to, x, from, mover]);
    await reparentNodes(host, NO_CAPABILITIES, {
      ids: [mover.id],
      parentId: to.id,
      index: 5,
    });
    const kids = (to as unknown as { children: { id: string }[] }).children;
    expect(kids.map((n) => n.id)).toEqual(['2:2', '3:2']);
  });
});

describe('reparent 父级:实例内节点调层序放行', () => {
  it('目标父级是实例、但被移动节点本来就在其中时不再一刀切拒绝', async () => {
    const inst = makeInstance('4:1', '实例');
    const child = makeRect('4:2', '成员');
    attach(inst, child);
    const sibling = makeRect('4:3', '成员2');
    attach(inst, sibling);
    const host = makeHost([inst, child, sibling]);
    // 实例内成员之间调层序:不新增子节点,引擎允许
    await expect(
      reparentNodes(host, NO_CAPABILITIES, {
        ids: [sibling.id],
        parentId: inst.id,
        index: 0,
      }),
    ).resolves.toBeDefined();
  });

  it('把外部节点移进实例仍然拒绝(规则没放宽)', async () => {
    const inst = makeInstance('4:1', '实例');
    const outside = makeRect('4:9', '外面的');
    const host = makeHost([inst, outside]);
    await expect(
      reparentNodes(host, NO_CAPABILITIES, {
        ids: [outside.id],
        parentId: inst.id,
      }),
    ).rejects.toThrow(/INSTANCE/);
  });
});

describe('jsd_delete_node:空结果点名成因', () => {
  it('ids 全部失效时点名请求与复核手段', async () => {
    const host = makeHost([]);
    await expect(
      removeNodes(host, NO_CAPABILITIES, { ids: ['9:9'] }),
    ).rejects.toThrow(/没有要删除的节点:这 1 个 id 都没解析到节点/);
  });

  it('matchName 过滤光时点名该字段', async () => {
    const a = makeRect('1:1', '按钮');
    const host = makeHost([a]);
    await expect(
      removeNodes(host, NO_CAPABILITIES, { ids: ['1:1'], matchName: '不存在' }),
    ).rejects.toThrow(/matchName="不存在"/);
  });

  it('什么都没传也没选中时给出三条可选动作', async () => {
    const host = makeHost([]);
    await expect(removeNodes(host, NO_CAPABILITIES, {})).rejects.toThrow(
      /jsd_select_nodes/,
    );
  });
});
