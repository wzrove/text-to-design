import { LAYOUT_GRID_UNVERIFIABLE_PLATFORMS } from '../../dicts/platform-value-domain';
import { propAppliesTo } from '../../dicts/prop-applicability';
import type { LayoutGrid } from '../../schemas';
import type { FontName } from '../../schemas/base';
import { MIXED, type NodeSkeleton } from '../host';
import {
  normalizeEffects,
  normalizeLayoutGrids,
  normalizePaints,
} from '../normalize';
import { loadFont, MIN_RESIZE_SIZE } from '../utils';
import { platformRejectsProp } from './platform-gate';
import {
  field,
  type PropWriter,
  setField,
  type WriteCtx,
  writeProp,
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
      writeProp(ctx, ctx.node, key, ctx.src[key]);
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
      writeProp(ctx, node, 'x', src.x);
      writeProp(ctx, node, 'y', src.y);
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
      writeProp(ctx, node, 'fills', normalizePaints(src.fills, 'fills'));
    } else if (ctx.create && src.strokes != null && node.type !== 'FRAME') {
      // 只给了描边没给填充 —— 引擎会自动塞 #CCCCCC 灰底,纯描边图标变成灰块。
      // 例外 FRAME:容器按文档走引擎默认白底,不在此改动。
      if ('fills' in node) setField(node, 'fills', []);
    }
    if (src.strokes != null) {
      writeProp(ctx, node, 'strokes', normalizePaints(src.strokes, 'strokes'));
    }
    if (src.effects != null) {
      writeProp(ctx, node, 'effects', normalizeEffects(src.effects));
    }
    if (src.layoutGrids != null) {
      const want = normalizeLayoutGrids(src.layoutGrids);
      const wrote = writeProp(ctx, node, 'layoutGrids', want);
      verifyLayoutGrids(ctx, node, want, wrote);
    }
  },
};

/**
 * 布局网格的写后回读校验 —— **双读**:写进去的那个对象 + **按 id 重新取数**的对象。
 *
 * 为什么只有这一项有校验:2026-09-24 真机(MG)实测 —— 回包「已更新 1 个节点」,
 * `jsd_find` 回读为空,**一个字告警都没有**。而同一节点上、同一条写路径的
 * `effects` / `fills` / `clipsContent` 全部正常落盘,故不是「数组形状写不进去」,
 * 是网格独有的静默失效。其余数组项已实测生效,不加校验免得徒增噪声。
 *
 * **为什么要「重新取数」这一次额外的读**(jsDesign 上踩到):写完之后读**手上这个**
 * 对象,看到的是我们刚赋的值;而按 id 重新取回来的对象**没有**它 —— 即赋值只落在
 * 一个不落文档的临时包装对象上。jsDesign 的类型面本来就在(它 `BaseFrameMixin.layoutGrids`
 * 与 `GridStyle.layoutGrids` 都在 typings 里、网格项字段与本仓线格式**逐字段同名**),
 * 所以这不是参数问题,是**「回显成功 ≠ 落盘」**,只看同对象会把这种写入报成成功。
 * `DesignHost.getNodeById` 就是这条复核的类型支撑(`host.ts`)。
 *
 * 判定顺序:
 * 1. 重新取数成功且一致 → 真落盘,放行;
 * 2. 重新取数可用、但**同对象有、新对象没有** → 幻影写入(单独一种口径,别混进「引擎没接」);
 * 3. 重新取数不可用(dynamic-page 平台禁止同步按 id 取节点,会抛)→ 退回只看同对象,
 *    维持既有口径(**拿不准就别报**,与 0002 的 fail-open 一致);
 * 4. 其余 → 按「写入未发生(存在性守卫跳过)」与「写入已发出但引擎未保留」二分。
 *
 * MasterGo 逐帧实测(2026-09-24,同一 payload 写 8 帧):只有 1 帧落地,且那帧的值
 * 完整正确(`ROWS` / `count` / `gutterSize` / `alignment` / `color` 逐项对得上,
 * 引擎另补了默认 `sectionSize`)—— **映射与值域没问题,方差全在平台侧**。
 * 可见性同样不可靠:落地那帧**同会话回读为空**,数分钟后才读到;后续复验又出现
 * 「先能读到、之后同一 id 读不到」以及「跨插件重载后消失」两种反向不一致。
 * 故本提示在 MG 上**不必然代表写失败**,文案不写成「写入失败」(那会诱导无谓重试)。
 */
