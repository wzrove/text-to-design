import { CAPABILITY_OF_GATED_PROP } from '../dicts/capability';
import { propAppliesTo } from '../dicts/prop-applicability';
import type { PropMethod, SerializedNode, UpdateNodeProps } from '../schemas';
import { PROP_METHOD_FIELDS } from '../schemas';
import { isGatedPropUnsupported } from './capabilities';
import type { DesignHost, NodeSkeleton } from './host';
import { MIXED } from './host';
import {
  normalizeEffects,
  normalizeLayoutGrids,
  normalizePaints,
} from './normalize';
import { serializeNode } from './serialize';
import {
  collectTargets,
  ensureLayoutMode,
  findNode,
  loadFont,
  MIN_RESIZE_SIZE,
} from './utils';

async function applyProps(
  host: DesignHost,
  node: NodeSkeleton,
  // 放宽为局部扩展:x/y 与 width/height 可能来自两个不同方法组的入参(见 updateSelection)
  props: UpdateNodeProps & { x?: number; y?: number },
): Promise<void> {
  // 先整体归一化一次(多目标节点复用同一份合法数据),引擎赋值前兜底
  const fills =
    props.fills != null ? normalizePaints(props.fills, 'fills') : undefined;
  const strokes =
    props.strokes != null
      ? normalizePaints(props.strokes, 'strokes')
      : undefined;
  const effects =
    props.effects != null ? normalizeEffects(props.effects) : undefined;
  if (props.name != null) node.name = props.name;
  if (props.x != null) node.x = props.x;
  if (props.y != null) node.y = props.y;
  if (props.visible != null) node.visible = props.visible;
  if (props.rotation != null) node.rotation = props.rotation;
  if (props.opacity != null && 'opacity' in node) node.opacity = props.opacity;
  if (props.locked != null) node.locked = props.locked;
  if (props.width != null || props.height != null) {
    const w = props.width ?? node.width;
    const h = props.height ?? node.height;
    if ('resize' in node) {
      if (node.type === 'LINE') {
        // 与创建路径同源(P9):LINE 的「线长 + 零厚」合法,但引擎 resize 校验
        // 要求两维 >= 0.01,直接传 0 会被拒。这里复用同一条零轴豁免,
        // 让 jsd_resize_node 也能把横/竖线改成 0 → 1px 以外的尺寸。
        node.resize(Math.max(w, MIN_RESIZE_SIZE), Math.max(h, MIN_RESIZE_SIZE));
      } else if (w < MIN_RESIZE_SIZE || h < MIN_RESIZE_SIZE) {
        // 不再让引擎断言原样冒泡(「in resize: Expected "width" to have value >= 0.01」
        // 读起来看不出该怎么办)。明确说清限制与替代做法。
        throw new Error(
          `${node.type} 的 width/height 最小为 ${MIN_RESIZE_SIZE}(引擎 resize 校验);要画横线/竖线请改用 LINE 并把一维传 0`,
        );
      } else {
        node.resize(w, h);
      }
    }
  }
  if (fills != null && 'fills' in node) node.fills = fills;
  if (props.strokeWeight != null && 'strokeWeight' in node)
    node.strokeWeight = props.strokeWeight;
  if (props.strokeTopWeight != null && 'strokeTopWeight' in node)
    node.strokeTopWeight = props.strokeTopWeight;
  if (props.strokeBottomWeight != null && 'strokeBottomWeight' in node)
    node.strokeBottomWeight = props.strokeBottomWeight;
  if (props.strokeLeftWeight != null && 'strokeLeftWeight' in node)
    node.strokeLeftWeight = props.strokeLeftWeight;
  if (props.strokeRightWeight != null && 'strokeRightWeight' in node)
    node.strokeRightWeight = props.strokeRightWeight;
  if (strokes != null && 'strokes' in node) node.strokes = strokes;
  if (props.strokeAlign != null && 'strokeAlign' in node)
    node.strokeAlign = props.strokeAlign;
  if (props.strokeCap != null && 'strokeCap' in node)
    node.strokeCap = props.strokeCap;
  if (props.strokeJoin != null && 'strokeJoin' in node)
    node.strokeJoin = props.strokeJoin;
  if (props.dashPattern != null && 'dashPattern' in node)
    node.dashPattern = props.dashPattern;
  if (props.blendMode != null && 'blendMode' in node)
    node.blendMode = props.blendMode;
  if (props.cornerSmoothing != null && 'cornerSmoothing' in node)
    node.cornerSmoothing = props.cornerSmoothing;
  if (props.clipsContent != null && 'clipsContent' in node)
    node.clipsContent = props.clipsContent;
  if (props.constraints != null && 'constraints' in node)
    node.constraints = props.constraints;
  if (props.layoutGrids != null && 'layoutGrids' in node)
    node.layoutGrids = normalizeLayoutGrids(props.layoutGrids);
  if (
    propAppliesTo('arcData', node.type) &&
    props.arcData != null &&
    'arcData' in node
  ) {
    node.arcData = props.arcData;
  }
  if (effects != null && 'effects' in node) node.effects = effects;

  if (props.cornerRadius != null && 'cornerRadius' in node)
    node.cornerRadius = props.cornerRadius;
  if ('topLeftRadius' in node) {
    if (props.topLeftRadius != null) node.topLeftRadius = props.topLeftRadius;
    if (props.topRightRadius != null)
      node.topRightRadius = props.topRightRadius;
    if (props.bottomLeftRadius != null)
      node.bottomLeftRadius = props.bottomLeftRadius;
    if (props.bottomRightRadius != null)
      node.bottomRightRadius = props.bottomRightRadius;
  }

  if (props.pointCount != null && propAppliesTo('pointCount', node.type)) {
    node.pointCount = props.pointCount;
  }
  if (propAppliesTo('innerRadius', node.type) && props.innerRadius != null) {
    node.innerRadius = props.innerRadius;
  }

  // 这一块是「文本节点的整体写入流程」而非单属性 gate:字体加载必须先于逐属性
  // 赋值,所以按节点类型整体进入。块内各属性在 dicts/prop-applicability 里都登记
  // 为 TEXT 专属 —— 新增文本属性时两处一起改(表用于「未生效」点名,这里用于赋值)。
  if (node.type === 'TEXT') {
    const needLoad =
      props.characters != null ||
      props.fontSize != null ||
      props.fontName != null;
    if (needLoad) {
      const family =
        props.fontName?.family ??
        (node.fontName as { family: string } | undefined)?.family ??
        'PingFang SC';
      const style =
        props.fontName?.style ??
        (node.fontName as { style: string } | undefined)?.style ??
        'Regular';
      if (node.fontName !== MIXED) {
        await loadFont(host, family, style);
        node.fontName = { family, style };
      }
    }
    if (props.characters != null) node.characters = props.characters;
    if (props.fontSize != null) node.fontSize = props.fontSize;
    if (props.textAlignHorizontal != null)
      node.textAlignHorizontal = props.textAlignHorizontal;
    if (props.textAlignVertical != null)
      node.textAlignVertical = props.textAlignVertical;
    if (props.textAutoResize != null)
      node.textAutoResize = props.textAutoResize;
    if (props.textCase != null) node.textCase = props.textCase;
    if (props.textDecoration != null)
      node.textDecoration = props.textDecoration;
    if (props.lineHeight != null) node.lineHeight = props.lineHeight;
    if (props.letterSpacing != null) node.letterSpacing = props.letterSpacing;
  }

  if (
    propAppliesTo('layoutMode', node.type) &&
    props.layoutMode != null &&
    'layoutMode' in node
  ) {
    node.layoutMode = props.layoutMode;
  }
  if (
    propAppliesTo('itemSpacing', node.type) &&
    props.itemSpacing != null &&
    'itemSpacing' in node
  ) {
    node.itemSpacing = props.itemSpacing;
  }
  if (propAppliesTo('paddingTop', node.type) && props.paddingTop != null)
    node.paddingTop = props.paddingTop;
  if (propAppliesTo('paddingRight', node.type) && props.paddingRight != null)
    node.paddingRight = props.paddingRight;
  if (propAppliesTo('paddingBottom', node.type) && props.paddingBottom != null)
    node.paddingBottom = props.paddingBottom;
  if (propAppliesTo('paddingLeft', node.type) && props.paddingLeft != null)
    node.paddingLeft = props.paddingLeft;
  if (
    propAppliesTo('primaryAxisSizingMode', node.type) &&
    props.primaryAxisSizingMode != null &&
    'primaryAxisSizingMode' in node
  ) {
    node.primaryAxisSizingMode = props.primaryAxisSizingMode;
  }
  if (
    propAppliesTo('counterAxisSizingMode', node.type) &&
    props.counterAxisSizingMode != null &&
    'counterAxisSizingMode' in node
  ) {
    node.counterAxisSizingMode = props.counterAxisSizingMode;
  }
  if (
    propAppliesTo('primaryAxisAlignItems', node.type) &&
    props.primaryAxisAlignItems != null &&
    'primaryAxisAlignItems' in node
  ) {
    node.primaryAxisAlignItems = props.primaryAxisAlignItems;
  }
  if (
    propAppliesTo('counterAxisAlignItems', node.type) &&
    props.counterAxisAlignItems != null &&
    'counterAxisAlignItems' in node
  ) {
    node.counterAxisAlignItems = props.counterAxisAlignItems;
  }
  if (props.layoutGrow != null && 'layoutGrow' in node) {
    node.layoutGrow = props.layoutGrow;
  }
  if (props.layoutAlign != null && 'layoutAlign' in node) {
    node.layoutAlign = props.layoutAlign;
  }

  // 平台特有超集字段(仅对应平台生效,'in' 守卫在无此字段的平台跳过)
  if (props.fillStyleId != null && 'fillStyleId' in node)
    node.fillStyleId = props.fillStyleId;
  if (props.strokeStyleId != null && 'strokeStyleId' in node)
    node.strokeStyleId = props.strokeStyleId;
  if (props.textStyleId != null && 'textStyleId' in node)
    node.textStyleId = props.textStyleId;
  if (props.effectStyleId != null && 'effectStyleId' in node)
    node.effectStyleId = props.effectStyleId;
  if (node.type === 'TEXT') {
    if (props.textTruncation != null && 'textTruncation' in node)
      node.textTruncation = props.textTruncation;
    if (props.maxLines != null && 'maxLines' in node)
      node.maxLines = props.maxLines;
  }
}

