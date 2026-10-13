import type {
  ComponentPropertyReferences,
  Paint,
  SerializedNode,
  SerializedNodeType,
  LetterSpacing as WireLetterSpacing,
  VectorPath as WireVectorPath,
} from '../schemas';
import { MIXED, type NodeSkeleton } from './host';

export const MAX_SERIALIZE_DEPTH = 2;

function isMixed(v: unknown): v is typeof MIXED {
  return typeof v === 'string' && (v as string) === MIXED;
}

/**
 * 引用槽位名归一到一套词汇(0041):Figma 原生叫 `visible`,MG 原生叫 `isVisible`。
 * 不做这层归一,读路径就会把 0025 刚决定藏起来的「两套词汇」重新暴露出去。
 */
const REFERENCE_SLOT_ALIASES: Record<
  string,
  keyof ComponentPropertyReferences
> = {
  visible: 'visible',
  isVisible: 'visible',
  characters: 'characters',
  mainComponent: 'mainComponent',
};

/**
 * 把引擎给的 `componentPropertyReferences` 整成线格式。
 *
 * 值是属性的**完整键**,原样保留 —— 它就是写侧要传的那个键(读写字形一致,同 0024
 * 对 `boundVariables` 的纪律)。空值 / null 一律丢掉,使「键在 = 至少有一条引用」
 * 成为可直接依赖的判据;认不出的槽位名也丢掉,不让引擎新增的槽位漏进线格式。
 */
function normalizePropertyReferences(
  raw: unknown,
): ComponentPropertyReferences {
  const out: ComponentPropertyReferences = {};
  if (raw == null || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const slot = REFERENCE_SLOT_ALIASES[key];
    if (slot == null) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    out[slot] = value;
  }
  return out;
}

export function trySerialize(
  node: NodeSkeleton,
  depth: number = MAX_SERIALIZE_DEPTH,
): SerializedNode | null {
  try {
    return serializeNode(node, depth);
  } catch {
    return null;
  }
}

/**
 * 节点在父级 `children` 里的下标(= 绘制顺序,0 = 最底层)。
 *
 * 平台语义「children 顺序即绘制顺序」在这里被显式化成 `z` 字段回传,
 * 调用方读 `z` 判断遮挡即可,不需要记住数组方向(这正是「速查表」条目的代码化落点)。
 *
 * 按 id 比对而非对象引用:插件侧每次访问 `children` 可能返回新的代理对象。
 * 读取失败(节点已失效 / 父级无 children)返回 undefined,不阻塞整体序列化。
 */