function verifyLayoutGrids(
  ctx: WriteCtx,
  node: NodeSkeleton,
  want: readonly LayoutGrid[],
  wrote: boolean,
): void {
  const wanted = {
    count: want.length,
    // 判别字段取 `pattern`(Figma/jsDesign 的原名;MG 侧由门面从 `gridType` 翻回来)
    patterns: want.map((g) => String(g.pattern)),
  };
  const same = readGrids(node);
  const fresh = refetchGrids(ctx, node);
  const okSame = gridsMatch(same, wanted);
  const okFresh = fresh === 'unavailable' ? null : gridsMatch(fresh, wanted);
  const mastergo = ctx.ctx.platform === 'mastergo';
  const unverifiable =
    ctx.ctx.platform != null &&
    LAYOUT_GRID_UNVERIFIABLE_PLATFORMS.includes(ctx.ctx.platform);
  const jsdesign = ctx.ctx.platform === 'jsdesign';

  // 双读一致、但本平台属于「一次执行内验证不了」的那些 ⇒ **不许写「已生效」**:
  // 引擎在当前执行里收下了值(可能只是未提交状态),提交后文档里没有它 —— 判据在
  // 同一个执行内不可能成立(jsDesign 实测:零告警随后却恒读不到)。如实点名不可验证。
  if (okFresh === true) {
    if (unverifiable) {
      ctx.outcome.warnings.push(
        [
          `layoutGrids 已写入,但**本平台无法在一次执行内验证**:${jsdesign ? 'jsDesign 实测写入后下一次调用读不到该字段' : 'MG 实测写入偶发落地、且落地那条同会话回读也为空'}。`,
          '本条**既不代表写失败、也不代表写成功** —— 请以画布目检为准;',
          '画布也没有的话,建议在设计器里手动添加布局网格(自动布局容器不能有网格)。',
        ].join(''),
      );
    }
    return;
  }
  // 取不到新对象 → 维持既有口径(不因做不到复核就误报)
  if (okFresh === null && okSame) return;

  const phantom = okSame && okFresh === false;
  // i18n-exempt: 随结果上行给模型,不走面板文案
  ctx.outcome.warnings.push(
    [
      `layoutGrids 未生效:请求 ${wanted.count} 条,回读 ${fresh === 'unavailable' ? (same?.count ?? 0) : (fresh?.count ?? 0)} 条。`,
      phantom
        ? '写入只落在当前对象上:同一对象读得到,按 id 重新取数后没有 ⇒ 未写入文档(该平台的赋值可能落在临时包装对象上)。'
        : wrote
          ? '写入已发出但引擎未保留(该平台的布局网格可能不是节点级属性)。'
          : '写入未发生:该节点上读不到这个字段(存在性守卫判为不存在)。',
      mastergo
        ? 'MasterGo 实测(请勿据此重试刷屏):**参数已核实过** —— 按 jsDesign 同款规则补齐 sectionSize / offset 后,五种合法形态(ROWS 默认 STRETCH / ROWS MIN / ROWS CENTER / COLUMNS MIN / GRID)在该平台上**全部零落盘**(而在 jsDesign 上同一套参数五种全通)⇒ 不是参数问题,是引擎不收节点级网格;早期那次「8 帧成 1 条」是旧参数时期的观测,别再据此重试。故本条**不必然代表写失败**,请以画布目检为准;要可靠设置网格,建议在 MG 界面手动添加(自动布局容器不能有网格,官方文档原文「布局网格只有在非自动布局时设置才会生效」)。'
        : '排查顺序:确认宿主是容器(网格只对 FRAME/COMPONENT/COMPONENT_SET/INSTANCE 有意义)、容器没有自动布局;再核对本平台是否有节点级网格字段(jsDesign 的类型面齐全,若走本条请按「未落文档」排查)。',
    ].join(''),
  );
}