/** 沿父链找最近的 INSTANCE 祖先(实例子节点样式覆盖的平台缺陷只出现在这类节点上) */
function enclosingInstance(node: NodeSkeleton): NodeSkeleton | null {
  let p = node.parent;
  while (p != null) {
    if (p.type === 'INSTANCE') return p;
    p = p.parent;
  }
  return null;
}

/**
 * 样式类字段:写在 INSTANCE 内的子节点上时,平台不保证渲染生效
 * (P7 实测 fills / fontName 回显是新值、渲染仍是组件原样式;其余样式同类风险)。
 * 几何/结构/命名类字段(x/y/width/height/name/visible/locked/布局)不在其列 ——
 * 那些在实例上是正常生效的覆盖,不该报风险。
 */
const INSTANCE_RISKY_PROPS = new Set([
  'fills',
  'strokes',
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
  'effects',
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
  'cornerSmoothing',
  'fontName',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textCase',
  'textDecoration',
  'textAlignHorizontal',
  'textAlignVertical',
]);

/** 风险提示里最多点名几个节点,其余折叠成计数,免得递归批量时刷屏 */
const INSTANCE_WARN_SAMPLE = 3;

/**
 * 容器自身被改时**肉眼看得见**的字段(P26:给 24×24 图标 FRAME 传 recursive 刷
 * 描边,12 个图标外框全被套上 strokeWeight:1 的方框)。只有 includeSelf=true 且
 * 命中这些字段时才提示 —— 布局/可见性/命名类改自身是正常预期,提示会刷屏。
 */
