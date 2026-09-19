import { propAppliesTo } from '../../dicts/prop-applicability';
import type { FontName } from '../../schemas/base';
import { MIXED } from '../host';
import {
  normalizeEffects,
  normalizeLayoutGrids,
  normalizePaints,
} from '../normalize';
import { loadFont, MIN_RESIZE_SIZE } from '../utils';
import {
  type PropWriter,
  putIfPresent,
  setField,
  type WriteCtx,
} from './types';

/**
 * 属性写入器集合。
 *
 * 创建路径与修改路径此前各写了一遍约 200 行的 `if (x != null && 'x' in node)`,
 * 字段集合约 80% 重叠但**语义刻意不同**:创建路径带默认值与推断(清灰底、
 * padding 归零 + sizingMode FIXED 推断),修改路径是纯增量覆盖。
 * 差异在这里由 `ctx.create` 显式表达,不再靠两份代码的先后顺序。
 */

/** 纯透传字段:给了就写,不给就不动 —— 两条路径语义完全一致 */
const PASSTHROUGH = [
  'name',
  'visible',
  'rotation',
  'opacity',
  'locked',
  'strokeWeight',
  'strokeTopWeight',
  'strokeBottomWeight',
  'strokeLeftWeight',
  'strokeRightWeight',
  'strokeAlign',
  'strokeCap',
  'strokeJoin',
  'dashPattern',
  'blendMode',
  'cornerSmoothing',
  'clipsContent',
  'constraints',
  'layoutGrow',
  'layoutAlign',
] as const;

export const passthroughWriter: PropWriter = {
  id: 'passthrough',
  keys: PASSTHROUGH,
  write(ctx) {
    if (ctx.create && ctx.src.name == null) {
      // 创建路径的默认值:没给 name 就叫 "node"(修改路径永不猜名字)
      ctx.node.name = 'node';
    }
    for (const key of PASSTHROUGH) {
      putIfPresent(ctx.node, key, ctx.src[key]);
    }
  },
};

/** 位置:创建路径缺省 0,修改路径缺省不动 */
export const geometryWriter: PropWriter = {
  id: 'geometry',
  keys: ['x', 'y', 'width', 'height'],
  write(ctx) {
    const { node, src, create } = ctx;
    if (create) {
      node.x = typeof src.x === 'number' ? src.x : 0;
      node.y = typeof src.y === 'number' ? src.y : 0;
    } else {
      putIfPresent(node, 'x', src.x);
      putIfPresent(node, 'y', src.y);
    }
    applySize(ctx);
  },
  settle(ctx) {
    // 开 auto-layout + 插子节点会触发引擎按内容重算容器尺寸,把上面那次
    // resize 覆盖掉 —— 显式给了尺寸就以调用方为准再压一遍。
    if (ctx.create) applySize(ctx);
  },
};

/**
 * 尺寸:只给了一维时另一维沿用当前值。
 *
 * LINE 例外:允许某一维为 0(横线/竖线),但引擎 resize 校验要求 >= MIN_RESIZE_SIZE,
 * 这里把零轴抬到引擎可接受的最小值(视觉上仍是直线)。非 LINE 低于下限时给可读报错,
 * 不把引擎断言原样抛出去。
 */
function applySize(ctx: WriteCtx): void {
  const { node, src, create } = ctx;
  if (!('resize' in node)) return;
  if (src.width == null && src.height == null) return;
  const w = typeof src.width === 'number' ? src.width : node.width;
  const h = typeof src.height === 'number' ? src.height : node.height;
  if (node.type === 'LINE') {
    node.resize(Math.max(w, MIN_RESIZE_SIZE), Math.max(h, MIN_RESIZE_SIZE));
    return;
  }
  if (w < MIN_RESIZE_SIZE || h < MIN_RESIZE_SIZE) {
    // 创建路径:spec 里的 0 属于调用方笔误,同样不容忍 —— 与修改路径一致
    throw new Error(
      `${node.type} 的 width/height 最小为 ${MIN_RESIZE_SIZE}(引擎 resize 校验);要画横线/竖线请改用 LINE 并把一维传 0`,
    );
  }
  node.resize(w, h);
  if (!create) ctx.outcome.readback.push({ key: 'size', ok: true });
}

