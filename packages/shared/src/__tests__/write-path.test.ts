import { beforeEach, describe, expect, it } from 'vitest';
import { executeOps } from '../core/execute';
import { type RuntimeContext, runtimeContext } from '../core/runtime';
import { updateSelection } from '../core/update';
import {
  type FakeHost,
  makeFrame,
  makeHost,
  makeInstance,
  makeLine,
  makeRect,
  makeText,
} from './fixtures';

/**
 * 两条写路径的行为基线。
 *
 * 创建(buildNode / executeOps)与修改(updateSelection)各写了一遍属性赋值,字段
 * 集合大量重叠但**语义刻意不同**:创建路径带默认值与推断(P10 清灰底、P18 padding
 * 归零 + sizingMode FIXED 推断),修改路径是纯增量覆盖。
 *
 * 这里把「同一个字段在两条路径下的差异」钉成断言 —— 它们是 0001 抽 PropWriter 时的
 * 验收标准:差异必须是显式的策略,不能退化成「谁碰巧写在后面」。
 *
 * ⚠ capabilities 是模块级可变全局(见 0002),这里每个用例前显式复位,
 * 免得用例之间互相污染 —— 这个 beforeEach 本身就是 0002 要消灭的东西。
 */
let host: FakeHost;

/**
 * 能力表现在是显式上下文:每个用例自造一份,谁也改不了别人的。
 * (0002 之前这里是 `setHostCapabilities(null)` 复位模块级全局 —— 那种写法下
 * 用例并行或顺序变化都会互相污染,这里不再需要。)
 */
const ctx: RuntimeContext = runtimeContext(null);

beforeEach(() => {
  host = makeHost();
});

describe('修改路径 updateSelection', () => {
  it('几何字段:只有显式给的那一维才动', async () => {
    const rect = makeRect();
    host = makeHost([rect]);
    await updateSelection(host, ctx, { ids: [rect.id], props: { x: 40 } });
    expect(rect.x).toBe(40);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(100);
  });

  it('width/height 走 resize,两条边一起给', async () => {
    const rect = makeRect();
    host = makeHost([rect]);
    await updateSelection(host, ctx, {
      ids: [rect.id],
      props: { width: 300, height: 200 },
    });
    expect(rect.width).toBe(300);
    expect(rect.height).toBe(200);
  });

  it('只给 height 时另一维沿用当前值', async () => {
    const rect = makeRect();
    host = makeHost([rect]);
    await updateSelection(host, ctx, { ids: [rect.id], props: { height: 42 } });
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(42);
  });

  it('LINE 零轴豁免:一维为 0 抬到引擎下限而不是报错', async () => {
    const line = makeLine();
    line.height = 0;
    host = makeHost([line]);
    await updateSelection(host, ctx, {
      ids: [line.id],
      props: { height: 0, width: 120 },
    });
    expect(line.height).toBe(0.01);
    expect(line.width).toBe(120);
  });

  it('非 LINE 低于最小尺寸:给可读报错,不把引擎断言抛给调用方', async () => {
    const rect = makeRect();
    host = makeHost([rect]);
    await expect(
      updateSelection(host, ctx, { ids: [rect.id], props: { width: 0 } }),
    ).rejects.toThrow(/最小为 0\.01/);
  });

  it('TEXT 整体流程:字体加载先于逐属性赋值', async () => {
    const text = makeText();
    host = makeHost([text]);
    const order: string[] = [];
    const realLoad = host.loadFontAsync;
    host.loadFontAsync = async (font) => {
      order.push('loadFont');
      await realLoad(font);
      order.push('assigned');
    };
    await updateSelection(host, ctx, {
      ids: [text.id],
      props: { characters: '你好' },
    });
    // needLoad 由 characters/fontSize/fontName 触发:取节点现有字体,不必传 fontName
    expect(order).toEqual(['loadFont', 'assigned']);
    expect(text.characters).toBe('你好');
    expect(host.fontCalls).toEqual([
      { family: 'PingFang SC', style: 'Regular' },
    ]);
  });

  it('方法名即字段分组:越界字段直接拒绝,不静默忽略', async () => {
    const rect = makeRect();
    host = makeHost([rect]);
    await expect(
      updateSelection(
        host,
        ctx,
        { ids: [rect.id], props: { x: 1, characters: 'nope' } as never },
        'move',
      ),
    ).rejects.toThrow(/move 不接受字段/);
  });

  it('能力门控字段缺失时点名告警,不让调用方以为写上了', async () => {
    const rect = makeRect();
    host = makeHost([rect]);
    const r = await updateSelection(
      host,
      ctx,
      { ids: [rect.id], props: { fillStyleId: 'S:1' } },
      'set_fill',
    );
    expect(r.warnings?.join('')).toContain('fillStyleId');
    expect(rect).not.toHaveProperty('fillStyleId');
  });

  it('同一份 NODE、两种平台上下文:能力判定互不干扰(0002 的核心收益)', async () => {
    const rect = makeRect();
    host = makeHost([rect]);

    const withStyles = runtimeContext(['styles']);

    // 未注入能力:退回运行时属性探测 —— 节点没有 fillStyleId 就判定不生效
    const unknown = await updateSelection(
      host,
      ctx,
      { ids: [rect.id], props: { fillStyleId: 'S:1' } },
      'set_fill',
    );
    expect(unknown.warnings?.join('')).toContain('fillStyleId');

    // 同一进程、同一节点,换一个声明了 styles 能力的上下文:不再报门控忽略
    const declared = await updateSelection(
      host,
      withStyles,
      { ids: [rect.id], props: { fills: [] } },
      'set_fill',
    );
    expect(declared.warnings?.join('') ?? '').not.toContain('能力门控');
  });

  it('INSTANCE 内子节点改样式 → 给出主组件里对应子节点的 id', async () => {
    const instance = makeInstance();
    const inner = makeRect('9:9', 'icon');
    instance.appendChild(inner);
    const main = makeFrame('8:8', 'main');
    const mainIcon = makeRect('8:9', 'icon');
    main.appendChild(mainIcon);
    instance.mainComponent = main;
    host = makeHost([inner]);

    const r = await updateSelection(
      host,
      ctx,
      {
        ids: [inner.id],
        props: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
      },
      'set_fill',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('实例子节点样式覆盖有平台风险');
    expect(warn).toContain(mainIcon.id);
  });

  it('几何字段在实例上属于正常覆盖,不该报样式风险', async () => {
    const instance = makeInstance();
    const inner = makeRect('9:9', 'icon');
    instance.appendChild(inner);
    host = makeHost([inner]);
    const r = await updateSelection(
      host,
      ctx,
      { ids: [inner.id], props: { x: 12 } },
      'move',
    );
    expect(r.warnings).toBeUndefined();
  });
});

describe('创建路径 executeOps', () => {
  it('P10:只给描边没给填充 → 显式清空填充(非 FRAME)', async () => {
    const r = await executeOps(
      host,
      ctx,
      { type: 'RECTANGLE', name: 'icon', width: 24, height: 24, strokes: [] },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(Array.isArray(created?.fills)).toBe(true);
    expect(created?.fills).toHaveLength(0);
  });

  it('P10 例外:FRAME 不清填充(容器按引擎默认走)', async () => {
    const r = await executeOps(
      host,
      ctx,
      { type: 'FRAME', name: 'card', width: 100, height: 100, strokes: [] },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.fills).toBeNull();
  });

  it('P18:开 auto-layout 时 padding/itemSpacing 显式归零', async () => {
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: 'row',
        width: 300,
        height: 100,
        layoutMode: 'HORIZONTAL',
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.paddingTop).toBe(0);
    expect(created?.paddingLeft).toBe(0);
    expect(created?.itemSpacing).toBe(0);
  });

  it('P18:给了宽度又没声明该轴 sizingMode → 该轴钉成 FIXED', async () => {
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: 'row',
        width: 690,
        height: 210,
        layoutMode: 'HORIZONTAL',
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.layoutMode).toBe('HORIZONTAL');
    expect(created?.primaryAxisSizingMode).toBe('FIXED');
    expect(created?.counterAxisSizingMode).toBe('FIXED');
  });

  it('P18:调用方显式声明过的 sizingMode 不被推断抢走', async () => {
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: 'row',
        width: 500,
        height: 80,
        layoutMode: 'HORIZONTAL',
        counterAxisSizingMode: 'AUTO',
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.counterAxisSizingMode).toBe('AUTO');
  });

  it('TEXT 默认值:characters/text 与 fontSize 16', async () => {
    const r = await executeOps(
      host,
      ctx,
      { type: 'TEXT', name: 'label' },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.characters).toBe('text');
    expect(created?.fontSize).toBe(16);
  });

  it('LINE 零轴豁免与修改路径同源', async () => {
    const r = await executeOps(
      host,
      ctx,
      { type: 'LINE', name: 'rule', width: 200, height: 0 },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.height).toBe(0.01);
  });
});

