import { describe, expect, it } from 'vitest';
import { reparentNodes } from '../core/nodes';
import { type FakeHost, makeFrame, makeHost, makeRect } from './fixtures';

/**
 * reparent 的两条新增前置/收尾(2026-10-20 真机现场)。
 *
 * 现场一:给 RECTANGLE 传 parentId,引擎只在 `insertChild` 里抛一句 `not a function`
 * —— 不点名参数、不提示正确形状。而它恰好是搭「药丸 / 标签」最自然的一步(拿
 * RECTANGLE 当底再平铺 TEXT),踩到就要拆了重建。现在动手前拦下并给出替代形状。
 *
 * 现场二:节点移进 auto-layout 父级时,引擎会把**被移动节点自己**的布局属性改成
 * 父级那一套 —— 实测一个 HORIZONTAL + pa=CENTER/ca=MAX 的行 FRAME 移进 VERTICAL
 * 父级后,layoutMode 变 VERTICAL、两轴对齐对调,回包零告警,下一批再读才发现
 * 「行里的图标被竖着摞」。移前快照、移后压回,压不住才点名。
 */

function verticalParent(): {
  host: FakeHost;
  parent: ReturnType<typeof makeFrame>;
} {
  const parent = makeFrame('1:1', '纵向父级');
  Object.assign(parent as unknown as Record<string, unknown>, {
    layoutMode: 'VERTICAL',
    itemSpacing: 8,
    primaryAxisSizingMode: 'FIXED',
    counterAxisSizingMode: 'FIXED',
    children: [],
  });
  return { host: makeHost([parent]), parent };
}

/** 复刻引擎行为:插进 auto-layout 父级时把子节点方向继承成父级、两轴对齐对调 */
function engineAppend(
  parent: ReturnType<typeof makeFrame>,
  mutate: (c: unknown) => void,
): void {
  Object.defineProperty(parent, 'appendChild', {
    value: (child: unknown) => {
      const self = parent as unknown as { children?: unknown[] };
      self.children = [...(self.children ?? []), child];
      (child as { parent?: unknown }).parent = parent;
      mutate(child);
    },
    configurable: true,
  });
}

describe('reparentNodes 前置:目标父级必须是容器', () => {
  it('parentId 指向 RECTANGLE → 动手前点名,并给出正确形状', async () => {
    const rect = makeRect('1:2', '药丸底');
    const child = makeRect('1:3', '文案');
    const host = makeHost([rect, child]);
    await expect(
      reparentNodes(host, { ids: [child.id], parentId: rect.id }),
    ).rejects.toThrow(/不是容器/);
    await expect(
      reparentNodes(host, { ids: [child.id], parentId: rect.id }),
    ).rejects.toThrow(/FRAME/);
    // 没被挪走:报错发生在任何写入之前
    expect(child.parent?.id).not.toBe(rect.id);
  });

  it('parentId 指向 FRAME → 正常移入', async () => {
    const parent = makeFrame('1:1', '容器');
    const child = makeRect('1:2', '子');
    const host = makeHost([parent, child]);
    const r = await reparentNodes(host, {
      ids: [child.id],
      parentId: parent.id,
    });
    expect(r.moved).toHaveLength(1);
    expect(child.parent?.id).toBe(parent.id);
  });
});

describe('reparentNodes 收尾:被父级布局改写的属性要压回', () => {
  it('移进 auto-layout 父级后,被移节点自己的 layoutMode/对齐保持移前值', async () => {
    const { host, parent } = verticalParent();
    const row = makeFrame('1:2', '横向行');
    Object.assign(row as unknown as Record<string, unknown>, {
      layoutMode: 'HORIZONTAL',
      itemSpacing: 5,
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'MAX',
    });
    engineAppend(parent, (c) => {
      Object.assign(c as Record<string, unknown>, {
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'MAX',
        counterAxisAlignItems: 'CENTER',
      });
    });

    host.registry.set(row.id, row);
    const r = await reparentNodes(host, { ids: [row.id], parentId: parent.id });

    expect(r.moved[0].layoutMode).toBe('HORIZONTAL');
    expect(r.warnings).toBeUndefined();
    const n = row as unknown as Record<string, unknown>;
    expect(n.primaryAxisAlignItems).toBe('CENTER');
    expect(n.counterAxisAlignItems).toBe('MAX');
  });

  it('压不回时点名(不许「回显成功实则被改」)', async () => {
    const { host, parent } = verticalParent();
    const row = makeFrame('1:2', '横向行');
    Object.assign(row as unknown as Record<string, unknown>, {
      layoutMode: 'HORIZONTAL',
    });
    // 移前 HORIZONTAL;引擎插入时改成 VERTICAL,且之后的写入全被吞 → 压回必然失败
    let mode = 'HORIZONTAL';
    Object.defineProperty(row, 'layoutMode', {
      get: () => mode,
      set: () => {},
      configurable: true,
    });
    engineAppend(parent, () => {
      mode = 'VERTICAL';
    });
    host.registry.set(row.id, row);

    const r = await reparentNodes(host, { ids: [row.id], parentId: parent.id });
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('layoutMode');
    expect(warn).toContain('jsd_set_layout');
  });
});