/** 填充/描边/效果/网格:两条路径都要先归一化,引擎对未归一化的入参会抛难懂的错 */
export const paintWriter: PropWriter = {
  id: 'paint',
  keys: ['fills', 'strokes', 'effects', 'layoutGrids'],
  write(ctx) {
    const { node, src } = ctx;
    if (src.fills != null) {
      putIfPresent(node, 'fills', normalizePaints(src.fills, 'fills'));
    } else if (ctx.create && src.strokes != null && node.type !== 'FRAME') {
      // 只给了描边没给填充 —— 引擎会自动塞 #CCCCCC 灰底,纯描边图标变成灰块。
      // 例外 FRAME:容器按文档走引擎默认白底,不在此改动。
      if ('fills' in node) setField(node, 'fills', []);
    }
    if (src.strokes != null) {
      putIfPresent(node, 'strokes', normalizePaints(src.strokes, 'strokes'));
    }
    if (src.effects != null) {
      putIfPresent(node, 'effects', normalizeEffects(src.effects));
    }
    if (src.layoutGrids != null) {
      putIfPresent(node, 'layoutGrids', normalizeLayoutGrids(src.layoutGrids));
    }
  },
};

/** 圆角:四角字段只在节点真的有 topLeftRadius 时才写 */
export const radiusWriter: PropWriter = {
  id: 'radius',
  keys: [
    'cornerRadius',
    'topLeftRadius',
    'topRightRadius',
    'bottomLeftRadius',
    'bottomRightRadius',
  ],
  write(ctx) {
    const { node, src } = ctx;
    if (!('cornerRadius' in node)) return;
    putIfPresent(node, 'cornerRadius', src.cornerRadius);
    if (!('topLeftRadius' in node)) return;
    for (const key of [
      'topLeftRadius',
      'topRightRadius',
      'bottomLeftRadius',
      'bottomRightRadius',
    ] as const) {
      putIfPresent(node, key, src[key]);
    }
  },
};

/** 形状专属字段:适用性按 dicts/prop-applicability 判定(两条路径同一份事实) */
export const shapeWriter: PropWriter = {
  id: 'shape',
  keys: ['pointCount', 'innerRadius', 'arcData'],
  write(ctx) {
    const { node, src } = ctx;
    for (const key of ['pointCount', 'innerRadius', 'arcData'] as const) {
      if (src[key] == null) continue;
      if (!propAppliesTo(key, node.type)) continue;
      putIfPresent(node, key, src[key]);
    }
  },
};

/**
 * 字体的写后判定**不在这里**:实测(2026-09-19)写入瞬间的回读是原样回显,引擎的
 * 规范化要到后续读取才可见 —— 在这个阶段判会把合法写法误报成未生效。判定改由
 * 结果装配期用**序列化后**的值做,见 `core/utils.ts` 的 `fontNotResolved`
 * (调用点:`core/execute.ts` 与 `core/update.ts` 的结果组装)。
 */

/**
 * 文本字段整体处理:字体加载必须先于逐属性赋值,所以按节点类型整体进入,
 * 而不是逐字段 if。创建路径额外带 characters / fontSize 的默认值。
 */
