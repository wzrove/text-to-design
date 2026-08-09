import type { ExecuteOp } from 'text-to-design-shared';
import { loadFont } from './utils';

async function buildNode(
  spec: ExecuteOp,
  parent: BaseNode & ChildrenMixin,
): Promise<SceneNode> {
  const type = spec.type;
  let node: SceneNode;
  switch (type) {
    case 'TEXT':
      node = jsDesign.createText();
      break;
    case 'RECTANGLE':
      node = jsDesign.createRectangle();
      break;
    case 'ELLIPSE':
      node = jsDesign.createEllipse();
      break;
    case 'LINE':
      node = jsDesign.createLine();
      break;
    case 'POLYGON':
      node = jsDesign.createPolygon();
      break;
    case 'STAR':
      node = jsDesign.createStar();
      break;
    case 'VECTOR':
      node = jsDesign.createVector();
      break;
    case 'BOOLEAN_OPERATION': {
      const children = spec.children ?? [];
      if (children.length < 2) {
        throw new Error('BOOLEAN_OPERATION 至少需要 2 个子节点');
      }
      const tmp = jsDesign.createFrame();
      parent.appendChild(tmp);
      for (const child of children) {
        await buildNode(child, tmp);
      }
      const combine: Record<
        string,
        (
          nodes: ReadonlyArray<BaseNode>,
          parent: BaseNode & ChildrenMixin,
        ) => BooleanOperationNode
      > = {
        UNION: jsDesign.union,
        SUBTRACT: jsDesign.subtract,
        INTERSECT: jsDesign.intersect,
        EXCLUDE: jsDesign.exclude,
      };
      node = combine[spec.booleanOperation ?? 'UNION']([...tmp.children], parent);
      tmp.remove();
      break;
    }
    case 'GROUP': {
      const children = spec.children ?? [];
      if (children.length < 2) {
        throw new Error('GROUP 至少需要 2 个子节点');
      }
      const tmp = jsDesign.createFrame();
      parent.appendChild(tmp);
      for (const child of children) {
        await buildNode(child, tmp);
      }
      node = tmp;
      break;
    }
    case 'FRAME':
    default:
      node = jsDesign.createFrame();
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

  if (spec.fills && 'fills' in node) node.fills = spec.fills as Paint[];
  if (spec.strokes && 'strokes' in node)
    node.strokes = spec.strokes as Paint[];

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
    node.blendMode = spec.blendMode as BlendMode;
  if (spec.cornerSmoothing != null && 'cornerSmoothing' in node)
    node.cornerSmoothing = spec.cornerSmoothing;
  if (spec.constraints != null && 'constraints' in node)
    node.constraints = spec.constraints;
  if (spec.clipsContent != null && 'clipsContent' in node)
    node.clipsContent = spec.clipsContent;
  if (spec.layoutGrids != null && 'layoutGrids' in node)
    node.layoutGrids = spec.layoutGrids as LayoutGrid[];

  if (spec.effects && 'effects' in node) node.effects = spec.effects as Effect[];

  if ('cornerRadius' in node) {
    if (spec.cornerRadius != null) node.cornerRadius = spec.cornerRadius;
    if ('topLeftRadius' in node) {
      const r = node as RectangleNode;
      if (spec.topLeftRadius != null) r.topLeftRadius = spec.topLeftRadius;
      if (spec.topRightRadius != null) r.topRightRadius = spec.topRightRadius;
      if (spec.bottomLeftRadius != null)
        r.bottomLeftRadius = spec.bottomLeftRadius;
      if (spec.bottomRightRadius != null)
        r.bottomRightRadius = spec.bottomRightRadius;
    }
  }

  if (
    (node.type === 'POLYGON' || node.type === 'STAR') &&
    spec.pointCount != null
  ) {
    (node as PolygonNode).pointCount = spec.pointCount;
  }
  if (node.type === 'STAR' && spec.innerRadius != null) {
    (node as StarNode).innerRadius = spec.innerRadius;
  }
  if (node.type === 'ELLIPSE' && spec.arcData != null && 'arcData' in node) {
    const arc = spec.arcData;
    (node as EllipseNode).arcData = {
      startingAngle: arc.startingAngle,
      endingAngle: arc.endingAngle,
      innerRadius: arc.innerRadius,
    };
  }

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    if (spec.fontName && textNode.fontName !== jsDesign.mixed) {
      await loadFont(spec.fontName.family, spec.fontName.style);
      textNode.fontName = spec.fontName;
    }
    textNode.characters = spec.characters ?? 'text';
    textNode.fontSize = spec.fontSize ?? 16;
    if (spec.textAlignHorizontal != null)
      textNode.textAlignHorizontal = spec.textAlignHorizontal;
    if (spec.textAlignVertical != null)
      textNode.textAlignVertical = spec.textAlignVertical;
    if (spec.textAutoResize != null)
      textNode.textAutoResize = spec.textAutoResize;
    if (spec.textCase != null) textNode.textCase = spec.textCase;
    if (spec.textDecoration != null)
      textNode.textDecoration = spec.textDecoration;
  if (spec.lineHeight != null)
    textNode.lineHeight = spec.lineHeight as unknown as LineHeight;
  if (spec.letterSpacing != null)
    textNode.letterSpacing = spec.letterSpacing as unknown as LetterSpacing;
  }

  parent.appendChild(node);
  if (spec.type === 'BOOLEAN_OPERATION') {
    return node;
  }
  if (node.type === 'VECTOR' && spec.vectorPaths != null) {
    (node as VectorNode).vectorPaths = spec.vectorPaths as VectorPath[];
  }
  for (const child of spec.children ?? []) {
    await buildNode(child, node as unknown as BaseNode & ChildrenMixin);
  }

  if (node.type === 'FRAME' && spec.layoutMode != null && 'layoutMode' in node) {
    const frame = node as FrameNode;
    frame.layoutMode = spec.layoutMode;
    frame.itemSpacing = spec.itemSpacing ?? 0;
    if (spec.primaryAxisSizingMode != null)
      frame.primaryAxisSizingMode = spec.primaryAxisSizingMode;
    if (spec.counterAxisSizingMode != null)
      frame.counterAxisSizingMode = spec.counterAxisSizingMode;
    if (spec.primaryAxisAlignItems != null)
      frame.primaryAxisAlignItems = spec.primaryAxisAlignItems;
    if (spec.counterAxisAlignItems != null)
      frame.counterAxisAlignItems = spec.counterAxisAlignItems;
    if (spec.paddingTop != null) frame.paddingTop = spec.paddingTop;
    if (spec.paddingRight != null) frame.paddingRight = spec.paddingRight;
    if (spec.paddingBottom != null) frame.paddingBottom = spec.paddingBottom;
    if (spec.paddingLeft != null) frame.paddingLeft = spec.paddingLeft;
  }
  if (spec.layoutGrow != null && 'layoutGrow' in node) {
    (node as FrameNode & SceneNode).layoutGrow = spec.layoutGrow;
  }
  if (spec.layoutAlign != null && 'layoutAlign' in node) {
    (node as FrameNode & SceneNode).layoutAlign = spec.layoutAlign;
  }
  return node;
}

export default buildNode;
