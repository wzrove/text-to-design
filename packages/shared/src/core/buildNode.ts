import type { ExecuteOp } from '../schemas';
import type { ContainerSkeleton, DesignHost, NodeSkeleton } from './host';
import { MIXED } from './host';
import { loadFont } from './utils';

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
      node = combine[spec.booleanOperation ?? 'UNION'](
        [...(tmp.children ?? [])],
        parent,
      );
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

  if (spec.width != null && 'resize' in node)
    node.resize(spec.width, spec.height ?? node.height);
  if (spec.rotation != null) node.rotation = spec.rotation;
  if (spec.opacity != null && 'opacity' in node) node.opacity = spec.opacity;
  if (spec.locked != null) node.locked = spec.locked;
  if (spec.visible != null && 'visible' in node) node.visible = spec.visible;

  if (spec.fills && 'fills' in node) node.fills = spec.fills;
  if (spec.strokes && 'strokes' in node) node.strokes = spec.strokes;

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
    node.layoutGrids = spec.layoutGrids;

  if (spec.effects && 'effects' in node) node.effects = spec.effects;

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
    // 防御:类型上 windingRule 必填,但运行时 JSON 可能缺省(如经 shim
    // 原样转发的历史调用);jsDesign 引擎对 undefined 会直接抛错,
    // 这里兜底补默认值,兑现 schema 承诺的「默认 NONZERO」
    const loose = spec.vectorPaths as Array<{
      data: string;
      windingRule?: string;
    }>;
    node.vectorPaths = loose.map((p) => ({
      data: p.data,
      windingRule:
        p.windingRule ?? ('NONZERO' as 'NONZERO' | 'EVENODD' | 'NONE'),
    })) as typeof spec.vectorPaths;
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
    node.itemSpacing = spec.itemSpacing ?? 0;
    if (spec.primaryAxisSizingMode != null)
      node.primaryAxisSizingMode = spec.primaryAxisSizingMode;
    if (spec.counterAxisSizingMode != null)
      node.counterAxisSizingMode = spec.counterAxisSizingMode;
    if (spec.primaryAxisAlignItems != null)
      node.primaryAxisAlignItems = spec.primaryAxisAlignItems;
    if (spec.counterAxisAlignItems != null)
      node.counterAxisAlignItems = spec.counterAxisAlignItems;
    if (spec.paddingTop != null) node.paddingTop = spec.paddingTop;
    if (spec.paddingRight != null) node.paddingRight = spec.paddingRight;
    if (spec.paddingBottom != null) node.paddingBottom = spec.paddingBottom;
    if (spec.paddingLeft != null) node.paddingLeft = spec.paddingLeft;
  }
  if (spec.layoutGrow != null && 'layoutGrow' in node) {
    node.layoutGrow = spec.layoutGrow;
  }
  if (spec.layoutAlign != null && 'layoutAlign' in node) {
    node.layoutAlign = spec.layoutAlign;
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