export const textWriter: PropWriter = {
  id: 'text',
  keys: [
    'characters',
    'fontName',
    'fontSize',
    'textAlignHorizontal',
    'textAlignVertical',
    'textAutoResize',
    'textCase',
    'textDecoration',
    'lineHeight',
    'letterSpacing',
  ],
  async write(ctx) {
    const { node, src, create } = ctx;
    if (node.type !== 'TEXT') return;
    if (create) {
      const specFont = src.fontName as FontName | undefined;
      if (specFont != null && node.fontName !== MIXED) {
        await loadFont(ctx.host, specFont.family, specFont.style);
        node.fontName = specFont;
        // 判定不在这里:写入瞬间回读是原样回显,见 textStabilizeWriter.settle
      }
      node.characters =
        typeof src.characters === 'string' ? src.characters : 'text';
      node.fontSize = typeof src.fontSize === 'number' ? src.fontSize : 16;
    } else {
      const needLoad =
        src.characters != null || src.fontSize != null || src.fontName != null;
      if (needLoad) {
        const current = node.fontName as FontName | undefined;
        const patch = src.fontName as Partial<FontName> | undefined;
        const family = patch?.family ?? current?.family ?? 'PingFang SC';
        const style = patch?.style ?? current?.style ?? 'Regular';
        if (node.fontName !== MIXED) {
          await loadFont(ctx.host, family, style);
          node.fontName = { family, style };
        }
      }
      putIfPresent(node, 'characters', src.characters);
      putIfPresent(node, 'fontSize', src.fontSize);
    }
    for (const key of [
      'textAlignHorizontal',
      'textAlignVertical',
      'textAutoResize',
      'textCase',
      'textDecoration',
      'lineHeight',
      'letterSpacing',
    ] as const) {
      putIfPresent(node, key, src[key]);
    }
  },
};

/** 自动布局字段;settle 阶段做方向回读 */
export const layoutWriter: PropWriter = {
  id: 'layout',
  keys: [
    'layoutMode',
    'itemSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'primaryAxisSizingMode',
    'counterAxisSizingMode',
    'primaryAxisAlignItems',
    'counterAxisAlignItems',
  ],
  write(ctx) {
    const { node, src, create } = ctx;
    const mode = src.layoutMode as 'HORIZONTAL' | 'VERTICAL' | undefined;
    if (create) {
      // 创建路径:只有显式给了 layoutMode 才开启布局并配齐默认值
      if (mode == null) return;
      if ('layoutMode' in node) node.layoutMode = mode;
      const spec = src;
      // 引擎开启 auto-layout 时把四边 padding 默认置 10,itemSpacing 同口径;
      // 调用方没传就显式归 0,免得「没写 padding 却莫名多出 10px 内边距」。
      if ('itemSpacing' in node)
        node.itemSpacing = (spec.itemSpacing as number) ?? 0;
      for (const key of [
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
      ] as const) {
        if (key in node) setField(node, key, (spec[key] as number) ?? 0);
      }
      applySizingInference(ctx);
      return;
    }
    // 修改路径:纯增量覆盖,适用性按 dict 判定
    for (const key of layoutWriter.keys) {
      if (src[key] == null) continue;
      if (!propAppliesTo(key, node.type)) continue;
      putIfPresent(node, key, src[key]);
    }
  },
  settle(ctx) {
    const { node, src } = ctx;
    if (src.layoutMode == null) return;
    if (!propAppliesTo('layoutMode', node.type)) return;
    const expected = src.layoutMode as 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    // 布局重算会回写容器方向,写进去的 layoutMode 可能不是最终值。
    // 回读不一致就再压一次,压不住由调用方点名(不允许「回显成功实则没生效」)。
    if ('layoutMode' in node && node.layoutMode !== expected) {
      node.layoutMode = expected;
    }
    const ok = !('layoutMode' in node) || node.layoutMode === expected;
    ctx.outcome.readback.push({ key: 'layoutMode', ok });
  },
};

/**
 * 显式给了尺寸、却没声明该轴的 sizingMode → 该轴钉成 FIXED。
 * 引擎开启 auto-layout 时默认按内容撑开(AUTO),会把调用方给的尺寸悄悄吃掉
 * (实测传 width:690,height:210 带嵌套 children,返回 630×160)。
 * 调用方显式声明过的一律尊重,不抢。
 */
function applySizingInference(ctx: WriteCtx): void {
  const { node, src } = ctx;
  const mode = src.layoutMode;
  const widthIsPrimary = mode === 'HORIZONTAL';
  const pairs: [string, boolean][] = [
    [
      'primaryAxisSizingMode',
      widthIsPrimary ? src.width != null : src.height != null,
    ],
    [
      'counterAxisSizingMode',
      widthIsPrimary ? src.height != null : src.width != null,
    ],
  ];
  for (const [key, sizeGiven] of pairs) {
    if (!sizeGiven) continue;
    if (src[key] != null) continue;
    if (key in node) setField(node, key, 'FIXED');
  }
}

