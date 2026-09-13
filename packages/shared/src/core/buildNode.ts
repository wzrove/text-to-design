import type { ExecuteOp } from '../schemas';
import type { ContainerSkeleton, DesignHost, NodeSkeleton } from './host';
import { MIXED } from './host';
import {
  assertBooleanOperation,
  normalizeEffects,
  normalizeLayoutGrids,
  normalizePaints,
  normalizeVectorPaths,
} from './normalize';
import { loadFont, MIN_RESIZE_SIZE } from './utils';

/**
 * 按 spec 的 width/height 定尺寸;只给了一维时另一维沿用当前值。
 *
 * LINE 例外:允许某一维为 0(横线/竖线,画布上已有 LINE 序列化即为 height:0),
 * 但引擎 resize 校验要求 >= 0.01(实测 P9,直接传 0 会报
 * `in resize: Expected "width" to have value >= 0.01`),这里把零轴抬到引擎
 * 可接受的最小值,视觉上仍是一条直线。
 */
function applySize(node: NodeSkeleton, spec: ExecuteOp): void {
  if (spec.width == null || !('resize' in node)) return;
  const targetW = spec.width;
  const targetH = spec.height ?? node.height;
  if (node.type === 'LINE') {
    node.resize(
      Math.max(targetW, MIN_RESIZE_SIZE),
      Math.max(targetH, MIN_RESIZE_SIZE),
    );
  } else {
    node.resize(targetW, targetH);
  }
}

