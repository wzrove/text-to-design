import type { SerializedNode, SerializedNodeType } from 'text-to-design-shared';

export const MAX_SERIALIZE_DEPTH = 2;

function rgbToHex(c: { r: number; g: number; b: number }): string {
  return `#${[c.r, c.g, c.b]
    .map((v) => {
      const s = Math.round(v * 255).toString(16);
      return s.length < 2 ? `0${s}` : s;
    })
    .join('')}`;
}

function isMixed(v: unknown): boolean {
  return typeof v === 'string' && (v as string) === 'figma.mixed';
}

function rgba2hex(c: { r: number; g: number; b: number; a: number }): string {
  const hex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}${hex(c.a)}`;
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
  if ('locked' in node && node.locked) base.locked = true;
  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === 'SOLID') {
      base.fill = rgbToHex(fill.color);
    } else if (fill.type === 'GRADIENT_LINEAR') {
      const stops = fill.gradientStops;
      base.gradient = {
        type: 'GRADIENT_LINEAR',
        stops: stops.map(
          (s: {
            color: { r: number; g: number; b: number };
            position: number;
          }) => ({
            color: rgbToHex(s.color),
            position: s.position,
          }),
        ),
      };
    }
  }
  if (
    'strokes' in node &&
    Array.isArray(node.strokes) &&
    node.strokes.length > 0
  ) {
    const stroke = node.strokes[0];
    if (stroke.type === 'SOLID') {
      base.stroke = rgbToHex(stroke.color);
    }
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
    base.blendMode = node.blendMode;
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
  if ('effects' in node && Array.isArray(node.effects)) {
    const shadow = node.effects.find(
      (e) => e.type === 'DROP_SHADOW' && e.visible,
    );
    if (shadow && shadow.type === 'DROP_SHADOW') {
      base.shadow = {
        x: shadow.offset.x,
        y: shadow.offset.y,
        radius: shadow.radius,
        color: rgbToHex(shadow.color),
      };
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
    base.radiusTopLeft =
      typeof r.topLeftRadius === 'number' ? r.topLeftRadius : undefined;
    base.radiusTopRight =
      typeof r.topRightRadius === 'number' ? r.topRightRadius : undefined;
    base.radiusBottomLeft =
      typeof r.bottomLeftRadius === 'number' ? r.bottomLeftRadius : undefined;
    base.radiusBottomRight =
      typeof r.bottomRightRadius === 'number' ? r.bottomRightRadius : undefined;
  }
  if ('pointCount' in node) {
    base.pointCount = (node as PolygonNode).pointCount;
  }
  if (node.type === 'VECTOR') {
    base.vectorPaths = (node as VectorNode).vectorPaths.map((p) => ({
      data: p.data,
      windingRule: p.windingRule,
    }));
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
  if (node.type === 'TEXT') {
    base.characters = node.characters;
    if (!isMixed(node.fontSize)) base.fontSize = node.fontSize as number;
    const f = node.fontName as FontName | undefined;
    if (f?.family) base.fontFamily = f.family;
    if (f?.style && f.style !== 'Regular') base.fontWeight = f.style;
    if (node.textAlignVertical !== 'TOP' && !isMixed(node.textAlignVertical))
      base.textAlignVertical = node.textAlignVertical;
    if (node.textAutoResize !== 'NONE')
      base.textAutoResize = node.textAutoResize;
    if (node.textCase !== 'ORIGINAL' && !isMixed(node.textCase))
      base.textCase = node.textCase as SerializedNode['textCase'];
    if (node.textDecoration !== 'NONE' && !isMixed(node.textDecoration))
      base.textDecoration =
        node.textDecoration as SerializedNode['textDecoration'];
  }
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    const frame = node as FrameNode;
    const pTop = isMixed(frame.paddingTop) ? undefined : frame.paddingTop;
    const pRight = isMixed(frame.paddingRight) ? undefined : frame.paddingRight;
    const pBottom = isMixed(frame.paddingBottom)
      ? undefined
      : frame.paddingBottom;
    const pLeft = isMixed(frame.paddingLeft) ? undefined : frame.paddingLeft;
    base.layout = {
      mode: node.layoutMode,
      itemSpacing: isMixed(node.itemSpacing) ? undefined : node.itemSpacing,
      padding: pTop,
    };
    if (pTop != null && pTop === pRight && pTop === pBottom && pTop === pLeft) {
      base.layout.padding = pTop;
    } else {
      base.layout.paddingTop = pTop;
      base.layout.paddingRight = pRight;
      base.layout.paddingBottom = pBottom;
      base.layout.paddingLeft = pLeft;
    }
    if (frame.primaryAxisSizingMode != null)
      base.layout.primaryAxisSizingMode = frame.primaryAxisSizingMode;
    if (frame.counterAxisSizingMode != null)
      base.layout.counterAxisSizingMode = frame.counterAxisSizingMode;
    if (frame.primaryAxisAlignItems != null)
      base.layout.primaryAxisAlignItems = frame.primaryAxisAlignItems;
    if (frame.counterAxisAlignItems != null)
      base.layout.counterAxisAlignItems = frame.counterAxisAlignItems;
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
      if (g.alignment != null) out.alignment = g.alignment;
      if (g.gutterSize != null) out.gutterSize = g.gutterSize;
      if (g.count != null && Number.isFinite(g.count)) out.count = g.count;
      if (g.sectionSize != null) out.sectionSize = g.sectionSize;
      if (g.offset != null) out.offset = g.offset;
      if (g.visible != null) out.visible = g.visible;
      if (g.color != null) out.color = rgba2hex(g.color);
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
