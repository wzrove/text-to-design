import {
  platformStyleKindAllowed,
  platformStyleKindRejectionHint,
} from '../dicts/platform-value-domain';
import type { StyleKind } from '../dicts/style-kind';
import { resolveNodes } from './access';
import { hostCapabilityState } from './capabilities';
import type { DesignHost, NodeSkeleton, StyleSummary } from './host';
import { MIXED } from './host';
import type { RuntimeContext } from './runtime';

/**
 * 建本地样式:三平台的原生入口形状不同(Figma / jsDesign 是无参工厂 + 灌值,
 * MG 是 `createFillStyle({ name, id })` 由引擎从图层抄),但**取值来源都是某个节点**,
 * 故契约只留一条 `host.createStyle(init)`,差异收在各自 adapter。
 */
/** 取值前置检查:这个类别在该节点上有无可抄的值;返回 null = 可抄。 */
function styleSourceGap(kind: StyleKind, node: NodeSkeleton): string | null {
  if (kind === 'PAINT') {
    const has =
      (node.fills?.length ?? 0) > 0 || (node.strokes?.length ?? 0) > 0;
    return has ? null : '取值节点既没有填充也没有描边,抄不出 PAINT 样式';
  }
  if (kind === 'EFFECT')
    return (node.effects?.length ?? 0) > 0 ? null : '取值节点没有任何效果';
  if (kind === 'GRID')
    return (node.layoutGrids?.length ?? 0) > 0
      ? null
      : '取值节点没有任何布局网格';
  if (kind === 'STROKE_WIDTH') {
    // 描边宽度族在契约里是裸 `number`(引擎不会在这几项上给 mixed),故只判有无
    const has = [
      node.strokeWeight,
      node.strokeTopWeight,
      node.strokeRightWeight,
      node.strokeBottomWeight,
      node.strokeLeftWeight,
    ].some((v) => v != null);
    return has
      ? null
      : '取值节点没有任何描边宽度可抄(STROKE_WIDTH 样式要的是这个)';
  }
  if (kind === 'CORNER_RADIUS') {
    const has = [
      node.cornerRadius,
      node.topLeftRadius,
      node.topRightRadius,
      node.bottomLeftRadius,
      node.bottomRightRadius,
    ].some((v) => v != null);
    return has
      ? null
      : '取值节点没有圆角,抄不出 CORNER_RADIUS 样式(整组读不出时先 jsd_set_cornerRadius 定一个值)';
  }
  if (kind === 'PADDING') {
    const has = [
      node.paddingTop,
      node.paddingRight,
      node.paddingBottom,
      node.paddingLeft,
    ].some((v) => v != null && v !== MIXED);
    return has
      ? null
      : '取值节点不是自动布局容器或四向 padding 全是混值,抄不出 PADDING 样式';
  }
  if (kind === 'SPACING')
    return node.itemSpacing != null && node.itemSpacing !== MIXED
      ? null
      : '取值节点不是自动布局容器或 itemSpacing 读不出(混值),抄不出 SPACING 样式';
  const fontName = node.fontName;
  return fontName == null || fontName === MIXED
    ? '取值节点的字体是混值(mixed)或读不到,无法收成单一 TEXT 样式;先用 jsd_set_text 把字体统一'
    : null;
}

export async function createStyle(
  host: DesignHost,
  ctx: RuntimeContext,
  params: {
    kind: StyleKind;
    name: string;
    description?: string;
    fromNodeId: string;
  },
): Promise<{ created: StyleSummary }> {
  if (hostCapabilityState(ctx, 'styles') === false) {
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      '本平台未声明 styles 能力,没有建样式的入口(能力表见 jsd_ping 的 capabilities)',
    );
  }
  // 类别适用性在值域守卫**之前**判(dec 25827d0c):契约的 StyleKind 是三家 StyleType 的并集,
  // 本平台没有该类的工厂时,adapter 要么 fallthrough 建出错的东西,要么抛一句没有
  // 上下文的引擎错 —— 两者都是 dec 0007 不允许的静默失效形态。
  if (!platformStyleKindAllowed(ctx.platform, params.kind)) {
    // i18n-exempt: 随结果上行给模型,不走面板文案
    const hint = platformStyleKindRejectionHint(ctx.platform);
    throw new Error(
      `${params.kind} 类样式本平台没有对应工厂,建不出来${hint ? `(${hint})` : ''};` +
        `STROKE_WIDTH / CORNER_RADIUS / PADDING / SPACING 只在 MasterGo 能建为样式,` +
        `另两家的间距与圆角只能落在节点字段上(见 jsd_set_layout / jsd_set_cornerRadius / jsd_set_stroke)`,
    );
  }
  const [node] = await resolveNodes(host, [params.fromNodeId]);
  if (node == null) throw new Error(`没有找到取值的节点: ${params.fromNodeId}`);
  // **必须先判再建**:引擎的工厂(`figma.createEffectStyle()` 等)一执行就落下真资源,
  // 之后灌值阶段才报「节点上没有对应值」= 回包失败但文档里多了一条空样式
  // (真机 2026-10-13:建 EFFECT / GRID 失败,清单里却多出「测试/阴影」「测试/栅格」两条空样式)。
  // 本仓没有删样式的入口(`Style.remove` 未接),那条垃圾只能人手工清。
  const gap = styleSourceGap(params.kind, node);
  if (gap != null)
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(`未向引擎发起建样式请求:${gap}`);
  return {
    created: await host.createStyle({
      kind: params.kind,
      name: params.name,
      ...(params.description == null
        ? {}
        : { description: params.description }),
      node,
    }),
  };
}