function childIndexOf(node: NodeSkeleton): number | undefined {
  try {
    const kids = node.parent?.children;
    if (kids == null) return undefined;
    const i = kids.findIndex((c) => c.id === node.id);
    return i >= 0 ? i : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `letterSpacing` 的形状收窄:运行时偶尔给出**双层**包装 ——
 * `{ unit:'PIXELS', value:{ value:0, unit:'PIXELS' } }`,而线格式要的是
 * `{ value:number, unit }`。真机 2026-10-14 在即时设计上复现:组件内的文本节点
 * (`jsd_create_component` 的 children 建出来的那一层)读回来就是双层,同一客户端
 * 用 `jsd_create_text` 直接建的文本节点是平的 —— 所以是宿主运行时的形状差,不是本仓写进去的。
 *
 * 为什么在这里收窄而不留给 `as unknown as`:那样整条结果会撞 `outputSchema`,
 * 于是 `structured()` 把**读到的数据本身**当错误正文回给调用方(见 response.ts),
 * 一个只读查询就因为一个可归一的形状被判失败。双层里内层才是引擎认可的取值,取内层。
 */
function unwrapLetterSpacing(raw: unknown): WireLetterSpacing | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const outer = raw as { unit?: unknown; value?: unknown };
  const inner =
    outer.value != null && typeof outer.value === 'object'
      ? (outer.value as { unit?: unknown; value?: unknown })
      : undefined;
  if (inner != null) {
    return {
      value: typeof inner.value === 'number' ? inner.value : 0,
      unit: (typeof inner.unit === 'string' ? inner.unit : outer.unit) as
        | 'PIXELS'
        | 'PERCENT',
    };
  }
  return {
    value: typeof outer.value === 'number' ? outer.value : 0,
    unit: (outer.unit ?? 'PIXELS') as 'PIXELS' | 'PERCENT',
  };
}

/**
 * @param zIndex 已知的父级下标(递归 children 时直接传入,省掉一次父级扫描);
 *   顶层调用留空则按父级 children 现算。
 */
export function serializeNode(
  node: NodeSkeleton,
  depth: number = MAX_SERIALIZE_DEPTH,
  zIndex?: number,
): SerializedNode {
  const base: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type as SerializedNodeType,
    x: Math.round(node.x),
    y: Math.round(node.y),
  };
  if ('width' in node) {
    base.width = Math.round(node.width);
    base.height = Math.round(node.height);
  }
  if ('rotation' in node && node.rotation !== 0)
    base.rotation = Math.round(node.rotation);
  if (
    'opacity' in node &&
    typeof node.opacity === 'number' &&
    node.opacity !== 1
  )
    base.opacity = node.opacity;
  if ('visible' in node && typeof node.visible === 'boolean' && !node.visible)
    base.visible = false;
  if ('locked' in node && node.locked) base.locked = true;
  if ('parent' in node && node.parent) {
    base.parentId = node.parent.id;
  }
  const z = zIndex ?? childIndexOf(node);
  if (z != null) base.z = z;

  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    base.fills = node.fills.map((f) => {
      if (f.type === 'SOLID') {
        return {
          type: 'SOLID',
          color: { r: f.color.r, g: f.color.g, b: f.color.b },
          ...(f.opacity != null && f.opacity < 1 ? { opacity: f.opacity } : {}),
          ...(f.visible != null ? { visible: f.visible } : {}),
          ...(f.blendMode != null && f.blendMode !== 'NORMAL'
            ? { blendMode: f.blendMode }
            : {}),
        };
      }
      if (
        f.type === 'GRADIENT_LINEAR' ||
        f.type === 'GRADIENT_RADIAL' ||
        f.type === 'GRADIENT_ANGULAR'
      ) {
        return {
          type: f.type,
          gradientStops: f.gradientStops.map((s) => ({
            color: {
              r: s.color.r,
              g: s.color.g,
              b: s.color.b,
              a: s.color.a ?? 1,
            },
            position: s.position,
          })),
          gradientTransform: f.gradientTransform as [
            [number, number, number],
            [number, number, number],
          ],
        };
      }
      if (f.type === 'IMAGE') {
        return {
          type: 'IMAGE',
          imageHash: f.imageHash,
          ...(f.scaleMode != null ? { scaleMode: f.scaleMode } : {}),
        };
      }
      return f;
    }) as Paint[];
  }

  if (
    'strokes' in node &&
    Array.isArray(node.strokes) &&
    node.strokes.length > 0
  ) {
    base.strokes = node.strokes.map((s) => {
      if (s.type === 'SOLID') {
        return {
          type: 'SOLID',
          color: { r: s.color.r, g: s.color.g, b: s.color.b },
          ...(s.opacity != null && s.opacity < 1 ? { opacity: s.opacity } : {}),
        };
      }
      if (
        s.type === 'GRADIENT_LINEAR' ||
        s.type === 'GRADIENT_RADIAL' ||
        s.type === 'GRADIENT_ANGULAR'
      ) {
        return {
          type: s.type,
          gradientStops: s.gradientStops.map((st) => ({
            color: {
              r: st.color.r,
              g: st.color.g,
              b: st.color.b,
              a: st.color.a ?? 1,
            },
            position: st.position,
          })),
          gradientTransform: s.gradientTransform as [
            [number, number, number],
            [number, number, number],
          ],
        };
      }
      return s;
    }) as Paint[];

    if (
      'strokeWeight' in node &&
      typeof node.strokeWeight === 'number' &&
      node.strokeWeight > 0
    ) {
      base.strokeWeight = node.strokeWeight;
    }
  }

  if ('strokeAlign' in node && node.type !== 'FRAME' && node.type !== 'TEXT') {
    const sa = node.strokeAlign;
    if (sa != null && sa !== 'CENTER')
      base.strokeAlign = sa as SerializedNode['strokeAlign'];
  }
  if ('strokeCap' in node && node.strokeCap != null && !isMixed(node.strokeCap))
    base.strokeCap = node.strokeCap as SerializedNode['strokeCap'];
  if (
    'strokeJoin' in node &&
    node.strokeJoin != null &&
    !isMixed(node.strokeJoin)
  )
    base.strokeJoin = node.strokeJoin as SerializedNode['strokeJoin'];
  if ('dashPattern' in node && node.dashPattern?.length)
    base.dashPattern = [...node.dashPattern];
  if (
    'blendMode' in node &&
    node.blendMode !== 'PASS_THROUGH' &&
    node.blendMode !== 'NORMAL'
  )
    base.blendMode = node.blendMode as SerializedNode['blendMode'];
  if (
    'cornerSmoothing' in node &&
    typeof node.cornerSmoothing === 'number' &&
    node.cornerSmoothing !== 0
  )
    base.cornerSmoothing = node.cornerSmoothing;
  if ('constraints' in node && node.constraints != null) {
    const c = node.constraints;
    if (c.horizontal !== 'MIN' || c.vertical !== 'MIN')
      base.constraints = { horizontal: c.horizontal, vertical: c.vertical };
  }
  if ('clipsContent' in node && node.type === 'FRAME' && node.clipsContent)
    base.clipsContent = true;
  if (node.type === 'ELLIPSE' && 'arcData' in node && node.arcData != null) {
    const arc = node.arcData;
    if (arc.startingAngle !== 0 || arc.endingAngle !== 2 * Math.PI) {
      base.arcData = {
        startingAngle: arc.startingAngle,
        endingAngle: arc.endingAngle,
        innerRadius: arc.innerRadius,
      };
    }
  }
  if (
    'strokeTopWeight' in node &&
    typeof node.strokeTopWeight === 'number' &&
    node.strokeTopWeight > 0
  ) {
    base.strokeTopWeight = node.strokeTopWeight;
  }
  if (
    'strokeBottomWeight' in node &&
    typeof node.strokeBottomWeight === 'number' &&
    node.strokeBottomWeight > 0
  ) {
    base.strokeBottomWeight = node.strokeBottomWeight;
  }
  if (
    'strokeLeftWeight' in node &&
    typeof node.strokeLeftWeight === 'number' &&
    node.strokeLeftWeight > 0
  ) {
    base.strokeLeftWeight = node.strokeLeftWeight;
  }
  if (
    'strokeRightWeight' in node &&
    typeof node.strokeRightWeight === 'number' &&
    node.strokeRightWeight > 0
  ) {
    base.strokeRightWeight = node.strokeRightWeight;
  }
  if ('effects' in node && Array.isArray(node.effects)) {
    const effects = node.effects.filter((e) => e.visible);
    if (effects.length > 0) {
      const list: NonNullable<SerializedNode['effects']> = [];
      for (const e of effects) {
        switch (e.type) {
          case 'LAYER_BLUR':
          case 'BACKGROUND_BLUR':
            list.push({ type: e.type, radius: e.radius, visible: e.visible });
            break;
          case 'DROP_SHADOW': {
            const item: NonNullable<SerializedNode['effects']>[number] = {
              type: 'DROP_SHADOW',
              offset: e.offset,
              radius: e.radius,
              color: e.color,
              visible: e.visible,
              blendMode: e.blendMode ?? 'NORMAL',
            };
            if (e.spread != null) item.spread = e.spread;
            if (e.showShadowBehindNode != null)
              item.showShadowBehindNode = e.showShadowBehindNode;
            list.push(item);
            break;
          }
          case 'INNER_SHADOW': {
            const item: NonNullable<SerializedNode['effects']>[number] = {
              type: 'INNER_SHADOW',
              offset: e.offset,
              radius: e.radius,
              color: e.color,
              visible: e.visible,
              blendMode: e.blendMode ?? 'NORMAL',
            };
            if (e.spread != null) item.spread = e.spread;
            list.push(item);
            break;
          }
          default: {
            throw new Error(`未处理的效果类型: ${JSON.stringify(e)}`);
          }
        }
      }
      if (list.length > 0) base.effects = list;
    }
  }
  if (
    'cornerRadius' in node &&
    typeof node.cornerRadius === 'number' &&
    node.cornerRadius !== 0
  ) {
    base.cornerRadius = node.cornerRadius;
  }
  if ('topLeftRadius' in node) {
    base.topLeftRadius =
      typeof node.topLeftRadius === 'number' ? node.topLeftRadius : undefined;
    base.topRightRadius =
      typeof node.topRightRadius === 'number' ? node.topRightRadius : undefined;
    base.bottomLeftRadius =
      typeof node.bottomLeftRadius === 'number'
        ? node.bottomLeftRadius
        : undefined;
    base.bottomRightRadius =
      typeof node.bottomRightRadius === 'number'
        ? node.bottomRightRadius
        : undefined;
  }
  if ('pointCount' in node) {
    base.pointCount = node.pointCount;
  }
  if (node.type === 'STAR' && 'innerRadius' in node) {
    base.innerRadius = node.innerRadius;
  }
  if (node.type === 'VECTOR' && node.vectorPaths != null) {
    base.vectorPaths = node.vectorPaths.map((p) => ({
      data: p.data,
      windingRule:
        (p as { windingRule?: string }).windingRule === 'NONE'
          ? undefined
          : p.windingRule,
    })) as unknown as WireVectorPath[];
  }
  // 读 `variantProperties` 会抛的情况(Figma 实测:文档里存在「带错误的组件集」时,
  // 引擎报 `in get_variantProperties: Component set for node has existing errors`)。
  // 这是**摘要字段**:取不到就省略,绝不能让整份序列化失败 —— 而 `findNodes`
  // 是逐节点调 serializeNode 的,一个坏节点会把整次查找掀翻(2026-09-24 Figma 真机)。
  try {
    if ('variantProperties' in node && node.variantProperties != null) {
      base.variantProperties = { ...node.variantProperties };
    }
  } catch {
    // 引擎 getter 抛:该字段省略,其余字段照常回传
  }
  // dynamic-page 下读 mainComponent 会抛(`Cannot call with documentAccess:
  // dynamic-page`):这字段是摘要性质,取不到就省略,不能让整份序列化失败。
  // 需要主组件 id 的逻辑走 Access 层的 resolveMainComponent(0011)。
  if (node.type === 'INSTANCE') {
    try {
      const main = node.mainComponent;
      if (main != null) base.mainComponentId = main.id;
    } catch {
      // 平台禁止同步访问:跳过该字段
    }
  }
  if ('fillStyleId' in node && node.fillStyleId)
    base.fillStyleId = node.fillStyleId;
  if ('strokeStyleId' in node && node.strokeStyleId)
    base.strokeStyleId = node.strokeStyleId;
  if ('textStyleId' in node && node.textStyleId)
    base.textStyleId = node.textStyleId;
  if ('effectStyleId' in node && node.effectStyleId)
    base.effectStyleId = node.effectStyleId;
  if (node.type === 'TEXT') {
    if ('textTruncation' in node && node.textTruncation === 'ENDING')
      base.textTruncation = 'ENDING';
    if ('maxLines' in node && node.maxLines != null)
      base.maxLines = node.maxLines;
  }
  if ('componentProperties' in node && node.componentProperties != null) {
    base.componentProperties = { ...node.componentProperties };
  }
  // 组件属性**引用**(0041):某图层的哪个槽位由哪个组件属性驱动 —— 与上面那条成对
  // (那条说「实例上属性等于什么」,这条说「哪个图层会被它改」)。真机踩过:属性成对
  // 存在(`摘要`/`摘要2`)时只有连着可见层的那一组会改画面,写错那组「回包成功、画布
  // 不动」—— 读路径里没有这层关系,调用方就只能靠试。摘要字段:平台没有该声明
  // (jsDesign)或 getter 抛就只丢它,绝不掀翻整份序列化。
  try {
    if ('componentPropertyReferences' in node) {
      const refs = normalizePropertyReferences(
        node.componentPropertyReferences,
      );
      if (Object.keys(refs).length > 0) base.componentPropertyReferences = refs;
    }
  } catch {
    // 引擎 getter 抛:该字段省略,其余字段照常回传
  }
  // 变量绑定(仅 Figma):键就是写侧 figma_variables_apply 的 boundProperty 词汇,
  // 故整对象原样透传,不归一、不改名 —— 写后回读比的就是同一个 variableId(0024)。
  // 与 variantProperties 同纪律:摘要字段,引擎 getter 抛就只丢它,绝不掀翻整份序列化。
  // 无绑定(空对象)时省略,使「键在 = 至少有一条绑定」成为可直接依赖的判据。
  try {
    if ('boundVariables' in node) {
      const bv = node.boundVariables;
      if (bv != null && Object.keys(bv).length > 0) {
        base.boundVariables = { ...bv };
      }
    }
  } catch {
    // 引擎 getter 抛:该字段省略,其余字段照常回传
  }
  if (node.type === 'COMPONENT_SET' && node.variantGroupProperties != null) {
    base.variantGroupProperties = Object.fromEntries(
      Object.entries(node.variantGroupProperties).map(([k, v]) => [
        k,
        [...v.values],
      ]),
    );
  }
  if (node.type === 'BOOLEAN_OPERATION' && node.booleanOperation != null) {
    base.booleanOperation = node.booleanOperation;
  }
  if ('isMask' in node && node.isMask) {
    base.isMask = true;
  }
  if (node.type === 'TEXT') {
    base.characters = node.characters;
    if (!isMixed(node.fontSize)) base.fontSize = node.fontSize as number;
    const f = node.fontName;
    if (f != null && typeof f === 'object' && f.family)
      base.fontName = { family: f.family, style: f.style };
    if (
      node.textAlignHorizontal !== 'LEFT' &&
      !isMixed(node.textAlignHorizontal)
    )
      base.textAlignHorizontal = node.textAlignHorizontal;
    if (node.textAlignVertical !== 'TOP' && !isMixed(node.textAlignVertical))
      base.textAlignVertical = node.textAlignVertical;
    if (node.textAutoResize !== 'NONE')
      base.textAutoResize = node.textAutoResize;
    if (node.textCase !== 'ORIGINAL' && !isMixed(node.textCase))
      base.textCase = node.textCase as SerializedNode['textCase'];
    if (node.textDecoration !== 'NONE' && !isMixed(node.textDecoration))
      base.textDecoration =
        node.textDecoration as SerializedNode['textDecoration'];
    if (!isMixed(node.lineHeight))
      base.lineHeight = node.lineHeight as SerializedNode['lineHeight'];
    if (!isMixed(node.letterSpacing)) {
      base.letterSpacing = unwrapLetterSpacing(node.letterSpacing);
    }
  }
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    base.layoutMode = node.layoutMode;
    base.itemSpacing = isMixed(node.itemSpacing) ? undefined : node.itemSpacing;
    const pTop = isMixed(node.paddingTop) ? undefined : node.paddingTop;
    const pRight = isMixed(node.paddingRight) ? undefined : node.paddingRight;
    const pBottom = isMixed(node.paddingBottom)
      ? undefined
      : node.paddingBottom;
    const pLeft = isMixed(node.paddingLeft) ? undefined : node.paddingLeft;
    base.paddingTop = pTop;
    base.paddingRight = pRight;
    base.paddingBottom = pBottom;
    base.paddingLeft = pLeft;
    if (node.primaryAxisSizingMode != null)
      base.primaryAxisSizingMode = node.primaryAxisSizingMode;
    if (node.counterAxisSizingMode != null)
      base.counterAxisSizingMode = node.counterAxisSizingMode;
    if (node.primaryAxisAlignItems != null)
      base.primaryAxisAlignItems = node.primaryAxisAlignItems;
    if (node.counterAxisAlignItems != null)
      base.counterAxisAlignItems = node.counterAxisAlignItems;
  }
  if (
    'layoutGrids' in node &&
    node.layoutGrids != null &&
    node.layoutGrids.length > 0
  ) {
    base.layoutGrids = node.layoutGrids.map((g) => {
      const out: NonNullable<SerializedNode['layoutGrids']>[number] = {
        pattern: g.pattern,
      };
      if (g.alignment != null && g.alignment !== 'STRETCH')
        out.alignment = g.alignment;
      if (g.gutterSize != null) out.gutterSize = g.gutterSize;
      if (g.count != null && Number.isFinite(g.count)) out.count = g.count;
      if (g.sectionSize != null) out.sectionSize = g.sectionSize;
      if (g.offset != null) out.offset = g.offset;
      if (g.visible != null) out.visible = g.visible;
      if (g.color != null) out.color = g.color;
      return out;
    });
  }
  if (
    'layoutGrow' in node &&
    node.layoutGrow != null &&
    node.layoutGrow !== 0
  ) {
    base.layoutGrow = node.layoutGrow;
  }
  if (
    'layoutAlign' in node &&
    node.layoutAlign != null &&
    node.layoutAlign !== 'INHERIT'
  ) {
    base.layoutAlign = node.layoutAlign;
  }
  if ('children' in node) {
    const kids = node.children ?? [];
    if (kids.length > 0) {
      if (depth > 0) {
        // 下标即绘制顺序,顺手把 z 填了(子级递归不必再回查父级)
        base.children = kids.map((c, i) => serializeNode(c, depth - 1, i));
      } else {
        base.childCount = kids.length;
      }
    }
  }
  return base;
}