async function buildNode(
  host: DesignHost,
  spec: ExecuteOp,
  parent: ContainerSkeleton,
): Promise<NodeSkeleton> {
  const type = spec.type;
  let node: NodeSkeleton;
  switch (type) {
    case 'TEXT':
      node = host.createText();
      break;
    case 'RECTANGLE':
      node = host.createRectangle();
      break;
    case 'ELLIPSE':
      node = host.createEllipse();
      break;
    case 'LINE':
      node = host.createLine();
      break;
    case 'POLYGON':
      node = host.createPolygon();
      break;
    case 'STAR':
      node = host.createStar();
      break;
    case 'VECTOR':
      node = host.createVector();
      break;
    case 'BOOLEAN_OPERATION': {
      const children = spec.children ?? [];
      if (children.length < 2) {
        throw new Error('BOOLEAN_OPERATION 至少需要 2 个子节点');
      }
      const tmp = host.createFrame();
      parent.appendChild(tmp);
      for (const child of children) {
        await buildNode(host, child, tmp);
      }
      const combine: Record<
        string,
        (
          nodes: readonly NodeSkeleton[],
          parent: ContainerSkeleton,
        ) => NodeSkeleton
      > = {
        UNION: host.union,
        SUBTRACT: host.subtract,
        INTERSECT: host.intersect,
        EXCLUDE: host.exclude,
      };
      const op = assertBooleanOperation(spec.booleanOperation ?? 'UNION');
      node = combine[op]([...(tmp.children ?? [])], parent);
      tmp.remove();
      break;
    }
    case 'GROUP': {
      const children = spec.children ?? [];
      if (children.length < 2) {
        throw new Error('GROUP 至少需要 2 个子节点');
      }
      const tmp = host.createFrame();
      parent.appendChild(tmp);
      for (const child of children) {
        await buildNode(host, child, tmp);
      }
      node = tmp;
      break;
    }
    default:
      node = host.createFrame();
  }

  node.name = spec.name ?? 'node';
  node.x = spec.x ?? 0;
  node.y = spec.y ?? 0;

  applySize(node, spec);
  if (spec.rotation != null) node.rotation = spec.rotation;
  if (spec.opacity != null && 'opacity' in node) node.opacity = spec.opacity;
  if (spec.locked != null) node.locked = spec.locked;
  if (spec.visible != null && 'visible' in node) node.visible = spec.visible;

  if (spec.fills != null && 'fills' in node) {
    node.fills = normalizePaints(spec.fills, 'fills');
  } else if (spec.strokes != null && 'fills' in node && node.type !== 'FRAME') {
    // 只给了描边、没给填充:引擎会给图形自动塞 #CCCCCC 灰底(P10),
    // 纯描边图标就成了灰块。这里显式清空填充。
    // 例外 FRAME:容器按文档走引擎默认白底,不在此改动。
    node.fills = [];
  }
  if (spec.strokes != null && 'strokes' in node)
    node.strokes = normalizePaints(spec.strokes, 'strokes');

  if (spec.strokeWeight != null && 'strokeWeight' in node)
    node.strokeWeight = spec.strokeWeight;
  if (spec.strokeTopWeight != null && 'strokeTopWeight' in node)
    node.strokeTopWeight = spec.strokeTopWeight;
  if (spec.strokeBottomWeight != null && 'strokeBottomWeight' in node)
    node.strokeBottomWeight = spec.strokeBottomWeight;
  if (spec.strokeLeftWeight != null && 'strokeLeftWeight' in node)
    node.strokeLeftWeight = spec.strokeLeftWeight;
  if (spec.strokeRightWeight != null && 'strokeRightWeight' in node)
    node.strokeRightWeight = spec.strokeRightWeight;
  if (spec.strokeAlign != null && 'strokeAlign' in node)
    node.strokeAlign = spec.strokeAlign;
  if (spec.strokeCap != null && 'strokeCap' in node)
    node.strokeCap = spec.strokeCap;
  if (spec.strokeJoin != null && 'strokeJoin' in node)
    node.strokeJoin = spec.strokeJoin;
  if (spec.dashPattern != null && 'dashPattern' in node)
    node.dashPattern = spec.dashPattern;
  if (spec.blendMode != null && 'blendMode' in node)
    node.blendMode = spec.blendMode;
  if (spec.cornerSmoothing != null && 'cornerSmoothing' in node)
    node.cornerSmoothing = spec.cornerSmoothing;
  if (spec.constraints != null && 'constraints' in node)
    node.constraints = spec.constraints;
  if (spec.clipsContent != null && 'clipsContent' in node)
    node.clipsContent = spec.clipsContent;
  if (spec.layoutGrids != null && 'layoutGrids' in node)
    node.layoutGrids = normalizeLayoutGrids(spec.layoutGrids);

  if (spec.effects != null && 'effects' in node)
    node.effects = normalizeEffects(spec.effects);

  if ('cornerRadius' in node) {
    if (spec.cornerRadius != null) node.cornerRadius = spec.cornerRadius;
    if ('topLeftRadius' in node) {
      if (spec.topLeftRadius != null) node.topLeftRadius = spec.topLeftRadius;
      if (spec.topRightRadius != null)
        node.topRightRadius = spec.topRightRadius;
      if (spec.bottomLeftRadius != null)
        node.bottomLeftRadius = spec.bottomLeftRadius;
      if (spec.bottomRightRadius != null)
        node.bottomRightRadius = spec.bottomRightRadius;
    }
  }

  if (
    (node.type === 'POLYGON' || node.type === 'STAR') &&
    spec.pointCount != null
  ) {
    node.pointCount = spec.pointCount;
  }
  if (node.type === 'STAR' && spec.innerRadius != null) {
    node.innerRadius = spec.innerRadius;
  }
  if (node.type === 'ELLIPSE' && spec.arcData != null && 'arcData' in node) {
    node.arcData = spec.arcData;
  }

  if (node.type === 'TEXT') {
    if (spec.fontName && node.fontName !== MIXED) {
      await loadFont(host, spec.fontName.family, spec.fontName.style);
      node.fontName = spec.fontName;
    }
    node.characters = spec.characters ?? 'text';
    node.fontSize = spec.fontSize ?? 16;
    if (spec.textAlignHorizontal != null)
      node.textAlignHorizontal = spec.textAlignHorizontal;
    if (spec.textAlignVertical != null)
      node.textAlignVertical = spec.textAlignVertical;
    if (spec.textAutoResize != null) node.textAutoResize = spec.textAutoResize;
    if (spec.textCase != null) node.textCase = spec.textCase;
    if (spec.textDecoration != null) node.textDecoration = spec.textDecoration;
    if (spec.lineHeight != null) node.lineHeight = spec.lineHeight;
    if (spec.letterSpacing != null) node.letterSpacing = spec.letterSpacing;
  }

  parent.appendChild(node);
  if (spec.type === 'BOOLEAN_OPERATION') {
    return node;
  }
  if (node.type === 'VECTOR' && spec.vectorPaths != null) {
    // 归一化:data 必填,windingRule 缺省 NONZERO(引擎对 undefined 直接抛错)
    node.vectorPaths = normalizeVectorPaths(
      spec.vectorPaths,
    ) as typeof spec.vectorPaths;
  }
  for (const child of spec.children ?? []) {
    await buildNode(host, child, node);
  }

  if (
    node.type === 'FRAME' &&
    spec.layoutMode != null &&
    'layoutMode' in node
  ) {
    node.layoutMode = spec.layoutMode;
    // itemSpacing 一贯缺省 0;padding 必须与它同口径:
    // 引擎在开启 auto-layout 时会把四边 padding 默认置 10(实测 P18),
    // 调用方没传就显式归 0,免得「没写 padding 却莫名多出 10px 内边距」。
    node.itemSpacing = spec.itemSpacing ?? 0;
    node.paddingTop = spec.paddingTop ?? 0;
    node.paddingRight = spec.paddingRight ?? 0;
    node.paddingBottom = spec.paddingBottom ?? 0;
    node.paddingLeft = spec.paddingLeft ?? 0;
    if (spec.primaryAxisSizingMode != null)
      node.primaryAxisSizingMode = spec.primaryAxisSizingMode;
    if (spec.counterAxisSizingMode != null)
      node.counterAxisSizingMode = spec.counterAxisSizingMode;
    if (spec.primaryAxisAlignItems != null)
      node.primaryAxisAlignItems = spec.primaryAxisAlignItems;
    if (spec.counterAxisAlignItems != null)
      node.counterAxisAlignItems = spec.counterAxisAlignItems;

    // 显式给了尺寸、却没声明该轴的 sizingMode → 该轴钉成 FIXED。
    // 引擎开启 auto-layout 时默认按内容撑开(AUTO),会把调用方给的尺寸悄悄吃掉:
    // 实测传 width:690,height:210 带嵌套 children,返回 630×160(P18)。
    // 调用方显式声明过 sizingMode 的一律尊重,不抢。
    const widthIsPrimary = spec.layoutMode === 'HORIZONTAL';
    if (
      spec.width != null &&
      spec.primaryAxisSizingMode == null &&
      widthIsPrimary
    )
      node.primaryAxisSizingMode = 'FIXED';
    if (
      spec.width != null &&
      spec.counterAxisSizingMode == null &&
      !widthIsPrimary
    )
      node.counterAxisSizingMode = 'FIXED';
    if (
      spec.height != null &&
      spec.primaryAxisSizingMode == null &&
      !widthIsPrimary
    )
      node.primaryAxisSizingMode = 'FIXED';
    if (
      spec.height != null &&
      spec.counterAxisSizingMode == null &&
      widthIsPrimary
    )
      node.counterAxisSizingMode = 'FIXED';
  }
  if (spec.layoutGrow != null && 'layoutGrow' in node) {
    node.layoutGrow = spec.layoutGrow;
  }
  if (spec.layoutAlign != null && 'layoutAlign' in node) {
    node.layoutAlign = spec.layoutAlign;
  }

  // 尺寸最后再定一次(P18):开启 auto-layout 会触发引擎按子项重算容器尺寸,
  // 把建节点早期那次 resize 覆盖掉 —— 实测传 width:690,height:210 带嵌套
  // children 建卡片,返回却是 630×122。显式给了尺寸就以调用方为准再压一遍。
  applySize(node, spec);

  // resize 会把显式声明的 AUTO 悄悄改回 FIXED(实测:声明 primaryAxis/
  // counterAxis 都是 AUTO 并给 width:500,height:80,压完尺寸后两个轴都变成
  // FIXED)。所以压完尺寸要把调用方**声明过**的 sizingMode 再写一次,
  // 否则上一行的 resize 就等于抢了调用方的显式意图 —— 说了要 hug 却给固定尺寸。
  if (node.type === 'FRAME' && spec.layoutMode != null) {
    if (spec.primaryAxisSizingMode != null)
      node.primaryAxisSizingMode = spec.primaryAxisSizingMode;
    if (spec.counterAxisSizingMode != null)
      node.counterAxisSizingMode = spec.counterAxisSizingMode;
  }

  // 平台特有超集字段(仅对应平台生效,'in' 守卫在无此字段的平台跳过)
  if (spec.fillStyleId != null && 'fillStyleId' in node)
    node.fillStyleId = spec.fillStyleId;
  if (spec.strokeStyleId != null && 'strokeStyleId' in node)
    node.strokeStyleId = spec.strokeStyleId;
  if (spec.textStyleId != null && 'textStyleId' in node)
    node.textStyleId = spec.textStyleId;
  if (spec.effectStyleId != null && 'effectStyleId' in node)
    node.effectStyleId = spec.effectStyleId;
  if (node.type === 'TEXT') {
    if (spec.textTruncation != null && 'textTruncation' in node)
      node.textTruncation = spec.textTruncation;
    if (spec.maxLines != null && 'maxLines' in node)
      node.maxLines = spec.maxLines;
  }
  return node;
}

export default buildNode;