const CONTAINER_SELF_VISIBLE_PROPS = new Set([
  'fills',
  'strokes',
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
  'effects',
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
  'cornerSmoothing',
  'clipsContent',
  'layoutGrids',
  'arcData',
]);

/**
 * 实例子节点样式改不动的**可执行出口**:顺着名字路径在实例的主组件里定位同源
 * 子节点,把它的 id 直接算出来。调用方拿到就能改主组件(所有实例一起继承),
 * 不必自己再翻组件树。名字对不上(改过名 / 结构不一致)返回 null,
 * 由告警文案回落为「改主组件或 detach」。
 */
function instanceStyleFixHint(
  instance: NodeSkeleton,
  node: NodeSkeleton,
): string | null {
  try {
    const main = instance.mainComponent ?? null;
    if (main == null) return null;
    const path: string[] = [];
    let cur: NodeSkeleton | null = node;
    while (cur != null && cur.id !== instance.id) {
      path.unshift(cur.name);
      cur = cur.parent;
    }
    if (path.length === 0) return null;
    let target: NodeSkeleton = main;
    for (const name of path) {
      const next = (target.children ?? []).find((c) => c.name === name);
      if (next == null) return null;
      target = next;
    }
    return `主组件(${main.id})里的「${node.name}」(${target.id})`;
  } catch {
    return null;
  }
}

