import { beforeEach, describe, expect, it } from 'vitest';
import {
  setInstanceProperties,
  syncInstanceOverrides,
  toComponentPropertyWrites,
} from '../core/component';
import { executeOps } from '../core/execute';
import { listFonts } from '../core/export';
import type { NodeSkeleton } from '../core/host';
import { findNodes } from '../core/nodes';
import { normalizeLayoutGrids } from '../core/normalize';
import { type RuntimeContext, runtimeContext } from '../core/runtime';
import { trySerialize } from '../core/serialize';
import { updateSelection } from '../core/update';
import { LAYOUT_GRID_UNVERIFIABLE_PLATFORMS } from '../dicts/platform-value-domain';
import { serializedNodeSchema } from '../schemas/serialized-node';
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
 * 集合大量重叠但**语义刻意不同**:创建路径带默认值与推断(清灰底、padding
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
  it('只给描边没给填充 → 显式清空填充(非 FRAME)', async () => {
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

  it('FRAME 例外:不清填充(容器按引擎默认走)', async () => {
    const r = await executeOps(
      host,
      ctx,
      { type: 'FRAME', name: 'card', width: 100, height: 100, strokes: [] },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.fills).toBeNull();
  });

  it('开 auto-layout 时 padding/itemSpacing 显式归零', async () => {
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

  it('给了宽度又没声明该轴 sizingMode → 该轴钉成 FIXED', async () => {
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

  it('调用方显式声明过的 sizingMode 不被推断抢走', async () => {
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

  it('创建时显式给对齐参数 → 落成请求值(此前 create 分支静默丢弃,节点落成 MIN)', async () => {
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: 'box',
        width: 300,
        height: 100,
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'CENTER',
        counterAxisAlignItems: 'CENTER',
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.primaryAxisAlignItems).toBe('CENTER');
    expect(created?.counterAxisAlignItems).toBe('CENTER');
  });

  it('插子节点触发引擎重算把对齐回写成 MIN → settle 再压回请求值', async () => {
    // 复刻引擎行为:appendChild 触发布局重算,把对齐回写成 MIN
    host.createFrame = () => {
      const f = makeFrame(`${host.registry.size + 1}:frame`);
      const realAppend = f.appendChild.bind(f);
      (
        f as unknown as {
          appendChild: (c: Parameters<typeof realAppend>[0]) => unknown;
        }
      ).appendChild = (c) => {
        const ret = realAppend(c);
        (
          f as unknown as { primaryAxisAlignItems: string }
        ).primaryAxisAlignItems = 'MIN';
        (
          f as unknown as { counterAxisAlignItems: string }
        ).counterAxisAlignItems = 'MIN';
        return ret;
      };
      return f;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: 'box',
        width: 300,
        height: 100,
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'CENTER',
        counterAxisAlignItems: 'CENTER',
        children: [{ type: 'RECTANGLE', name: 'child', width: 10, height: 10 }],
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const created = host.registry.get(r.created[0].id);
    expect(created?.primaryAxisAlignItems).toBe('CENTER');
    expect(created?.counterAxisAlignItems).toBe('CENTER');
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

/**
 * 「回显成功却没生效」的回收面(设计决策 0007)。
 *
 * 0004 把这类事实统一到 `WriteOutcome`,但当时只有修改路径回收:创建路径只回收
 * 能力门控,`readback.ok === false` 与 `WriteOutcome.warnings` 被静默丢弃。
 * 这组用例钉住三条纪律:
 * ① 回读不一致(字体被降级 / TEXT 尺寸被 auto-resize 吃掉)→ 点名;
 * ② 根节点 x/y 被 placement 覆盖 → 点名(此前只能靠肉眼发现位置不对);
 * ③ 没有回读证据时不刷屏(引擎真吃下了值 → 一个字都不报)。
 */
describe('创建路径的写后回收(0007)', () => {
  it('resize 会把 textAutoResize 翻成 NONE → 显式声明的 HEIGHT 被压回(引擎实测行为)', async () => {
    host = makeHost();
    // 复刻 2026-09-19 实测的引擎行为:resize() 把 textAutoResize 重置为 NONE
    host.createText = () => {
      const t = makeText(`${host.registry.size + 1}:text`);
      const real = t.resize as (w: number, h: number) => void;
      t.resize = (w: number, h: number) => {
        real.call(t, w, h);
        (t as unknown as { textAutoResize: string }).textAutoResize = 'NONE';
      };
      return t;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'TEXT',
        name: '固定宽自动高',
        characters: '很长的一段正文',
        width: 200,
        textAutoResize: 'HEIGHT',
      },
      { mode: 'manual' },
    );
    const created = host.registry.get(r.created[0].id);
    // 尺寸回压跑在 textWriter 之后,声明过的值必须在它之后再压一遍
    expect(created?.textAutoResize).toBe('HEIGHT');
    expect(r.warnings, '声明生效了就不该告警').toBeUndefined();
  });

  it('给了 width 但没声明 textAutoResize → 引擎置 NONE,点名并给出 HEIGHT 写法', async () => {
    host = makeHost();
    host.createText = () => {
      const t = makeText(`${host.registry.size + 1}:text`);
      const real = t.resize as (w: number, h: number) => void;
      t.resize = (w: number, h: number) => {
        real.call(t, w, h);
        (t as unknown as { textAutoResize: string }).textAutoResize = 'NONE';
      };
      return t;
    };
    const r = await executeOps(
      host,
      ctx,
      { type: 'TEXT', name: '正文', characters: '很长的一段正文', width: 200 },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('textAutoResize');
    expect(warn, '要给出正确写法').toContain('HEIGHT');
  });

  it('TEXT 显式给 width 却被 auto-resize 吃掉 → 点名 width 并给出换行写法', async () => {
    host = makeHost();
    // 模拟引擎行为:WIDTH_AND_HEIGHT 的文本 resize 不生效(宽度按内容走)
    host.createText = () => {
      const t = makeText(`${host.registry.size + 1}:text`);
      t.resize = () => {};
      return t;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'TEXT',
        name: '正文段落',
        characters: '很长的一段正文',
        width: 690,
      },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn, 'width 被改写却没有点名').toContain('width');
    expect(warn).toContain('没生效');
    expect(warn, '要点出正确写法').toContain('textAutoResize');
  });

  it('fontName 回读不一致(平台静默退回默认字体)→ 点名 fontName', async () => {
    host = makeHost();
    host.createText = () => {
      const t = makeText(`${host.registry.size + 1}:text`);
      // 模拟引擎行为:该 family/style 组合不可用,赋值被忽略(不报错)
      Object.defineProperty(t, 'fontName', {
        get: () => ({ family: 'SourceHanSansCN', style: 'Regular' }),
        set: () => {},
      });
      return t;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'TEXT',
        name: '标题',
        characters: '标题',
        fontName: { family: 'Inter', style: 'Bold' },
      },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('fontName');
    expect(warn, '文案里应点名实测形态(Bold 被降级)').toContain('Bold');
  });

  it('引擎真吃下了值 → 不产生任何告警', async () => {
    host = makeHost();
    host.createText = () => {
      const t = makeText(`${host.registry.size + 1}:text`);
      // 真实引擎里新建 TEXT 的缺省就是 WIDTH_AND_HEIGHT(fixture 起点是 NONE)
      (t as unknown as { textAutoResize: string }).textAutoResize =
        'WIDTH_AND_HEIGHT';
      return t;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'TEXT',
        name: '标题',
        characters: '标题',
        fontName: { family: 'Inter', style: 'Bold' },
      },
      { mode: 'manual' },
    );
    expect(r.warnings).toBeUndefined();
  });

  it('短名对请求被引擎接受(实测 `{SourceHanSansCN, Bold}`)→ 不误报', async () => {
    host = makeHost();
    host.createText = () => {
      const t = makeText(`${host.registry.size + 1}:text`);
      // 实测:短名对请求被接受,落库与回读同为短名
      Object.defineProperty(t, 'fontName', {
        get: () => ({ family: 'SourceHanSansCN', style: 'Bold' }),
        set: () => {},
      });
      return t;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'TEXT',
        name: '标题',
        characters: '标题',
        fontName: { family: 'SourceHanSansCN', style: 'Bold' },
      },
      { mode: 'manual' },
    );
    // 两条判据都只对「清单形态」生效:短名对不在判据范围,一律放行(宁可漏报不误报)
    expect(r.warnings).toBeUndefined();
  });

  it('合法写法被引擎规范化(list 形态 → 短名)→ 不误报', async () => {
    host = makeHost();
    host.createText = () => {
      const t = makeText(`${host.registry.size + 1}:text`);
      // 实测:请求 (SourceHanSansCN_family, SourceHanSansCN-Bold) → 落库 (SourceHanSansCN, Bold)
      Object.defineProperty(t, 'fontName', {
        get: () => ({ family: 'SourceHanSansCN', style: 'Bold' }),
        set: () => {},
      });
      return t;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'TEXT',
        name: '标题',
        characters: '标题',
        fontName: {
          family: 'SourceHanSansCN_family',
          style: 'SourceHanSansCN-Bold',
        },
      },
      { mode: 'manual' },
    );
    expect(r.warnings, '规范化后的短名不该被判成没生效').toBeUndefined();
  });

  it('style 写成简称(回读仍带清单形态)→ 点名,并给出全名写法', async () => {
    host = makeHost();
    host.createText = () => {
      const t = makeText(`${host.registry.size + 1}:text`);
      // 实测:请求 (SourceHanSansCN_family, "Bold") 时引擎**不解析**、原样保留请求值
      // (family 仍带 _family),渲染退回默认字面;而合法写法会被规范化成短名。
      // 判定必须用**序列化后**的值做,才分得出这两种形态(见 utils.fontNotResolved)。
      Object.defineProperty(t, 'fontName', {
        get: () => ({ family: 'SourceHanSansCN_family', style: 'Bold' }),
        set: () => {},
      });
      return t;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'TEXT',
        name: '标题',
        characters: '标题',
        fontName: { family: 'SourceHanSansCN_family', style: 'Bold' },
      },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn, '简称没被解析却没点名').toContain('fontName');
    expect(warn, '要点出「回读仍是清单形态」这个事实').toContain('清单形态');
    expect(warn, '要给全名写法').toContain('-Bold');
  });

  it('回读被换成别的字面(明确矛盾)→ 点名 fontName', async () => {
    host = makeHost();
    host.createText = () => {
      const t = makeText(`${host.registry.size + 1}:text`);
      // 整族回退:请求 Inter,读回思源黑 —— 这是明确矛盾,必须点名
      Object.defineProperty(t, 'fontName', {
        get: () => ({ family: 'SourceHanSansCN', style: 'Regular' }),
        set: () => {},
      });
      return t;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'TEXT',
        name: '标题',
        characters: '标题',
        fontName: { family: 'Inter_family', style: 'Inter-Bold' },
      },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('fontName');
    expect(warn, '要带本次实测到的形态(整族被换掉)').toContain('整族回退');
  });

  it('根节点 x/y 被 placement 覆盖 → 点名并给出两种正确姿势', async () => {
    const r = await executeOps(host, ctx, {
      type: 'RECTANGLE',
      name: 'card',
      width: 10,
      height: 10,
      x: 2400,
      y: 0,
    });
    const warn = r.warnings?.join('') ?? '';
    expect(warn, '给了 x/y 却不生效,必须点名').toContain('placement');
    expect(warn).toContain('manual');
    // 坐标确实被视口中心覆盖(500,500 - 10/2)
    expect(r.created[0].x).toBe(495);

    const manual = await executeOps(
      host,
      ctx,
      { type: 'RECTANGLE', name: 'card', width: 10, height: 10, x: 2400, y: 0 },
      { mode: 'manual' },
    );
    expect(manual.warnings).toBeUndefined();
    expect(manual.created[0].x).toBe(2400);
  });

  it('修改路径同样回收:fontName 回读不一致 → warnings 点名', async () => {
    const text = makeText();
    Object.defineProperty(text, 'fontName', {
      get: () => ({ family: 'SourceHanSansCN', style: 'Regular' }),
      set: () => {},
    });
    host = makeHost([text]);
    const r = await updateSelection(
      host,
      ctx,
      {
        ids: [text.id],
        props: { fontName: { family: 'Inter', style: 'Bold' } },
      },
      'set_text',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('fontName');
  });
});

describe('平台类型事实的写前判定(0022)', () => {
  /**
   * 三个平台的上下文。能力表留空(null 也行)—— 这里验的是**平台轴**,与能力位无关:
   * 前者问「这个值/这个字段面本平台有没有」,后者问「这个能力面本平台有没有」。
   */
  const mastergo = runtimeContext(null, 'mastergo');
  const figma = runtimeContext(null, 'figma');
  const jsdesign = runtimeContext(null, 'jsdesign');

  it('MG:alignSelf 只有 STRETCH/INHERIT → MIN 被点名且不写入', async () => {
    host = makeHost();
    const r = await executeOps(
      host,
      mastergo,
      {
        type: 'FRAME',
        name: 'card',
        width: 100,
        height: 100,
        layoutMode: 'VERTICAL',
        layoutAlign: 'MIN',
      },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn, '此前这里只打插件 console,调用方什么都看不到').toContain(
      'layoutAlign',
    );
    expect(warn, '要点出本平台接受什么').toContain('INHERIT');
    const created = host.registry.get(r.created[0].id);
    expect(created?.layoutAlign, '被拒的值不该落到节点上').toBe('INHERIT');
  });

  it('同一份输入在 Figma 上正常写入(证明拒绝是平台差异,不是输入错)', async () => {
    host = makeHost();
    const r = await executeOps(
      host,
      figma,
      {
        type: 'FRAME',
        name: 'card',
        width: 100,
        height: 100,
        layoutMode: 'VERTICAL',
        layoutAlign: 'MIN',
      },
      { mode: 'manual' },
    );
    expect(r.warnings, 'Figma 支持 MIN,不该告警').toBeUndefined();
    expect(host.registry.get(r.created[0].id)?.layoutAlign).toBe('MIN');
  });

  it('MG:EllipseNode 不含 CornerMixin → 椭圆上的圆角被点名且不写入', async () => {
    host = makeHost();
    // fixture 的 createEllipse 复用了 makeRect(类型是 RECTANGLE);这里按真实形态造椭圆
    host.createEllipse = () => {
      const e = makeRect(`${host.registry.size + 1}:ellipse`) as unknown as {
        type: string;
        cornerRadius?: number;
      };
      e.type = 'ELLIPSE';
      return e as never;
    };
    const r = await executeOps(
      host,
      mastergo,
      { type: 'ELLIPSE', name: 'dot', width: 24, height: 24, cornerRadius: 8 },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('cornerRadius');
    expect(warn, '要区分「字段不存在」与「值不合法」').toContain(
      '没有对应字段',
    );
    expect(warn).toContain('ELLIPSE');
  });

  it('jsDesign 的 BlendMode 没有 PASS_THROUGH → 点名且不写入', async () => {
    const rect = makeRect();
    host = makeHost([rect]);
    const r = await updateSelection(
      host,
      jsdesign,
      { ids: [rect.id], props: { blendMode: 'PASS_THROUGH' } },
      'set_fill',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('PASS_THROUGH');
    expect(rect.blendMode, '节点应保持原值').toBe('NORMAL');
  });

  it('未注入平台(fail-open)→ 一律放行,与 0002 的既有口径一致', async () => {
    host = makeHost();
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: 'card',
        width: 100,
        height: 100,
        layoutMode: 'VERTICAL',
        layoutAlign: 'MIN',
      },
      { mode: 'manual' },
    );
    expect(r.warnings).toBeUndefined();
    expect(host.registry.get(r.created[0].id)?.layoutAlign).toBe('MIN');
  });
});

/**
 * **运行时**取值域收窄(2026-09-24 MG 真机逐值实测)。
 *
 * 与上一条 describe 的区别:那些值在 MG typings 里**缺席**(类型事实);这里两个值
 * typings 明明**声明支持**(`mainAxisAlignItems` 含 `'FLEX_END'`/`'SPACING_BETWEEN'`),
 * 但真机写进去被**静默忽略**(回读保留上一个生效值)。故收在
 * `PLATFORM_RUNTIME_VALUE_DOMAIN` 单独一张表:断言方向与类型事实那张相反。
 */
describe('运行时取值域收窄(类型声明支持但真机不吃)', () => {
  const mastergo = runtimeContext(null, 'mastergo');

  it('MG 主轴:MAX / SPACE_BETWEEN 写前拦下并给出实测支持值', async () => {
    host = makeHost();
    const r = await executeOps(
      host,
      mastergo,
      {
        type: 'FRAME',
        name: 'row',
        width: 200,
        height: 80,
        layoutMode: 'HORIZONTAL',
        primaryAxisAlignItems: 'MAX',
      },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('primaryAxisAlignItems');
    expect(warn, '要说清是运行时不吃,不是类型不支持').toContain(
      '运行时实测不接受',
    );
    expect(warn, '要给出实测支持的值').toContain('MIN');
    expect(host.registry.get(r.created[0].id)?.primaryAxisAlignItems).not.toBe(
      'MAX',
    );
  });

  it('MG 主轴:CENTER / MIN 照常放行(别把能用的也拦了)', async () => {
    host = makeHost();
    const r = await executeOps(
      host,
      mastergo,
      {
        type: 'FRAME',
        name: 'row',
        width: 200,
        height: 80,
        layoutMode: 'HORIZONTAL',
        primaryAxisAlignItems: 'CENTER',
      },
      { mode: 'manual' },
    );
    expect(r.warnings).toBeUndefined();
    expect(host.registry.get(r.created[0].id)?.primaryAxisAlignItems).toBe(
      'CENTER',
    );
  });

  it('MG 交叉轴:MAX 被拦,交叉轴没有 SPACE_BETWEEN 候选', async () => {
    host = makeHost();
    const r = await executeOps(
      host,
      mastergo,
      {
        type: 'FRAME',
        name: 'row',
        width: 200,
        height: 80,
        layoutMode: 'HORIZONTAL',
        counterAxisAlignItems: 'MAX',
      },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('counterAxisAlignItems');
    expect(warn).toContain('运行时实测不接受');
  });

  it('同一份输入在 Figma 上放行(证明是平台运行时差异)', async () => {
    host = makeHost();
    const r = await executeOps(
      host,
      runtimeContext(null, 'figma'),
      {
        type: 'FRAME',
        name: 'row',
        width: 200,
        height: 80,
        layoutMode: 'HORIZONTAL',
        primaryAxisAlignItems: 'MAX',
      },
      { mode: 'manual' },
    );
    expect(r.warnings).toBeUndefined();
    expect(host.registry.get(r.created[0].id)?.primaryAxisAlignItems).toBe(
      'MAX',
    );
  });

  it('jsDesign:子项 layoutAlign 只认 STRETCH/INHERIT → MIN 被点名且不写入', async () => {
    // 2026-09-24 jsDesign 真机实测:父设 counterAxisAlignItems=MAX(子默认贴右 x=150)后
    // 写子节点 layoutAlign=MIN,x 不动;写 STRETCH 立刻生效(w 40→180)
    // ⇒ 写入路径是通的,是引擎不收 MIN/CENTER/MAX
    const frame = makeFrame();
    const rect = makeRect();
    rect.parent = frame;
    frame.children = [rect];
    host = makeHost([frame, rect]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'jsdesign'),
      { ids: [rect.id], props: { layoutAlign: 'MIN' } },
      'set_layout',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('layoutAlign');
    expect(warn, '要报出本平台接受什么').toContain('STRETCH');
    expect(rect.layoutAlign).toBeUndefined();
  });

  it('jsDesign:layoutGrow 只认 0|1 → 3 被点名', async () => {
    const frame = makeFrame();
    const rect = makeRect();
    rect.parent = frame;
    frame.children = [rect];
    host = makeHost([frame, rect]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'jsdesign'),
      { ids: [rect.id], props: { layoutGrow: 3 } },
      'set_layout',
    );
    expect(r.warnings?.join('') ?? '').toContain('实测/类型支持 0 / 1');
  });

  it('jsDesign:STRETCH / grow 1 照常放行(别把能用的也拦了)', async () => {
    const frame = makeFrame();
    const rect = makeRect();
    rect.parent = frame;
    frame.children = [rect];
    host = makeHost([frame, rect]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'jsdesign'),
      { ids: [rect.id], props: { layoutAlign: 'STRETCH', layoutGrow: 1 } },
      'set_layout',
    );
    expect(r.warnings).toBeUndefined();
  });

  it('同一份输入在 Figma 上放行(layoutAlign MIN 是 Figma 的合法取值)', async () => {
    const frame = makeFrame();
    const rect = makeRect();
    rect.parent = frame;
    frame.children = [rect];
    host = makeHost([frame, rect]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'figma'),
      { ids: [rect.id], props: { layoutAlign: 'MIN' } },
      'set_layout',
    );
    expect(r.warnings).toBeUndefined();
  });
});

/**
 * 布局对齐的写后校验(0007 的回收面 + 2026-09-24 真机实测发现的缺口)。
 *
 * MG 真机:只传 `counterAxisAlignItems`(不传 layoutMode)时,引擎把它丢掉、
 * 回读仍是原值,而 `layoutWriter.settle` 因 `src.layoutMode == null` 提前返回 ——
 * 那条路径**完全没有回读校验**,调用方拿到的是「已更新 N 个节点」。
 */
describe('布局对齐的写后校验(只改对齐也要点名)', () => {
  it('只改对齐(不传 layoutMode)也必须回读校验 —— 被引擎丢掉要点名', async () => {
    // 2026-09-24 真机实测(MG):只传 counterAxisAlignItems 时,引擎把它丢掉、
    // 回读仍是原值,而 layoutWriter.settle 因为 `src.layoutMode == null` 提前返回,
    // 一条 warnings 都没有 —— 调用方拿到的是「已更新 1 个节点」。
    const frame = makeFrame();
    // 复刻引擎行为:主/交叉轴对齐的写入被忽略(读回仍是原值)
    Object.defineProperty(frame, 'counterAxisAlignItems', {
      get: () => 'MIN',
      set: () => {},
      configurable: true,
    });
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      ctx,
      { ids: [frame.id], props: { counterAxisAlignItems: 'MAX' } },
      'set_layout',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn, '只改对齐的路径此前完全没有点名').toContain(
      'counterAxisAlignItems',
    );
  });

  it('只改对齐且真的生效 → 不产生告警(别把成功也报成没生效)', async () => {
    const frame = makeFrame();
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      ctx,
      { ids: [frame.id], props: { primaryAxisAlignItems: 'CENTER' } },
      'set_layout',
    );
    expect(frame.primaryAxisAlignItems).toBe('CENTER');
    expect(r.warnings).toBeUndefined();
  });
});

/**
 * 「属性 × 节点类型」不匹配必须在**写入前**拦下(2026-09-24 MG 真机踩到)。
 *
 * `layoutGrids` / `clipsContent` 只存在于三平台的 frame 族 mixin 上,矩形没有该字段;
 * 而 `paintWriter` / `passthroughWriter` 此前是直写 —— 给矩形写 layoutGrids 回包
 * 「已更新 1 个节点」,回读却没有该字段(静默丢弃),创建路径连警告都没有。
 */
describe('属性 × 节点类型不匹配的拦截', () => {
  const ROWS_GRID = {
    pattern: 'ROWS' as const,
    count: 3,
    gutterSize: 16,
    alignment: 'MIN' as const,
    // MIN/MAX 形态下 sectionSize 必填(三平台引擎算不出来,本仓不猜),见 core/normalize
    sectionSize: 40,
  };

  it('创建路径:给矩形写 layoutGrids → 不写入,且点名(此前完全静默)', async () => {
    host = makeHost();
    // fixture 的 createRectangle 不带 layoutGrids;这里按「真有该字段的节点」造,
    // 否则「没写进去」会因为属性不存在而恒真 —— 测不出拦截本身
    host.createRectangle = () => {
      const n = makeRect(`${host.registry.size + 1}:rect`) as unknown as {
        layoutGrids: unknown[];
      };
      n.layoutGrids = [];
      return n as never;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'RECTANGLE',
        name: 'grid-target',
        width: 60,
        height: 60,
        layoutGrids: [ROWS_GRID],
      },
      { mode: 'manual' },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('layoutGrids');
    expect(warn).toContain('仅适用于');
    const created = host.registry.get(r.created[0].id) as unknown as {
      layoutGrids: unknown[];
    };
    expect(created.layoutGrids).toEqual([]);
  });

  it('创建路径:给 FRAME 写 layoutGrids → 正常写入,不告警', async () => {
    host = makeHost();
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: 'grid-ok',
        width: 60,
        height: 60,
        layoutGrids: [ROWS_GRID],
      },
      { mode: 'manual' },
    );
    expect(r.warnings).toBeUndefined();
    const created = host.registry.get(r.created[0].id) as unknown as {
      layoutGrids: { pattern: string }[];
    };
    expect(created.layoutGrids).toHaveLength(1);
    expect(created.layoutGrids[0].pattern).toBe('ROWS');
  });

  it('修改路径:给矩形写 layoutGrids → 不写入(点名由 MCP 反馈层负责)', async () => {
    const rect = makeRect();
    (rect as unknown as { layoutGrids: unknown[] }).layoutGrids = [];
    host = makeHost([rect]);
    await updateSelection(
      host,
      ctx,
      { ids: [rect.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    expect((rect as unknown as { layoutGrids: unknown[] }).layoutGrids).toEqual(
      [],
    );
  });

  it('形状专属字段同样走这条收口:给矩形传 pointCount 不写入', async () => {
    const rect = makeRect();
    (rect as unknown as { pointCount: number }).pointCount = 3;
    host = makeHost([rect]);
    await updateSelection(
      host,
      ctx,
      { ids: [rect.id], props: { pointCount: 12 } },
      'set_shape',
    );
    expect((rect as unknown as { pointCount: number }).pointCount).toBe(3);
  });
});

describe('布局网格的写后回读校验', () => {
  const ROWS_GRID = {
    pattern: 'ROWS' as const,
    count: 3,
    gutterSize: 16,
    alignment: 'MIN' as const,
    // MIN/MAX 形态下 sectionSize 必填(三平台引擎算不出来,本仓不猜),见 core/normalize
    sectionSize: 40,
  };

  /** 写入被引擎丢掉的节点:setter 收下即弃(模拟「回包成功、回读为空」) */
  function droppingFrame() {
    const frame = makeFrame();
    Object.defineProperty(frame, 'layoutGrids', {
      get: () => [],
      set: () => {},
      configurable: true,
    });
    return frame;
  }

  it('写入被引擎丢掉 → 点名,并说明「写入已发出」', async () => {
    // 2026-09-24 MG 真机:回包「已更新 1 个节点」,回读为空,零告警
    const frame = droppingFrame();
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      ctx,
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('layoutGrids 未生效');
    expect(warn, '要区分「写没发生」与「引擎没接」').toContain(
      '写入已发出但引擎未保留',
    );
  });

  it('节点上读不到该字段(存在性守卫跳过)→ 点名,并说明「写入未发生」', async () => {
    // MG 的 frame 族在 typings 里声明了 layoutGrids,但空值读不出来时门面的
    // `has` 会退化成「读得到就算存在」→ 写被静默跳过。这是与上一条**完全不同**的
    // 成因,必须能从结果里分开(否则排查无从下手)
    const frame = makeFrame();
    delete (frame as unknown as { layoutGrids?: unknown }).layoutGrids;
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      ctx,
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('layoutGrids 未生效');
    expect(warn).toContain('写入未发生');
  });

  it('真的落盘 → 不产生告警(别把成功也报成没生效)', async () => {
    const frame = makeFrame();
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      ctx,
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    expect(r.warnings).toBeUndefined();
    expect(
      (frame as unknown as { layoutGrids: unknown[] }).layoutGrids,
    ).toHaveLength(1);
  });

  it('幻影写入:同对象读得到、按 id 重新取数后没有 → 单独点名「未写入文档」', async () => {
    // 2026-09-24 jsDesign 真机:写 layoutGrids 回包成功、结果无告警(同对象回读有),
    // 但下一次调用的 jsd_find 读不到 ⇒ 赋值只落在不落文档的临时包装对象上。
    // jsDesign 的类型面齐全(BaseFrameMixin.layoutGrids / GridStyle.layoutGrids),
    // 所以这不是参数问题 —— 只看同对象会把这种写入报成成功,故必须双读。
    const frame = makeFrame();
    host = makeHost([frame]);
    host.getNodeById = () =>
      ({
        id: frame.id,
        type: 'FRAME',
        layoutGrids: [],
      }) as unknown as ReturnType<typeof host.getNodeById>;
    const r = await updateSelection(
      host,
      ctx,
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('layoutGrids 未生效');
    expect(warn, '要与「引擎没接」分开').toContain('未写入文档');
  });

  it('按 id 取数不可用(dynamic-page 平台会抛)→ fail-open,不误报', async () => {
    const frame = makeFrame();
    host = makeHost([frame]);
    host.getNodeById = () => {
      throw new Error(
        'Cannot call getNodeById with documentAccess: dynamic-page',
      );
    };
    const r = await updateSelection(
      host,
      ctx,
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    expect(r.warnings).toBeUndefined();
  });

  it('jsDesign:根因修好后不再套「不可验证」口径(违约金=噪声)', async () => {
    // jsDesign 曾因我们漏给 sectionSize/offset 被引擎整条拒绝且静默,当时按
    // 「本平台无法在一次执行内验证」兜着;归一化补齐后五种形态都真落盘并回读到值,
    // 再挂这条就是对每次成功写入报错 —— 故撤出名单,并在此钉住别回潮。
    expect(LAYOUT_GRID_UNVERIFIABLE_PLATFORMS).not.toContain('jsdesign');
    const frame = makeFrame();
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'jsdesign'),
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    expect(r.warnings, '写成功了就别再报不可验证').toBeUndefined();
  });

  it('MG 仍在不可验证名单里(该平台的回读滞后尚未复验)', async () => {
    const frame = makeFrame();
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'mastergo'),
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    expect(r.warnings?.join('') ?? '').toContain('无法在一次执行内验证');
  });

  it('Figma 上双读一致就是真落盘(别把两平台的口径串台)', async () => {
    const frame = makeFrame();
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'figma'),
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    expect(r.warnings).toBeUndefined();
  });

  it('MG:文案要说「不必然代表写失败」,别把平台的偶发落地说成我们的缺陷', async () => {
    // 真机实测:同一参数连写 8 帧只成 1 条,且落地那帧同会话回读也为空 ——
    // 写成「写入失败」会诱导调用方无谓重试,故 MG 走「以画布目检为准」的口径
    const frame = droppingFrame();
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'mastergo'),
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('不必然代表写失败');
    expect(warn, '要给出可执行出口').toContain('手动添加');
    expect(warn, '要说清「参数已核实过、是引擎不收」').toContain('全部零落盘');
  });

  it('非 MG 平台不套用 MG 的实测口径(别把平台事实串台)', async () => {
    const frame = droppingFrame();
    host = makeHost([frame]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'figma'),
      { ids: [frame.id], props: { layoutGrids: [ROWS_GRID] } },
      'set_effects',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).not.toContain('极不稳定');
    expect(warn).toContain('写入已发出但引擎未保留');
  });
});

describe('字体清单(jsd_list_fonts)', () => {
  it('按 family 归并出可用字型:写 fontName 前有据可依,不用猜 style', async () => {
    const h = makeHost();
    h.listAvailableFontsAsync = async () => [
      { fontName: { family: 'Inter', style: 'Bold' } },
      { fontName: { family: 'Inter', style: 'Regular' } },
      { fontName: { family: 'MiSans', style: 'Regular' } },
    ];
    const r = await listFonts(h);
    expect(r.families).toEqual(['Inter', 'MiSans']);
    expect(r.count).toBe(2);
    expect(r.fonts?.find((f) => f.family === 'Inter')?.styles).toEqual([
      'Bold',
      'Regular',
    ]);
    expect(r.fonts?.find((f) => f.family === 'MiSans')?.styles).toEqual([
      'Regular',
    ]);
  });
});

/**
 * 布局网格归一化:sectionSize / offset **按 alignment 分三套且互斥**。
 *
 * typings 里这两项都标了 `?`,但运行时(jsDesign `set_layoutGrids` 实测)会逐变体
 * 校验:STRETCH 要 offset 且**不能**带 sectionSize,CENTER 要 sectionSize 且**不能**
 * 带 offset,MIN/MAX 两者都要 —— 不匹配就整条拒绝(此前表现为「回包成功、读不到」)。
 * 修法与 count / gutterSize 一致:能补的补(offset 补 0),补不出的报错点名,不猜。
 */
describe('Figma 运行时收窄与节点序列化容错', () => {
  it('Figma:写 layoutGrow 3 要写前拦下(引擎只接受 0|1)', async () => {
    // 2026-09-24 Figma 真机:写 3 直接抛
    // `in set_layoutGrow: … Invalid literal value, expected 0 / expected 1`
    const frame = makeFrame();
    const rect = makeRect();
    rect.parent = frame;
    frame.children = [rect];
    host = makeHost([frame, rect]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'figma'),
      { ids: [rect.id], props: { layoutGrow: 3 } },
      'set_layout',
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('layoutGrow');
    expect(warn, '要说清本平台接受什么').toContain('0 / 1');
    expect(rect.layoutGrow).toBeUndefined();
  });

  it('Figma:layoutGrow 0 / 1 照常放行', async () => {
    const frame = makeFrame();
    const rect = makeRect();
    rect.parent = frame;
    frame.children = [rect];
    host = makeHost([frame, rect]);
    const r = await updateSelection(
      host,
      runtimeContext(null, 'figma'),
      { ids: [rect.id], props: { layoutGrow: 1 } },
      'set_layout',
    );
    expect(r.warnings).toBeUndefined();
  });

  it('节点读到 variantProperties 抛错时,序列化不崩、只省略该字段', () => {
    // Figma 真机:文档里存在「带错误的组件集」时该 getter 抛
    // `in get_variantProperties: Component set for node has existing errors`
    const broken = makeFrame();
    Object.defineProperty(broken, 'variantProperties', {
      get: () => {
        throw new Error('Component set for node has existing errors');
      },
      configurable: true,
    });
    const out = trySerialize(broken);
    expect(out).not.toBeNull();
    expect(out?.id).toBe(broken.id);
    expect(
      (out as unknown as Record<string, unknown>).variantProperties,
    ).toBeUndefined();
  });

  it('一个坏节点不掀翻整次查找:它降级成最小摘要,好节点照常全量', async () => {
    // 上面的 try 只兜住 `variantProperties` 一个字段;引擎在节点处于错误状态时
    // **别的 getter 同样会抛**,故 findNodes 还有一层单节点保护。用 `effects`
    // 模拟(它是 serializeNode 里不加 try 的字段)。
    const broken = makeFrame('F:broken', '带错误的组件集');
    Object.defineProperty(broken, 'effects', {
      get: () => {
        throw new Error(
          'in get_effects: Component set for node has existing errors',
        );
      },
      configurable: true,
    });
    const good = makeRect('F:good', '好节点');
    host = makeHost([broken, good]);

    const r = await findNodes(host, {});

    expect(r.total).toBe(2);
    const [bad, ok] = r.nodes;
    // 坏节点:只回认得出它所需的最小摘要,不带任何属性字段
    expect(bad).toMatchObject({
      id: 'F:broken',
      name: '带错误的组件集',
      type: 'FRAME',
    });
    expect(Object.keys(bad).sort()).toEqual(['id', 'name', 'type', 'x', 'y']);
    // 好节点:照常全量 —— 这才是「好节点也拿不到」的反例
    expect(ok).toMatchObject({ id: 'F:good', type: 'RECTANGLE' });
    expect(ok.width).toBeDefined();
  });
});

describe('变量绑定的读出口(0024)', () => {
  const alias = (id: string) => ({ type: 'VARIABLE_ALIAS' as const, id });

  it('三态原样透传:单别名 / 别名数组 / 按属性名的别名表', () => {
    const rect = makeRect();
    rect.boundVariables = {
      cornerRadius: alias('VariableID:1:2'),
      fills: [alias('VariableID:3:4')],
      componentProperties: { 状态: alias('VariableID:5:6') },
    };

    const out = trySerialize(rect);

    expect(out?.boundVariables).toEqual({
      cornerRadius: { type: 'VARIABLE_ALIAS', id: 'VariableID:1:2' },
      fills: [{ type: 'VARIABLE_ALIAS', id: 'VariableID:3:4' }],
      componentProperties: {
        状态: { type: 'VARIABLE_ALIAS', id: 'VariableID:5:6' },
      },
    });
    // 线格式声明能收下三态 —— 出参 schema 与投影口径一致
    expect(serializedNodeSchema.safeParse(out).success).toBe(true);
  });

  it('别名类型不是 VARIABLE_ALIAS 时线格式拒收(不静默放过别的形状)', () => {
    const parsed = serializedNodeSchema.safeParse({
      id: '1:1',
      name: 'r',
      type: 'RECTANGLE',
      x: 0,
      y: 0,
      boundVariables: { fills: [{ type: 'HARDCODED', id: '1' }] },
    });
    expect(parsed.success).toBe(false);
  });

  it('无绑定时整个键省略 —— 「键在 = 至少有一条绑定」可直接依赖', () => {
    const rect = makeRect();
    rect.boundVariables = {};
    expect(Object.keys(trySerialize(rect) ?? {})).not.toContain(
      'boundVariables',
    );
  });

  it('平台不提供该字段(jsDesign / MasterGo 形状)时结果里不出现该键', () => {
    expect(Object.keys(trySerialize(makeRect()) ?? {})).not.toContain(
      'boundVariables',
    );
  });

  it('引擎读 boundVariables 抛错时,序列化不崩、只省略该字段', () => {
    const broken = makeRect();
    Object.defineProperty(broken, 'boundVariables', {
      get: () => {
        throw new Error('in get_boundVariables: node has existing errors');
      },
      configurable: true,
    });

    const out = trySerialize(broken);

    expect(out).not.toBeNull();
    expect(out?.id).toBe(broken.id);
    expect(Object.keys(out ?? {})).not.toContain('boundVariables');
  });
});

describe('布局网格归一化:按 alignment 的必填/互斥', () => {
  it('STRETCH:补 offset 0,并剔除 sectionSize(该形态不能带它)', () => {
    expect(
      normalizeLayoutGrids([
        {
          pattern: 'ROWS',
          count: 3,
          gutterSize: 16,
          alignment: 'STRETCH',
          sectionSize: 40,
        },
      ]),
    ).toMatchObject([{ pattern: 'ROWS', alignment: 'STRETCH', offset: 0 }]);
    const [g] = normalizeLayoutGrids([
      {
        pattern: 'ROWS',
        count: 3,
        gutterSize: 16,
        alignment: 'STRETCH',
        sectionSize: 40,
      },
    ]);
    expect(
      (g as unknown as Record<string, unknown>).sectionSize,
    ).toBeUndefined();
  });

  it('CENTER:要 sectionSize,并剔除 offset', () => {
    const [g] = normalizeLayoutGrids([
      {
        pattern: 'ROWS',
        count: 3,
        gutterSize: 16,
        alignment: 'CENTER',
        sectionSize: 40,
        offset: 10,
      },
    ]);
    expect(g).toMatchObject({ alignment: 'CENTER', sectionSize: 40 });
    expect((g as unknown as Record<string, unknown>).offset).toBeUndefined();
  });

  it('MIN/MAX:sectionSize 与 offset 都要(缺 sectionSize 就报错点名,不猜数)', () => {
    const [g] = normalizeLayoutGrids([
      {
        pattern: 'ROWS',
        count: 3,
        gutterSize: 16,
        alignment: 'MIN',
        sectionSize: 40,
      },
    ] as never);
    expect(g).toMatchObject({ alignment: 'MIN', sectionSize: 40, offset: 0 });
    expect(() =>
      normalizeLayoutGrids([
        { pattern: 'ROWS', count: 3, gutterSize: 16, alignment: 'MIN' },
      ]),
    ).toThrow(/sectionSize 必填/);
  });

  it('未给 alignment 时默认 STRETCH(只给 count+gutter 也能用)', () => {
    const [g] = normalizeLayoutGrids([
      { pattern: 'ROWS', count: 3, gutterSize: 16 },
    ]);
    expect(g).toMatchObject({ alignment: 'STRETCH', offset: 0 });
  });

  it('GRID 只保留该有的字段(判别式联合多带字段会匹配不上)', () => {
    const [g] = normalizeLayoutGrids([
      {
        pattern: 'GRID',
        sectionSize: 8,
        count: 3,
        gutterSize: 16,
        alignment: 'MIN',
        offset: 4,
      },
    ]);
    expect(g).toMatchObject({ pattern: 'GRID', sectionSize: 8 });
    expect((g as unknown as Record<string, unknown>).count).toBeUndefined();
    expect((g as unknown as Record<string, unknown>).alignment).toBeUndefined();
  });
});

/**
 * 组件属性的「读形态 ≠ 写形态」(0023)。
 *
 * Figma typings 里 `componentProperties` 读回来是 `{type, value}`,而
 * `setProperties` 只收标量(`plugin-api.d.ts:11115`)。本仓曾经把读形态原样回喂写侧,
 * 于是**四个出口**(set_instance_properties / apply_overrides / sync_overrides /
 * figma_component_properties_set)在 2026-09-24 Figma 真机上全部被引擎拒绝 ——
 * 而工具自己的 inputSchema 还明写着「传 {type,value}」,等于契约骗调用方。
 */
describe('组件属性写形态与覆盖套用(0023)', () => {
  it('映射:裸值原样、{type,value} 取 value、SLOT 跳过并点名', () => {
    expect(
      toComponentPropertyWrites({
        Text: 'hi',
        Bool: false,
        Variant: { type: 'VARIANT', value: 'A' },
        Slot: { type: 'SLOT', value: 'x' },
      } as unknown as Record<string, unknown>),
    ).toEqual({
      writes: { Text: 'hi', Bool: false, Variant: 'A' },
      skipped: ['Slot'],
    });
  });

  it('set_instance_properties:文档承诺的 {type,value} 必须以标量下发引擎', async () => {
    const inst = makeInstance('5:9', 'SM');
    const seen: unknown[] = [];
    (inst as unknown as { setProperties(p: unknown): void }).setProperties = (
      p,
    ) => {
      seen.push(p);
    };
    host = makeHost([inst]);
    await setInstanceProperties(host, {
      ids: ['5:9'],
      properties: { 'Property 1': { type: 'VARIANT', value: 'B' } },
    });
    expect(seen).toEqual([{ 'Property 1': 'B' }]);
  });

  /** 源实例(带变体身份 + 样式覆盖)与目标实例 */
  const makePair = () => {
    const main = {
      ...makeInstance('5:10', 'SM/A'),
      type: 'COMPONENT',
    } as unknown as NodeSkeleton;
    const src = makeInstance('5:11', 'SM/A');
    src.mainComponent = main;
    src.variantProperties = { 'Property 1': 'A' };
    src.componentProperties = {
      'Property 1': { type: 'VARIANT', value: 'A' },
    } as never;
    src.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
    const target = makeInstance('5:12', 'SM/B');
    const writes: unknown[] = [];
    (target as unknown as { setProperties(p: unknown): void }).setProperties = (
      p,
    ) => {
      writes.push(p);
    };
    return { main, src, target, writes };
  };

  it('swapToSource=false(默认):不换目标变体,并在 warnings 点名', async () => {
    const { main, src, target, writes } = makePair();
    host = makeHost([main, src, target]);
    const r = await syncInstanceOverrides(host, runtimeContext(null, 'figma'), {
      sourceId: '5:11',
      ids: ['5:12'],
      swapToSource: false,
    });
    expect(r.applied[0]?.ok).toBe(true);
    // 换绑等于丢目标既有覆盖 ⇒ 默认路径一发都不发
    expect(writes).toEqual([]);
    expect(r.warnings?.join('')).toContain('Property 1');
  });

  it('swapToSource=true:显式开启才套变体身份,且下发的是标量', async () => {
    const { main, src, target, writes } = makePair();
    host = makeHost([main, src, target]);
    const r = await syncInstanceOverrides(host, runtimeContext(null, 'figma'), {
      sourceId: '5:11',
      ids: ['5:12'],
      swapToSource: true,
    });
    expect(r.applied[0]?.ok).toBe(true);
    expect(writes).toEqual([{ 'Property 1': 'A' }]);
    expect(r.warnings).toBeUndefined();
  });
});
