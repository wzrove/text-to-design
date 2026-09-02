import { z } from 'zod';

import type {
  BlendMode,
  ConstraintType,
  Effect,
  FontName,
  LayoutGrid,
  LetterSpacing,
  LineHeight,
  Paint,
  VectorPath,
} from './base';
import type { NodeType } from './node-type';

// ---- 输入 schema ----

export const pingSchema = z.object({});

export const getSelectionSchema = z.object({
  depth: z
    .number()
    .optional()
    .describe('序列化深度:0=仅自身,1=含直接子节点,2=含孙节点;缺省 2'),
});

// ExecuteOp: 创建指令 (字段对齐 runtime SceneNode 属性)
// 扁平接口供 UI 侧使用(duck-typing 访问)
export interface ExecuteOp {
  type: NodeType;
  name?: string;
  pointCount?: number;
  innerRadius?: number;
  children?: ExecuteOp[];
  vectorPaths?: VectorPath[];
  booleanOperation?: 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';
  isMask?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  fills?: Paint[];
  strokes?: Paint[];
  strokeWeight?: number;
  strokeTopWeight?: number;
  strokeBottomWeight?: number;
  strokeLeftWeight?: number;
  strokeRightWeight?: number;
  strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
  strokeCap?: 'NONE' | 'ROUND' | 'SQUARE' | 'ARROW_LINES' | 'ARROW_EQUILATERAL';
  strokeJoin?: 'MITER' | 'BEVEL' | 'ROUND';
  dashPattern?: number[];
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  characters?: string;
  fontSize?: number;
  fontName?: FontName;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  lineHeight?: LineHeight;
  letterSpacing?: LetterSpacing;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  primaryAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER';
  layoutGrow?: number;
  layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT';
  blendMode?: BlendMode;
  effects?: Effect[];
  constraints?: { horizontal: ConstraintType; vertical: ConstraintType };
  clipsContent?: boolean;
  cornerSmoothing?: number;
  layoutGrids?: LayoutGrid[];
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number };
  /** 平台特有写字段(仅对应平台生效,其他平台被忽略) */
  textTruncation?: 'DISABLED' | 'ENDING';
  maxLines?: number;
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
}
