export interface SpecLayout {
  mode?: 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  primaryAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER';
}

export interface SpecShadow {
  color?: string;
  x?: number;
  y?: number;
  radius?: number;
  spread?: number;
}

export type ConstraintType = 'MIN' | 'MAX' | 'STRETCH' | 'CENTER' | 'SCALE';

export interface SpecLayoutGrid {
  pattern: 'ROWS' | 'COLUMNS' | 'GRID';
  alignment?: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER';
  gutterSize?: number;
  count?: number;
  sectionSize?: number;
  offset?: number;
  visible?: boolean;
  color?: string;
  colorOpacity?: number;
}

export interface SpecGradient {
  stops: { color: string; position: number }[];
  angle?: number;
}

export type SpecVectorPath =
  | string
  | { data: string; windingRule?: 'NONZERO' | 'EVENODD' | 'NONE' };

export interface Spec {
  op?:
    | 'frame'
    | 'rect'
    | 'ellipse'
    | 'line'
    | 'polygon'
    | 'star'
    | 'vector'
    | 'boolean'
    | 'text';
  name?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fill?: string;
  radius?: number;
  radiusTopLeft?: number;
  radiusTopRight?: number;
  radiusBottomLeft?: number;
  radiusBottomRight?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  stroke?: string;
  strokeWeight?: number;
  strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
  strokeCap?: 'NONE' | 'ROUND' | 'SQUARE' | 'ARROW_LINES' | 'ARROW_EQUILATERAL';
  strokeJoin?: 'MITER' | 'BEVEL' | 'ROUND';
  dashPattern?: number[];
  cornerSmoothing?: number;
  blendMode?: string;
  constraints?: { horizontal: ConstraintType; vertical: ConstraintType };
  layoutGrids?: SpecLayoutGrid[];
  clipsContent?: boolean;
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number };
  shadow?: SpecShadow;
  gradient?: SpecGradient;
  pointCount?: number;
  innerRadius?: number;
  /** boolean 专用:合并方式,默认 UNION */
  booleanType?: 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';
  /** vector 专用:SVG path data(单个或数组),如 "M0 0 L100 0 L100 100 Z" */
  paths?: SpecVectorPath | SpecVectorPath[];
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  characters?: string;
  textAlign?: 'left' | 'center' | 'right';
  textAlignVertical?: 'top' | 'center' | 'bottom';
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  lineHeight?: number;
  letterSpacing?: number;
  layout?: SpecLayout;
  layoutGrow?: number;
  layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT';
  children?: Spec[];
}

const OPS = [
  'frame',
  'rect',
  'ellipse',
  'line',
  'polygon',
  'star',
  'vector',
  'boolean',
  'text',
];

function toSpec(raw: unknown): Spec {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(
      `无效的节点指令: 期望对象,收到 ${raw === null ? 'null' : typeof raw}`,
    );
  }
  const spec = raw as Spec;
  if (spec.op !== undefined && OPS.indexOf(spec.op) === -1) {
    throw new Error(
      `无效的 op: "${spec.op}"(支持 frame|rect|ellipse|line|polygon|star|vector|boolean|text)`,
    );
  }
  return spec;
}

export function toSpecs(ops: unknown): Spec[] {
  if (Array.isArray(ops)) {
    if (ops.length === 0) throw new Error('ops 为空数组,无可执行指令');
    return ops.map(toSpec);
  }
  return [toSpec(ops)];
}