/**
 * 样式对象的写入面:两家引擎(Figma / jsDesign)的字段名一致,而 shared 不能引平台
 * typings,故收成结构类型而不是具体类。
 */
export type StyleDraft = Record<string, unknown>;

/** TEXT 样式要抄的排版字段(超出这些的文本属性不属于样式) */
const TEXT_STYLE_FIELDS = [
  'fontSize',
  'letterSpacing',
  'lineHeight',
  'paragraphSpacing',
  'paragraphIndent',
  'textCase',
  'textDecoration',
] as const;

/**
 * 删本地样式:逐条删,单条失败(样式不存在)不连坐其余。
 *
 * 为什么按 `id` 而不是按名:同名样式在 MG 上可以并存(它的名字不是唯一键),
 * 按名删等于让调用方猜要删哪一条。名字在 `jsd://styles` 与 `assets.styles` 里读得到。
 */
export async function deleteStyles(
  host: DesignHost,
  ctx: RuntimeContext,
  ids: string[],
): Promise<{ removed: string[]; failed: { id: string; reason: string }[] }> {
  if (hostCapabilityState(ctx, 'styles') === false) {
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      '本平台未声明 styles 能力,没有删样式的入口(能力表见 jsd_ping 的 capabilities)',
    );
  }
  const removed: string[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      await host.removeStyle(id);
      removed.push(id);
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { removed, failed };
}

/**
 * Figma / jsDesign 共用:把节点的值灌进刚建出来的空样式。
 * 两家的样式对象字段一致(`paints` / `effects` / `layoutGrids` + 文本排版那几项),
 * 所以这份逻辑只写一处,adapter 各自传入自己的工厂与 `loadFontAsync`。
 *
 * 「有没有值可抄」不在这里判 —— 那是 {@link createStyle} 里的前置检查(判晚了就落下空样式),
 * 本函数只按已经判过的类别取值。
 */
export async function fillStyleFromNode(
  draft: StyleDraft,
  init: {
    kind: StyleKind;
    name: string;
    description?: string;
    node: NodeSkeleton;
  },
  loadFont: (fontName: { family: string; style: string }) => Promise<void>,
): Promise<void> {
  try {
    await writeToStyle(draft, init, loadFont);
  } catch (e) {
    // 引擎工厂已经落下资源,灌值失败就必须回滚 —— 否则回包是「失败」,文档里却多一条
    // 空样式,而调用方看不到它(真机 2026-10-14 Figma:建 TEXT 样式时
    // `loadFontAsync` 拒了 PingFang SC,留下 `探针/回归样式` 一条空样式)。
    // 与 figma_variables_create 的「失败整体回滚」同一口径。
    (draft as { remove?: () => void }).remove?.();
    throw e;
  }
}

async function writeToStyle(
  draft: StyleDraft,
  init: {
    kind: StyleKind;
    name: string;
    description?: string;
    node: NodeSkeleton;
  },
  loadFont: (fontName: { family: string; style: string }) => Promise<void>,
): Promise<void> {
  draft.name = init.name;
  if (init.description != null) draft.description = init.description;
  const { kind, node } = init;
  if (kind === 'PAINT') {
    // 描边作为退路:只有描边没有填充的节点,能取的颜色就只有 strokes
    draft.paints =
      node.fills != null && node.fills.length > 0 ? node.fills : node.strokes;
    return;
  }
  if (kind === 'EFFECT') {
    draft.effects = node.effects;
    return;
  }
  if (kind === 'GRID') {
    draft.layoutGrids = node.layoutGrids;
    return;
  }
  if (kind !== 'TEXT')
    // 只有 TEXT 会落到下面的灌值分支:那四类 MG 独有的样式走的是「引擎从图层抄」,
    // 不进本函数(调用点是 figma / jsdesign 两个 adapter)。走到这里说明值域守卫漏了。
    throw new Error(`本平台没有 ${kind} 类样式的灌值路径`);
  const fontName = node.fontName;
  // 引擎纪律:字体未 loadFont 就写排版字段会抛,故先加载再灌
  await loadFont(fontName as { family: string; style: string });
  draft.fontName = fontName;
  for (const field of TEXT_STYLE_FIELDS) {
    const v = node[field];
    if (v != null && v !== MIXED) draft[field] = v;
  }
}
