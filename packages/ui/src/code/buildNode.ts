import { hex2rgba, paint } from './color';
import { gradientPaint, makeShadowEffect } from './style';
import type { Spec } from './types';
import { loadFont } from './utils';

async function buildNode(
  spec: Spec,
  parent: BaseNode & ChildrenMixin,
): Promise<SceneNode> {
  const op = spec.op ?? 'frame';
  let node: SceneNode;
  switch (op) {
    case 'text':
      node = jsDesign.createText();
      break;
    case 'rect':
      node = jsDesign.createRectangle();
      break;
    case 'ellipse':
      node = jsDesign.createEllipse();
      break;
    case 'line':
      node = jsDesign.createLine();
      break;
    case 'polygon':
      node = jsDesign.createPolygon();
      break;
    case 'star':
      node = jsDesign.createStar();
      break;
    case 'vector':
      node = jsDesign.createVector();
      break;
    case 'boolean': {
      const children = spec.children ?? [];
      if (children.length < 2) {
        throw new Error('boolean op 至少需要 2 个子节点');
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
      node = combine[spec.booleanType ?? 'UNION']([...tmp.children], parent);
      tmp.remove();
      break;
    }
    default:
      node = jsDesign.createFrame();
  }

  node.name = spec.name ?? 'node';
  node.x = spec.x ?? 0;
  node.y = spec.y ?? 0;

  if (spec.w != null && 'resize' in node)
    node.resize(spec.w, spec.h ?? node.height);
  if (spec.rotation != null) node.rotation = spec.rotation;
  if (spec.opacity != null && 'opacity' in node) node.opacity = spec.opacity;
  if (spec.locked != null) node.locked = spec.locked;

  if (spec.fill && 'fills' in node) node.fills = gradientPaint(spec);
  else if (spec.gradient && 'fills' in node) node.fills = gradientPaint(spec);

  if (spec.stroke && 'strokes' in node) node.strokes = paint(spec.stroke);
  if (spec.strokeWeight != null && 'strokeWeight' in node)
    node.strokeWeight = spec.strokeWeight;
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
    node.layoutGrids = spec.layoutGrids.map((g) => ({
      pattern: g.pattern,
      alignment: g.alignment,
      gutterSize: g.gutterSize,
      count: g.count,
      sectionSize: g.sectionSize,
      offset: g.offset,
      visible: g.visible,
      color: g.color != null ? hex2rgba(g.color, g.colorOpacity) : undefined,
    })) as LayoutGrid[];

  if (spec.shadow && 'effects' in node)
    node.effects = makeShadowEffect(spec.shadow);

  if ('cornerRadius' in node) {
    if (spec.radius != null) node.cornerRadius = spec.radius;
    if (spec.radiusTopLeft != null) node.cornerRadius = spec.radiusTopLeft;
    if ('topLeftRadius' in node) {
      const r = node as RectangleNode;
      if (spec.radiusTopLeft != null) r.topLeftRadius = spec.radiusTopLeft;
      if (spec.radiusTopRight != null) r.topRightRadius = spec.radiusTopRight;
      if (spec.radiusBottomLeft != null)
        r.bottomLeftRadius = spec.radiusBottomLeft;
      if (spec.radiusBottomRight != null)
        r.bottomRightRadius = spec.radiusBottomRight;
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
    const family = spec.fontFamily ?? 'PingFang SC';
    const style =
      spec.fontWeight != null && spec.fontWeight >= 600 ? 'Bold' : 'Regular';
    if (textNode.fontName !== jsDesign.mixed) {
      await loadFont(family, style);
      textNode.fontName = { family, style };
    }
    textNode.characters = spec.characters ?? 'text';
    textNode.fontSize = spec.fontSize ?? 16;
    if (spec.textAlign != null) {
      textNode.textAlignHorizontal =
        spec.textAlign.toUpperCase() as TextNode['textAlignHorizontal'];
    }
    if (spec.textAlignVertical != null)
      textNode.textAlignVertical =
        spec.textAlignVertical.toUpperCase() as TextNode['textAlignVertical'];
    if (spec.textAutoResize != null)
      textNode.textAutoResize = spec.textAutoResize;
    if (spec.textCase != null) textNode.textCase = spec.textCase;
    if (spec.textDecoration != null)
      textNode.textDecoration = spec.textDecoration;
    if (spec.lineHeight != null)
      textNode.lineHeight = { value: spec.lineHeight, unit: 'PIXELS' };
    if (spec.letterSpacing != null)
      textNode.letterSpacing = { value: spec.letterSpacing, unit: 'PIXELS' };
  }

  parent.appendChild(node);
  if (spec.op === 'boolean') {
    return node;
  }
  if (node.type === 'VECTOR' && spec.paths != null) {
    const list = Array.isArray(spec.paths) ? spec.paths : [spec.paths];
    (node as VectorNode).vectorPaths = list.map((p) =>
      typeof p === 'string'
        ? { windingRule: 'NONZERO', data: p }
        : { windingRule: p.windingRule ?? 'NONZERO', data: p.data },
    );
  }
  for (const child of spec.children ?? []) {
    await buildNode(child, node as unknown as BaseNode & ChildrenMixin);
  }

  if (node.type === 'FRAME' && spec.layout && 'layoutMode' in node) {
    const frame = node as FrameNode;
    const lay = spec.layout;
    frame.layoutMode = lay.mode === 'HORIZONTAL' ? 'HORIZONTAL' : 'VERTICAL';
    frame.itemSpacing = lay.itemSpacing ?? 0;
    if (lay.primaryAxisSizingMode != null)
      frame.primaryAxisSizingMode = lay.primaryAxisSizingMode;
    if (lay.counterAxisSizingMode != null)
      frame.counterAxisSizingMode = lay.counterAxisSizingMode;
    if (lay.primaryAxisAlignItems != null)
      frame.primaryAxisAlignItems = lay.primaryAxisAlignItems;
    if (lay.counterAxisAlignItems != null)
      frame.counterAxisAlignItems = lay.counterAxisAlignItems;
    if (lay.padding != null) {
      frame.paddingTop =
        frame.paddingRight =
        frame.paddingBottom =
        frame.paddingLeft =
          lay.padding;
    }
    if (lay.paddingTop != null) frame.paddingTop = lay.paddingTop;
    if (lay.paddingRight != null) frame.paddingRight = lay.paddingRight;
    if (lay.paddingBottom != null) frame.paddingBottom = lay.paddingBottom;
    if (lay.paddingLeft != null) frame.paddingLeft = lay.paddingLeft;
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
