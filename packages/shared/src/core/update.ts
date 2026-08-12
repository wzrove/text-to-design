import type { SerializedNode, UpdateNodeProps } from '../schemas';
import type { DesignHost, NodeSkeleton } from './host';
import { MIXED } from './host';
import { serializeNode } from './serialize';
import { collectTargets, findNode, loadFont } from './utils';

async function applyProps(
  host: DesignHost,
  node: NodeSkeleton,
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
  if (props.fills != null && 'fills' in node) node.fills = props.fills;
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
  if (props.strokes != null && 'strokes' in node) node.strokes = props.strokes;
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
    node.layoutGrids = props.layoutGrids;
  if (node.type === 'ELLIPSE' && props.arcData != null && 'arcData' in node) {
    node.arcData = props.arcData;
  }
  if (props.effects != null && 'effects' in node) node.effects = props.effects;

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

  if (
    props.pointCount != null &&
    (node.type === 'POLYGON' || node.type === 'STAR')
  ) {
    node.pointCount = props.pointCount;
  }
  if (node.type === 'STAR' && props.innerRadius != null) {
    node.innerRadius = props.innerRadius;
  }

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
    node.type === 'FRAME' &&
    props.layoutMode != null &&
    'layoutMode' in node
  ) {
    node.layoutMode = props.layoutMode;
  }
  if (
    node.type === 'FRAME' &&
    props.itemSpacing != null &&
    'itemSpacing' in node
  ) {
    node.itemSpacing = props.itemSpacing;
  }
  if (node.type === 'FRAME' && props.paddingTop != null)
    node.paddingTop = props.paddingTop;
  if (node.type === 'FRAME' && props.paddingRight != null)
    node.paddingRight = props.paddingRight;
  if (node.type === 'FRAME' && props.paddingBottom != null)
    node.paddingBottom = props.paddingBottom;
  if (node.type === 'FRAME' && props.paddingLeft != null)
    node.paddingLeft = props.paddingLeft;
  if (
    node.type === 'FRAME' &&
    props.primaryAxisSizingMode != null &&
    'primaryAxisSizingMode' in node
  ) {
    node.primaryAxisSizingMode = props.primaryAxisSizingMode;
  }
  if (
    node.type === 'FRAME' &&
    props.counterAxisSizingMode != null &&
    'counterAxisSizingMode' in node
  ) {
    node.counterAxisSizingMode = props.counterAxisSizingMode;
  }
  if (
    node.type === 'FRAME' &&
    props.primaryAxisAlignItems != null &&
    'primaryAxisAlignItems' in node
  ) {
    node.primaryAxisAlignItems = props.primaryAxisAlignItems;
  }
  if (
    node.type === 'FRAME' &&
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

export async function updateSelection(
  host: DesignHost,
  params: {
    ids?: string[];
    matchName?: string;
    recursive?: boolean;
    props: UpdateNodeProps;
  },
): Promise<{ updated: SerializedNode[] }> {
  const props = params.props ?? {};
  let base: readonly NodeSkeleton[];
  if (params.ids != null && params.ids.length > 0) {
    base = findNode(host, params.ids);
  } else {
    base = host.currentPage.selection;
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
    await applyProps(host, node, props);
  }
  return { updated: targets.map((n) => serializeNode(n)) };
}
