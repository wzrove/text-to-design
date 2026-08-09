import type { SerializedNode, UpdateNodeProps } from 'text-to-design-shared';
import { serializeNode } from './serialize';
import { collectTargets, findNode, loadFont } from './utils';

async function applyProps(
  node: SceneNode,
  props: UpdateNodeProps,
): Promise<void> {
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
    if ('resize' in node) node.resize(w, h);
  }
  if (props.fills != null && 'fills' in node)
    node.fills = props.fills as Paint[];
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
  if (props.strokes != null && 'strokes' in node)
    node.strokes = props.strokes as Paint[];
  if (props.strokeAlign != null && 'strokeAlign' in node)
    node.strokeAlign = props.strokeAlign;
  if (props.strokeCap != null && 'strokeCap' in node)
    node.strokeCap = props.strokeCap;
  if (props.strokeJoin != null && 'strokeJoin' in node)
    node.strokeJoin = props.strokeJoin;
  if (props.dashPattern != null && 'dashPattern' in node)
    node.dashPattern = props.dashPattern;
  if (props.blendMode != null && 'blendMode' in node)
    node.blendMode = props.blendMode as BlendMode;
  if (props.cornerSmoothing != null && 'cornerSmoothing' in node)
    node.cornerSmoothing = props.cornerSmoothing;
  if (props.clipsContent != null && 'clipsContent' in node)
    node.clipsContent = props.clipsContent;
  if (props.constraints != null && 'constraints' in node)
    node.constraints = props.constraints;
  if (props.layoutGrids != null && 'layoutGrids' in node)
    node.layoutGrids = props.layoutGrids as LayoutGrid[];
  if (node.type === 'ELLIPSE' && props.arcData != null && 'arcData' in node) {
    const arc = props.arcData;
    (node as EllipseNode).arcData = {
      startingAngle: arc.startingAngle,
      endingAngle: arc.endingAngle,
      innerRadius: arc.innerRadius,
    };
  }
  if (props.effects != null && 'effects' in node)
    node.effects = props.effects as Effect[];

  if (props.cornerRadius != null && 'cornerRadius' in node)
    node.cornerRadius = props.cornerRadius;
  if ('topLeftRadius' in node) {
    const r = node as RectangleNode;
    if (props.topLeftRadius != null) r.topLeftRadius = props.topLeftRadius;
    if (props.topRightRadius != null) r.topRightRadius = props.topRightRadius;
    if (props.bottomLeftRadius != null)
      r.bottomLeftRadius = props.bottomLeftRadius;
    if (props.bottomRightRadius != null)
      r.bottomRightRadius = props.bottomRightRadius;
  }

  if (
    props.pointCount != null &&
    (node.type === 'POLYGON' || node.type === 'STAR')
  ) {
    (node as PolygonNode).pointCount = props.pointCount;
  }
  if (node.type === 'STAR' && props.innerRadius != null) {
    (node as StarNode).innerRadius = props.innerRadius;
  }

  if (node.type === 'TEXT') {
    const text = node as TextNode;
    const needLoad =
      props.characters != null ||
      props.fontSize != null ||
      props.fontName != null;
    if (needLoad) {
      const family =
        props.fontName?.family ??
        (text.fontName as FontName).family ??
        'PingFang SC';
      const style =
        props.fontName?.style ?? (text.fontName as FontName).style ?? 'Regular';
      if (text.fontName !== jsDesign.mixed) {
        await loadFont(family, style);
        text.fontName = { family, style };
      }
    }
    if (props.characters != null) text.characters = props.characters;
    if (props.fontSize != null) text.fontSize = props.fontSize;
    if (props.textAlignHorizontal != null)
      text.textAlignHorizontal = props.textAlignHorizontal;
    if (props.textAlignVertical != null)
      text.textAlignVertical = props.textAlignVertical;
    if (props.textAutoResize != null)
      text.textAutoResize = props.textAutoResize;
    if (props.textCase != null) text.textCase = props.textCase;
    if (props.textDecoration != null)
      text.textDecoration = props.textDecoration;
    if (props.lineHeight != null)
      text.lineHeight = props.lineHeight as unknown as LineHeight;
    if (props.letterSpacing != null)
      text.letterSpacing = props.letterSpacing as unknown as LetterSpacing;
  }

  if (
    node.type === 'FRAME' &&
    props.layoutMode != null &&
    'layoutMode' in node
  ) {
    const frame = node as FrameNode;
    frame.layoutMode = props.layoutMode;
  }
  if (
    node.type === 'FRAME' &&
    props.itemSpacing != null &&
    'itemSpacing' in node
  ) {
    (node as FrameNode).itemSpacing = props.itemSpacing;
  }
  if (node.type === 'FRAME' && props.paddingTop != null)
    (node as FrameNode).paddingTop = props.paddingTop;
  if (node.type === 'FRAME' && props.paddingRight != null)
    (node as FrameNode).paddingRight = props.paddingRight;
  if (node.type === 'FRAME' && props.paddingBottom != null)
    (node as FrameNode).paddingBottom = props.paddingBottom;
  if (node.type === 'FRAME' && props.paddingLeft != null)
    (node as FrameNode).paddingLeft = props.paddingLeft;
  if (
    node.type === 'FRAME' &&
    props.primaryAxisSizingMode != null &&
    'primaryAxisSizingMode' in node
  ) {
    (node as FrameNode).primaryAxisSizingMode = props.primaryAxisSizingMode;
  }
  if (
    node.type === 'FRAME' &&
    props.counterAxisSizingMode != null &&
    'counterAxisSizingMode' in node
  ) {
    (node as FrameNode).counterAxisSizingMode = props.counterAxisSizingMode;
  }
  if (
    node.type === 'FRAME' &&
    props.primaryAxisAlignItems != null &&
    'primaryAxisAlignItems' in node
  ) {
    (node as FrameNode).primaryAxisAlignItems = props.primaryAxisAlignItems;
  }
  if (
    node.type === 'FRAME' &&
    props.counterAxisAlignItems != null &&
    'counterAxisAlignItems' in node
  ) {
    (node as FrameNode).counterAxisAlignItems = props.counterAxisAlignItems;
  }
  if (props.layoutGrow != null && 'layoutGrow' in node) {
    (node as SceneNode).layoutGrow = props.layoutGrow;
  }
  if (props.layoutAlign != null && 'layoutAlign' in node) {
    (node as SceneNode).layoutAlign = props.layoutAlign;
  }
}

export async function updateSelection(params: {
  ids?: string[];
  matchName?: string;
  recursive?: boolean;
  props: UpdateNodeProps;
}): Promise<{ updated: SerializedNode[] }> {
  const props = params.props ?? {};
  let base: readonly SceneNode[];
  if (params.ids != null && params.ids.length > 0) {
    base = findNode(params.ids);
  } else {
    base = jsDesign.currentPage.selection;
  }
  if (base.length === 0) {
    throw new Error('没有可修改的节点: 请先选中节点,或传入有效的 ids');
  }
  const targets = collectTargets(
    base,
    params.matchName,
    params.recursive ?? false,
  );
  if (targets.length === 0) {
    throw new Error(`没有命中 matchName="${params.matchName}" 的节点`);
  }
  for (const node of targets) {
    await applyProps(node, props);
  }
  return { updated: targets.map((n) => serializeNode(n)) };
}