export async function updateSelection(
  host: DesignHost,
  params: {
    ids?: string[];
    matchName?: string;
    recursive?: boolean;
    /** recursive=true 时是否连目标节点自身一起改(默认 false,见 collectTargets) */
    includeSelf?: boolean;
    props: UpdateNodeProps;
  },
  /** 属性引擎方法名;给定则按该方法的字段白名单拦截越界字段 */
  method?: PropMethod,
): Promise<{ updated: SerializedNode[]; warnings?: string[] }> {
  const props = params.props ?? {};
  // 方法名即字段分组:越界字段直接拒绝,而不是静默应用或静默忽略。
  // 进程内调用方(如 apply_overrides)不传 method,保留全字段路径。
  if (method != null) {
    const allowed = new Set(PROP_METHOD_FIELDS[method]);
    const stray = Object.keys(props).filter((k) => !allowed.has(k));
    if (stray.length > 0) {
      throw new Error(
        `方法 ${method} 不接受字段: ${stray.join(', ')};该方法只负责 ${[...allowed].join(', ')}`,
      );
    }
  }
  let base: readonly NodeSkeleton[];
  if (params.ids != null && params.ids.length > 0) {
    base = findNode(host, params.ids);
  } else {
    base = host.currentPage.selection;
  }
  if (base.length === 0) {
    const idsHint =
      params.ids != null && params.ids.length > 0
        ? `(请求 ids: ${JSON.stringify(params.ids)})`
        : '(未传 ids,当前画布无选中)';
    throw new Error(
      `没有可修改的节点: 请先选中节点,或传入有效的 ids${idsHint};可用 jsd_find 复核节点存在与 id 有效性`,
    );
  }
  const targets = collectTargets(
    base,
    params.matchName,
    params.recursive ?? false,
    [],
    { includeSelf: params.includeSelf ?? false },
  );
  if (targets.length === 0) {
    throw new Error(
      `没有命中 matchName="${params.matchName}" 的节点(matchName 为精确匹配,需与节点 name 完全一致,非模糊搜索;可用 jsd_find 复核名称后重试)`,
    );
  }
  const warnings: string[] = [];
  const baseIds = new Set(base.map((n) => n.id));
  const riskyTargets: { label: string; hint: string | null }[] = [];
  const riskyProps = new Set<string>();
  const ignoredSuperset = new Set<string>();
  const selfMutated: string[] = [];
  const selfMutatedProps = new Set<string>();
  const layoutModeMissed: string[] = [];
  for (const node of targets) {
    // 能力门控字段:平台不具备该能力(或运行时不长这个属性)时,引擎赋值会静默跳过 → 先记下来点名
    for (const key of Object.keys(props)) {
      if (isGatedPropUnsupported(key, node)) {
        ignoredSuperset.add(key);
      }
    }
    // P26:includeSelf=true 时容器自身也在 targets 里,描边/填充会直接画在容器上
    if (
      params.recursive === true &&
      params.includeSelf === true &&
      baseIds.has(node.id)
    ) {
      const kids = 'children' in node ? (node.children?.length ?? 0) : 0;
      const hit = Object.keys(props).filter((k) =>
        CONTAINER_SELF_VISIBLE_PROPS.has(k),
      );
      if (kids > 0 && hit.length > 0) {
        selfMutated.push(`${node.name}(${node.id})`);
        for (const k of hit) selfMutatedProps.add(k);
      }
    }
    await applyProps(host, node, props);
    // 平台缺陷:布局重算会回写容器方向,写进去的 layoutMode 可能不是最终值(P31)。
    // applyProps 里 layoutMode 先写、padding/对齐/伸缩后写,正好落在会触发重算的
    // 那一段之后,所以这里回读一次:不一致就再压一次,压不住就点名(下方 warnings)。
    if (props.layoutMode != null && propAppliesTo('layoutMode', node.type)) {
      if (!ensureLayoutMode(node, props.layoutMode)) {
        layoutModeMissed.push(`${node.name}(${node.id})`);
      }
    }
    // 平台缺陷:实例子节点的样式覆盖回显成功但渲染不生效 → 写时点名,别让调用方以为改成了
    const instance = enclosingInstance(node);
    if (instance != null) {
      for (const key of Object.keys(props)) {
        if (INSTANCE_RISKY_PROPS.has(key)) {
          riskyProps.add(key);
          riskyTargets.push({
            label: `${node.name}(${node.id})`,
            hint: instanceStyleFixHint(instance, node),
          });
          break;
        }
      }
    }
  }
  if (riskyTargets.length > 0) {
    const sample = riskyTargets.slice(0, INSTANCE_WARN_SAMPLE);
    const rest =
      riskyTargets.length > INSTANCE_WARN_SAMPLE
        ? ` 等 ${riskyTargets.length} 个节点`
        : '';
    const hints = sample
      .filter((t) => t.hint != null)
      .map((t) => `${t.label} → 改 ${t.hint}`);
    warnings.push(
      [
        `实例子节点样式覆盖有平台风险:${sample.map((t) => t.label).join('、')}${rest} 位于 INSTANCE 内,`,
        '平台对实例子节点的样式覆盖不保证渲染生效(实测 fills/fontName 回显是新值但渲染仍是组件原样式)。',
        `本次改动字段:${[...riskyProps].join(', ')}。`,
        hints.length > 0
          ? `可靠改法 —— 改主组件对应子节点(所有实例一起继承):${hints.join(';')};`
          : '可靠改法 —— 改该实例的主组件对应子节点(所有实例一起继承);',
        '若只需要这一个实例不一样,先 jsd_detach_instance 把它脱离组件(变静态节点)再改;',
        '完成后用 jsd_export 导小图目检确认(回显不等于生效)。',
      ].join(''),
    );
  }
  if (selfMutated.length > 0) {
    const sample = selfMutated.slice(0, INSTANCE_WARN_SAMPLE);
    const rest =
      selfMutated.length > INSTANCE_WARN_SAMPLE
        ? ` 等 ${selfMutated.length} 个节点`
        : '';
    warnings.push(
      [
        `recursive + includeSelf:目标容器自身也被修改:${sample.join('、')}${rest}。`,
        '容器(FRAME/GROUP/COMPONENT/INSTANCE)自身加描边会渲染成矩形框、加填充会成底色;',
        '只想改后代就别传 includeSelf(recursive 默认只作用于后代,不含目标自身)。',
        `本次命中字段:${[...selfMutatedProps].join(', ')};完成后用 jsd_export 导小图目检。`,
      ].join(''),
    );
  }
  if (ignoredSuperset.size > 0) {
    const detail = [...ignoredSuperset]
      .map((key) => {
        const cap = CAPABILITY_OF_GATED_PROP[key];
        return cap != null ? `${key}(需 ${cap} 能力)` : key;
      })
      .join('、');
    warnings.push(
      `以下字段由平台能力门控,当前平台运行时不具备,已忽略:${detail};当前平台的能力表见 jsd_ping 的 capabilities(core 判定与该表同源,均取自 shared/dicts/capability.ts)`,
    );
  }
  if (layoutModeMissed.length > 0) {
    warnings.push(
      [
        `layoutMode 未能生效:${layoutModeMissed.join('、')} 回读后仍不是请求的方向(已重试写入一次)。`,
        '平台在布局重算后会回写容器方向,同一调用里后写的 padding/对齐/伸缩都可能把它带偏;',
        '子节点会按**回读到的**方向排布(方向错了会全叠在同一点,回显却一切正常)。',
        '处理:用 jsd_find 复核该容器的 layoutMode,再单独调一次 jsd_set_layout(只传 layoutMode)重设;',
        '设完用 jsd_export 导小图目检确认。',
      ].join(''),
    );
  }
  return {
    updated: targets.map((n) => serializeNode(n)),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