/** 读某个节点上已生效的网格(数量 + 判别字段):读不到该字段返回 null */
function readGrids(
  node: NodeSkeleton,
): { count: number; patterns: string[] } | null {
  if (!('layoutGrids' in node)) return null;
  const value = field(node, 'layoutGrids');
  if (!Array.isArray(value)) return null;
  return {
    count: value.length,
    patterns: value.map((g) =>
      String((g as { pattern?: unknown } | null)?.pattern ?? ''),
    ),
  };
}

/**
 * 按 id 重新取数再读(幻影写入选的判据)。`'unavailable'` = 本平台做不到这次复核
 * (dynamic-page 平台禁止同步按 id 取节点,会抛异常),调用方据此走 fail-open。
 */
function refetchGrids(
  ctx: WriteCtx,
  node: NodeSkeleton,
): { count: number; patterns: string[] } | null | 'unavailable' {
  const host = ctx.host as {
    getNodeById?: (id: string) => NodeSkeleton | null;
  };
  if (typeof host.getNodeById !== 'function') return 'unavailable';
  try {
    const fresh = host.getNodeById(node.id);
    if (fresh == null) return 'unavailable';
    return readGrids(fresh);
  } catch {
    // dynamic-page 平台(dynamicAccess)下同步取节点会抛:那不是写入问题
    return 'unavailable';
  }
}

/** 数量与判别字段逐个对上才算一致(引擎会补默认值,故不能做深比较) */
function gridsMatch(
  got: { count: number; patterns: string[] } | null,
  wanted: { count: number; patterns: string[] },
): boolean | null {
  if (got == null) return null;
  if (got.count !== wanted.count || got.count === 0) return false;
  return got.patterns.every((p, i) => p === wanted.patterns[i]);
}

/**
 * 圆角:五键逐个走 {@link writeProp}(判定 → 存在性守卫)。
 *
 * 早前这里有两道 `if (!('cornerRadius' in node)) return;` 提前返回 —— 去掉的理由:
 * ① 那道守卫在 MasterGo 上**不可信**(门面的 `has` 有「读得到就算存在」的兜底),
 *    拿它挡在前面会让「本平台的这类节点没有圆角字段」重新变成静默失效 ——
 *    判定必须由 `writeProp` 的平台层跑,顺序在存在性守卫**之前**(0022);
 * ② 提前返回顺带跳过了同族的四角字段,而 `putIfPresent` 本来就按 `'in'` 逐个兜住,
 *    留着它只会让「哪些键被跳过」取决于第一个键,理由不成立。
 */
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
    for (const key of [
      'cornerRadius',
      'topLeftRadius',
      'topRightRadius',
      'bottomLeftRadius',
      'bottomRightRadius',
    ] as const) {
      writeProp(ctx, node, key, src[key]);
    }
  },
};