describe('两条写路径的语义差异(创建 ≠ 修改)', () => {
  it('同一份 size 意图:创建给默认值带 LINE 豁免,修改抛可读错误不容忍 0', async () => {
    // 创建:LINE 高度 0 是合法形态(横线),抬到 0.01
    const r = await executeOps(
      host,
      ctx,
      { type: 'LINE', name: 'rule', width: 10, height: 0 },
      { mode: 'absolute', x: 0, y: 0 },
    );
    expect(host.registry.get(r.created[0].id)?.height).toBe(0.01);

    // 修改:非 LINE 给 0 必须报错而不是静默改成 0.01
    const rect = makeRect();
    const h2 = makeHost([rect]);
    await expect(
      updateSelection(h2, ctx, { ids: [rect.id], props: { width: 0 } }),
    ).rejects.toThrow(/最小为 0\.01/);
  });

  it('同一份 layoutMode 意图:创建补默认值并推断 sizingMode,修改只改它一个字段', async () => {
    const r = await executeOps(
      host,
      ctx,
      { type: 'FRAME', name: 'row', width: 300, layoutMode: 'VERTICAL' },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.paddingTop).toBe(0);
    expect(created?.primaryAxisSizingMode).toBe('FIXED');

    const frame = makeFrame();
    frame.itemSpacing = 24;
    frame.paddingTop = 10;
    const h2 = makeHost([frame]);
    await updateSelection(h2, ctx, {
      ids: [frame.id],
      props: { layoutMode: 'VERTICAL' },
    });
    // 修改路径不动 padding/itemSpacing ——「纯增量覆盖」与「带默认值」的分界
    expect(frame.paddingTop).toBe(10);
    expect(frame.itemSpacing).toBe(24);
    expect(frame.layoutMode).toBe('VERTICAL');
  });
});
