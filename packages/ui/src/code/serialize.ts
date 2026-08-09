import type {
  Paint,
  SerializedNode,
  SerializedNodeType,
  LetterSpacing as WireLetterSpacing,
  VectorPath as WireVectorPath,
} from 'text-to-design-shared';

export const MAX_SERIALIZE_DEPTH = 2;

function isMixed(v: unknown): boolean {
  return typeof v === 'string' && (v as string) === 'figma.mixed';
}

export function trySerialize(
  node: SceneNode,
  depth: number = MAX_SERIALIZE_DEPTH,
): SerializedNode | null {
  try {
    return serializeNode(node, depth);
  } catch {
    return null;
  }
}

export function serializeNode(
  node: SceneNode,
  depth: number = MAX_SERIALIZE_DEPTH,
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
    const p = node.parent as SceneNode;
    if ('id' in p) base.parentId = p.id;
  }

  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    base.fills = (node.fills as Paint[]).map((f) => {
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
    base.strokes = (node.strokes as Paint[]).map((s) => {
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
    const sa = (node as SceneNode & { strokeAlign: string }).strokeAlign;
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
  if (
    'dashPattern' in node &&
    (node as { dashPattern?: readonly number[] }).dashPattern?.length
  )
    base.dashPattern = [
      ...(node as unknown as { dashPattern: readonly number[] }).dashPattern,
    ];
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
  if ('constraints' in node) {
    const c = node.constraints;
    if (c.horizontal !== 'MIN' || c.vertical !== 'MIN')
      base.constraints = { horizontal: c.horizontal, vertical: c.vertical };
  }
  if ('clipsContent' in node && node.type === 'FRAME' && node.clipsContent)
    base.clipsContent = true;
  if (node.type === 'ELLIPSE' && 'arcData' in node) {
    const arc = (node as EllipseNode).arcData;
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
    const r = node as RectangleNode;
    base.topLeftRadius =
      typeof r.topLeftRadius === 'number' ? r.topLeftRadius : undefined;
    base.topRightRadius =
      typeof r.topRightRadius === 'number' ? r.topRightRadius : undefined;
    base.bottomLeftRadius =
      typeof r.bottomLeftRadius === 'number' ? r.bottomLeftRadius : undefined;
    base.bottomRightRadius =
      typeof r.bottomRightRadius === 'number' ? r.bottomRightRadius : undefined;
  }
  if ('pointCount' in node) {
    base.pointCount = (node as PolygonNode).pointCount;
  }
  if (node.type === 'STAR' && 'innerRadius' in node) {
    base.innerRadius = (node as StarNode).innerRadius;
  }
  if (node.type === 'VECTOR') {
    base.vectorPaths = (node as VectorNode).vectorPaths.map((p) => ({
      data: p.data,
      windingRule: p.windingRule === 'NONE' ? undefined : p.windingRule,
    })) as unknown as WireVectorPath[];
  }
  if ('variantProperties' in node && node.variantProperties != null) {
    base.variantProperties = { ...(node as InstanceNode).variantProperties };
  }
  if (node.type === 'INSTANCE') {
    base.mainComponentId = (node as InstanceNode).mainComponent?.id;
  }
  if (node.type === 'COMPONENT_SET') {
    const set = node as ComponentSetNode;
    base.variantGroupProperties = Object.fromEntries(
      Object.entries(set.variantGroupProperties).map(([k, v]) => [
        k,
        [...v.values],
      ]),
    );
  }
  if (node.type === 'BOOLEAN_OPERATION') {
    base.booleanOperation = (node as BooleanOperationNode).booleanOperation;
  }
  if ('isMask' in node && (node as SceneNode & { isMask?: boolean }).isMask) {
    base.isMask = true;
  }
  if (node.type === 'TEXT') {
    base.characters = node.characters;
    if (!isMixed(node.fontSize)) base.fontSize = node.fontSize as number;
    const f = node.fontName as FontName | undefined;
    if (f?.family) base.fontName = { family: f.family, style: f.style };
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
      base.lineHeight = node.lineHeight as LineHeight;
    if (!isMixed(node.letterSpacing)) {
      const ls = node.letterSpacing as LetterSpacing;
      if (ls.unit === 'PIXELS')
        base.letterSpacing = ls as unknown as WireLetterSpacing;
    }
  }
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    const frame = node as FrameNode;
    base.layoutMode = node.layoutMode;
    base.itemSpacing = isMixed(frame.itemSpacing)
      ? undefined
      : frame.itemSpacing;
    const pTop = isMixed(frame.paddingTop) ? undefined : frame.paddingTop;
    const pRight = isMixed(frame.paddingRight) ? undefined : frame.paddingRight;
    const pBottom = isMixed(frame.paddingBottom)
      ? undefined
      : frame.paddingBottom;
    const pLeft = isMixed(frame.paddingLeft) ? undefined : frame.paddingLeft;
    base.paddingTop = pTop;
    base.paddingRight = pRight;
    base.paddingBottom = pBottom;
    base.paddingLeft = pLeft;
    if (frame.primaryAxisSizingMode != null)
      base.primaryAxisSizingMode = frame.primaryAxisSizingMode;
    if (frame.counterAxisSizingMode != null)
      base.counterAxisSizingMode = frame.counterAxisSizingMode;
    if (frame.primaryAxisAlignItems != null)
      base.primaryAxisAlignItems = frame.primaryAxisAlignItems;
    if (frame.counterAxisAlignItems != null)
      base.counterAxisAlignItems = frame.counterAxisAlignItems;
  }
  if (
    'layoutGrids' in node &&
    node.layoutGrids != null &&
    node.layoutGrids.length > 0
  ) {
    base.layoutGrids = node.layoutGrids.map((raw) => {
      const g = raw as {
        pattern: 'ROWS' | 'COLUMNS' | 'GRID';
        alignment?: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER';
        gutterSize?: number;
        count?: number;
        sectionSize?: number;
        offset?: number;
        visible?: boolean;
        color?: RGBA;
      };
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
        base.children = kids.map((c) =>
          serializeNode(c as SceneNode, depth - 1),
        );
      } else {
        base.childCount = kids.length;
      }
    }
  }
  return base;
}