/** 形状专属字段:适用性按 dicts/prop-applicability 判定(两条路径同一份事实) */
/** 形状专属字段:适用性判定统一在 `writeProp` 里做(单一收口),这里不再自己判一遍 */
export const shapeWriter: PropWriter = {
  id: 'shape',
  keys: ['pointCount', 'innerRadius', 'arcData'],
  write(ctx) {
    const { node, src } = ctx;
    for (const key of ['pointCount', 'innerRadius', 'arcData'] as const) {
      writeProp(ctx, node, key, src[key]);
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

    /** 文本样式字段:全部要求该段字体已加载(见下方 fontReady 的说明) */
    const STYLE_KEYS = [
      'fontSize',
      'textCase',
      'textDecoration',
      'lineHeight',
      'letterSpacing',
    ] as const;
    const ALIGN_KEYS = [
      'textAlignHorizontal',
      'textAlignVertical',
      'textAutoResize',
    ] as const;

    /**
     * 写样式字段的**统一出口**:逐个 best-effort,失败不静默。
     *
     * 为什么不能直接赋值:MasterGo 在改字号/行高等样式前要求该段字体已加载,否则
     * 直接抛 `Cannot use unloaded font "…"`;而这个前置条件在「新建文本且调用方没给
     * fontName」时**无法满足** —— 新节点读不到当前字体(MG 的 textStyles 为空),
     * 它自己的默认字体又不在可用清单里(实测 1850 族 0 命中)。此时正确做法是:
     * 内容照写,样式点名跳过,而不是让整次创建失败在引擎内部错误上。
     */
    const apply = (keys: readonly string[], fallbackFontSize?: number) => {
      for (const key of keys) {
        const value =
          key === 'fontSize' && fallbackFontSize != null
            ? typeof src.fontSize === 'number'
              ? src.fontSize
              : fallbackFontSize
            : (src as Readonly<Record<string, unknown>>)[key];
        if (value == null) continue;
        try {
          (node as unknown as Record<string, unknown>)[key] = value;
        } catch (e) {
          ctx.outcome.warnings.push(
            `文本字段 ${key} 未写入(${e instanceof Error ? e.message : String(e)})。该平台要求先指定 fontName(取 jsd_list_fonts 的 fonts[] 成对值)再改文本样式。`,
          );
        }
      }
    };

    if (create) {
      const specFont = src.fontName as FontName | undefined;
      let fontReady = false;
      if (specFont != null && node.fontName !== MIXED) {
        // 加载失败就不写:把不可加载的字体名写进节点,MG 会在下一句样式写入时抛
        // unloaded font(实测),报错点离真正原因很远。改为在结果里点名。
        if (await loadFont(ctx.host, specFont.family, specFont.style)) {
          node.fontName = specFont;
          fontReady = true;
        } else {
          ctx.outcome.warnings.push(
            `字体 ${specFont.family} / ${specFont.style} 加载失败(不在本平台可用字体清单里),已跳过写入;请用 jsd_list_fonts 的 fonts[] 成对值(family + style 全名)。`,
          );
        }
        // 判定不在这里:写入瞬间回读是原样回显,见 textStabilizeWriter.settle
      }
      node.characters =
        typeof src.characters === 'string' ? src.characters : 'text';
      if (fontReady) {
        apply(STYLE_KEYS, 16);
      } else {
        // 字体没就绪:字号等需要字体的走 apply(逐个点名),对齐类字段与字体无关,照写
        apply(['fontSize'], 16);
      }
      apply(ALIGN_KEYS);
      return;
    }

    const needStyle = src.characters != null || src.fontSize != null;
    const patch = src.fontName as Partial<FontName> | undefined;
    let ready = true;
    if (patch?.family != null && node.fontName !== MIXED) {
      // 调用方指定了字体:先加载,成功才写
      ready = await loadFont(ctx.host, patch.family, patch.style ?? '');
      if (ready) {
        node.fontName = { family: patch.family, style: patch.style ?? '' };
      } else {
        ctx.outcome.warnings.push(
          `字体 ${patch.family} / ${patch.style ?? ''} 加载失败(不在本平台可用字体清单里),已跳过写入;请用 jsd_list_fonts 的 fonts[] 成对值。`,
        );
      }
    }
    if (needStyle && patch?.family == null) {
      // 只改字号/内容:必须先加载**该段当前字体**。此前这里在读不到当前字体时兜底
      // 写死 'PingFang SC'/'Regular' —— 那是 jsDesign 时代的假设,MasterGo 的字体清单
      // 里没有它(实测 1850 族 0 命中),于是加载失败被吞、下游样式写入抛 unloaded font。
      // 现在:读不到就不写字体、也不假装加载成功,只点名。
      const current = node.fontName as FontName | undefined;
      if (node.fontName === MIXED) {
        ready = false;
        ctx.outcome.warnings.push(
          '文本为混合字体,未改字号/内容;请按 id 分别设置字体,或改用 set_text 指定 fontName。',
        );
      } else if (current?.family == null) {
        ready = false;
        ctx.outcome.warnings.push(
          '未指定 fontName 且读不到该文本当前字体(该平台对没设过样式的文本节点读不到字体),本次已跳过需要字体的样式写入;要改字号/行高等请同时传 fontName(取 jsd_list_fonts 的 fonts[] 成对值)。',
        );
      } else {
        ready = await loadFont(ctx.host, current.family, current.style);
        if (!ready) {
          ctx.outcome.warnings.push(
            `该文本当前字体 ${current.family} / ${current.style} 加载失败,已跳过需要字体的样式写入;请改传清单内的 fontName。`,
          );
        }
      }
    }
    writeProp(ctx, node, 'characters', src.characters);
    if (ready) apply(STYLE_KEYS);
    apply(ALIGN_KEYS);
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
      // 一律走 writeProp(平台判定 + 适用性判定收口):此前这里是 `node.x = …` 直写,
      // 平台收窄规则在创建路径上**整片失效**(MG 真机:创建时传 primaryAxisAlignItems:'MAX'
      // 照样下发,引擎静默忽略,而那条规则本来是拦得住的 —— 2026-09-24 补)。
      writeProp(ctx, node, 'layoutMode', mode);
      const spec = src;
      // 引擎开启 auto-layout 时把四边 padding 默认置 10,itemSpacing 同口径;
      // 调用方没传就显式归 0,免得「没写 padding 却莫名多出 10px 内边距」。
      writeProp(ctx, node, 'itemSpacing', spec.itemSpacing ?? 0);
      for (const key of [
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
      ] as const) {
        writeProp(ctx, node, key, spec[key] ?? 0);
      }
      // 对齐也要在创建时写:此前 create 分支直接 return,对齐参数被静默
      // 丢弃(节点落成 MIN/MIN),与 schema 宣称「创建可带对齐」不符
      for (const key of [
        'primaryAxisAlignItems',
        'counterAxisAlignItems',
      ] as const) {
        writeProp(ctx, node, key, spec[key]);
      }
      applySizingInference(ctx);
      return;
    }
    // 修改路径:纯增量覆盖(适用性判定统一在 `writeProp` 里,见 core/props/types.ts)
    for (const key of layoutWriter.keys) {
      writeProp(ctx, node, key, src[key]);
    }
  },
  settle(ctx) {
    const { node, src } = ctx;
    // 对齐回读**必须跑在下面的 layoutMode 守卫之前**(2026-09-24 真机实测修正):
    // 「只改对齐、不传 layoutMode」是常见用法(jsd_set_layout 单独传
    // primaryAxisAlignItems),早前被 `src.layoutMode == null` 提前返回挡掉 ——
    // 于是那条路径**完全没有回读校验**,引擎把对齐丢掉也照回「已更新 N 个节点」。
    // 实测 MG:只传 counterAxisAlignItems:'MAX' 时回读仍是 CENTER,却一条 warnings
    // 都没有,正是 0007 要根除的「回显成功实则没生效」。
    for (const key of [
      'primaryAxisAlignItems',
      'counterAxisAlignItems',
    ] as const) {
      const expectedAlign = src[key];
      if (expectedAlign == null) continue;
      if (!propAppliesTo(key, node.type)) continue;
      // 被平台判定拒过的值**不许在回压里复活**:写阶段已经报过一次,这里再写一遍
      // 等于绕过判定(2026-09-24:MG 上 align 的 MAX 就是这样被回压绕过过一次)。
      if (platformRejectsProp(ctx, key, expectedAlign) != null) continue;
      if (key in node && node[key] !== expectedAlign) {
        setField(node, key, expectedAlign);
      }
      ctx.outcome.readback.push({
        key,
        ok: !(key in node) || node[key] === expectedAlign,
      });
    }
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
      writeProp(ctx, node, key, src[key]);
    }
    if (node.type !== 'TEXT') return;
    for (const key of ['textTruncation', 'maxLines'] as const) {
      writeProp(ctx, node, key, src[key]);
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
      writeProp(ctx, node, key, src[key]);
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
    writeProp(ctx, node, 'textAutoResize', want);
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
