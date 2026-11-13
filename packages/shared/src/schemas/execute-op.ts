import { z } from 'zod';

import type { BooleanOperation } from '../dicts/boolean-operation';
import {
  LAYOUT_MODE_VALUES,
  SIZING_MODE_VALUES,
  STROKE_ALIGN_VALUES,
  STROKE_CAP_VALUES,
  STROKE_JOIN_VALUES,
  TEXT_ALIGN_HORIZONTAL_VALUES,
  TEXT_ALIGN_VERTICAL_VALUES,
  TEXT_AUTO_RESIZE_VALUES,
  TEXT_CASE_VALUES,
  TEXT_DECORATION_VALUES,
  TEXT_TRUNCATION_VALUES,
} from '../dicts/enum-values';
import {
  COUNTER_AXIS_ALIGN_VALUES,
  LAYOUT_ALIGN_VALUES,
  PRIMARY_AXIS_ALIGN_VALUES,
} from '../dicts/platform-value-domain';
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

export const pingSchema = z.object({});

export const getSelectionSchema = z.object({
  depth: z.number().optional().describe('schema.executeOp.depth'),
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
  booleanOperation?: BooleanOperation;
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
  strokeAlign?: (typeof STROKE_ALIGN_VALUES)[number];
  strokeCap?: (typeof STROKE_CAP_VALUES)[number];
  strokeJoin?: (typeof STROKE_JOIN_VALUES)[number];
  dashPattern?: number[];
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  characters?: string;
  fontSize?: number;
  fontName?: FontName;
  textAlignHorizontal?: (typeof TEXT_ALIGN_HORIZONTAL_VALUES)[number];
  textAlignVertical?: (typeof TEXT_ALIGN_VERTICAL_VALUES)[number];
  textAutoResize?: (typeof TEXT_AUTO_RESIZE_VALUES)[number];
  textCase?: (typeof TEXT_CASE_VALUES)[number];
  textDecoration?: (typeof TEXT_DECORATION_VALUES)[number];
  lineHeight?: LineHeight;
  letterSpacing?: LetterSpacing;
  layoutMode?: (typeof LAYOUT_MODE_VALUES)[number];
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisSizingMode?: (typeof SIZING_MODE_VALUES)[number];
  counterAxisSizingMode?: (typeof SIZING_MODE_VALUES)[number];
  primaryAxisAlignItems?: (typeof PRIMARY_AXIS_ALIGN_VALUES)[number];
  counterAxisAlignItems?: (typeof COUNTER_AXIS_ALIGN_VALUES)[number];
  layoutGrow?: number;
  layoutAlign?: (typeof LAYOUT_ALIGN_VALUES)[number];
  blendMode?: BlendMode;
  effects?: Effect[];
  constraints?: { horizontal: ConstraintType; vertical: ConstraintType };
  clipsContent?: boolean;
  cornerSmoothing?: number;
  layoutGrids?: LayoutGrid[];
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number };
  /** 平台特有写字段(仅对应平台生效,其他平台被忽略) */
  textTruncation?: (typeof TEXT_TRUNCATION_VALUES)[number];
  maxLines?: number;
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
}