/**
 * 平台特有超集字段:仅对应平台运行时存在,`'in'` 守卫在其它平台跳过。
 * textTruncation / maxLines 是 TEXT 专属(写进 capabilities 的门控判定另走一套)。
 */
export const supersetWriter: PropWriter = {
  id: 'superset',
  keys: [
    'fillStyleId',
    'strokeStyleId',
    'textStyleId',
    'effectStyleId',
    'textTruncation',
    'maxLines',
  ],
  write(ctx) {
    const { node, src } = ctx;
    for (const key of [
      'fillStyleId',
      'strokeStyleId',
      'textStyleId',
      'effectStyleId',
    ] as const) {
      putIfPresent(node, key, src[key]);
    }
    if (node.type !== 'TEXT') return;
    for (const key of ['textTruncation', 'maxLines'] as const) {
      putIfPresent(node, key, src[key]);
    }
  },
};

/**
 * 创建路径的稳定化:压完尺寸后把调用方**声明过**的 sizingMode 再写一次。
 * resize 会把显式声明的 AUTO 悄悄改回 FIXED —— 说了要 hug 却给固定尺寸。
 */
export const createStabilizeWriter: PropWriter = {
  id: 'create-stabilize',
  keys: ['primaryAxisSizingMode', 'counterAxisSizingMode'],
  write() {
    // 只在 settle 阶段动作
  },
  settle(ctx) {
    if (!ctx.create) return;
    const { node, src } = ctx;
    if (src.layoutMode == null) return;
    for (const key of [
      'primaryAxisSizingMode',
      'counterAxisSizingMode',
    ] as const) {
      if (src[key] == null) continue;
      putIfPresent(node, key, src[key]);
    }
  },
};

/**
 * TEXT 的 `textAutoResize` 写后稳定化。
 *
 * 实测(2026-09-19,jsDesign 0.8.0 插件):引擎的 `resize()` 会把它重置为 `NONE`
 * —— 创建路径在 `textWriter.write` 写完它之后还会跑一记尺寸回压
 * (`geometryWriter.settle` → `applySize`),于是调用方**显式声明的** `"HEIGHT"` 被吃掉。
 * 与既有的补丁(resize 把显式 `AUTO` 的 sizingMode 改回 `FIXED`)同一族:**声明过的值
 * 必须在尺寸写入之后再压一遍**,否则就是「回显成功实则没生效」。
 *
 * (`fontName` 的判定不在这里:写入期的回读是原样回显、判不出解析与否,
 * 见本文件上方注释与 `core/utils.ts` 的 `fontNotResolved`)
 */
export const textStabilizeWriter: PropWriter = {
  id: 'text-stabilize',
  keys: ['textAutoResize'],
  write() {
    // 只在 settle 阶段动作(textAutoResize 由 textWriter.write 先写一次,尺寸回压后再压一次)
  },
  settle(ctx) {
    const { node, src } = ctx;
    if (node.type !== 'TEXT') return;
    const want = src.textAutoResize;
    if (want == null) return;
    putIfPresent(node, 'textAutoResize', want);
    // 压不住要留证(回读仍不是声明的值)→ 交 0007 的出口点名
    const back = (node as unknown as { textAutoResize?: unknown })
      .textAutoResize;
    ctx.outcome.readback.push({ key: 'textAutoResize', ok: back === want });
  },
};

/** 通用写阶段(不含自动布局:创建路径把它放在插完子节点之后) */
export const BASE_WRITERS = [
  passthroughWriter,
  geometryWriter,
  paintWriter,
  radiusWriter,
  shapeWriter,
  textWriter,
  supersetWriter,
] as const;

/** 修改路径:全部 writer 一趟跑完 */
export const UPDATE_WRITERS = [
  ...BASE_WRITERS,
  textStabilizeWriter,
  layoutWriter,
] as const;

/** 创建路径:基础组 + 布局(在子节点插完之后由调用方单独跑) */
export const CREATE_WRITERS = BASE_WRITERS;
