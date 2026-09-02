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
import {
  blendModeSchema,
  constraintTypeSchema,
  effectSchema,
  fontNameSchema,
  layoutGridSchema,
  letterSpacingSchema,
  lineHeightSchema,
  paintSchema,
  vectorPathSchema,
} from './base';
import type { NodeType } from './node-type';
import { nodeTypeSchema } from './node-type';
import type { ComponentPropertyValue } from './platform';
import { componentPropertyValueSchema } from './platform';

// ---- 序列化节点 (read 侧) ----
export interface SerializedNode {
  id: string;
  name: string;
  type: NodeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  parentId?: string;
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
  cornerSmoothing?: number;
  blendMode?: BlendMode;
  constraints?: { horizontal: ConstraintType; vertical: ConstraintType };
  layoutGrids?: LayoutGrid[];
  clipsContent?: boolean;
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number };
  effects?: Effect[];
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  pointCount?: number;
  innerRadius?: number;
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
  childCount?: number;
  children?: SerializedNode[];
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
  vectorPaths?: VectorPath[];
  booleanOperation?: 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';
  isMask?: boolean;
  variantProperties?: Record<string, string>;
  mainComponentId?: string;
  variantGroupProperties?: Record<string, string[]>;
  /** 平台特有字段(仅对应平台运行时存在,如 Figma;其他平台恒缺省) */
  textTruncation?: 'DISABLED' | 'ENDING';
  maxLines?: number;
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
  componentProperties?: Record<string, ComponentPropertyValue>;
}

export const serializedNodeSchema: z.ZodType<SerializedNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    type: nodeTypeSchema,
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
    rotation: z.number().optional(),
    opacity: z.number().optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
    parentId: z.string().optional(),
    fills: z.array(paintSchema).optional(),
    strokes: z.array(paintSchema).optional(),
    strokeWeight: z.number().optional(),
    strokeTopWeight: z.number().optional(),
    strokeBottomWeight: z.number().optional(),
    strokeLeftWeight: z.number().optional(),
    strokeRightWeight: z.number().optional(),
    strokeAlign: z.enum(['CENTER', 'INSIDE', 'OUTSIDE']).optional(),
    strokeCap: z
      .enum(['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL'])
      .optional(),
    strokeJoin: z.enum(['MITER', 'BEVEL', 'ROUND']).optional(),
    dashPattern: z.array(z.number()).optional(),
    cornerSmoothing: z.number().optional(),
    blendMode: blendModeSchema.optional(),
    constraints: z
      .object({
        horizontal: constraintTypeSchema,
        vertical: constraintTypeSchema,
      })
      .optional(),
    layoutGrids: z.array(layoutGridSchema).optional(),
    clipsContent: z.boolean().optional(),
    arcData: z
      .object({
        startingAngle: z.number(),
        endingAngle: z.number(),
        innerRadius: z.number(),
      })
      .optional(),
    effects: z.array(effectSchema).optional(),
    cornerRadius: z.number().optional(),
    topLeftRadius: z.number().optional(),
    topRightRadius: z.number().optional(),
    bottomLeftRadius: z.number().optional(),
    bottomRightRadius: z.number().optional(),
    pointCount: z.number().optional(),
    innerRadius: z.number().optional(),
    layoutMode: z.enum(['NONE', 'HORIZONTAL', 'VERTICAL']).optional(),
    itemSpacing: z.number().optional(),
    paddingTop: z.number().optional(),
    paddingRight: z.number().optional(),
    paddingBottom: z.number().optional(),
    paddingLeft: z.number().optional(),
    primaryAxisSizingMode: z.enum(['FIXED', 'AUTO']).optional(),
    counterAxisSizingMode: z.enum(['FIXED', 'AUTO']).optional(),
    primaryAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
      .optional(),
    counterAxisAlignItems: z.enum(['MIN', 'MAX', 'CENTER']).optional(),
    layoutGrow: z.number().optional(),
    layoutAlign: z
      .enum(['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'])
      .optional(),
    childCount: z.number().optional(),
    children: z.array(serializedNodeSchema).optional(),
    characters: z.string().optional(),
    fontSize: z.number().optional(),
    fontName: fontNameSchema.optional(),
    textAlignHorizontal: z
      .enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'])
      .optional(),
    textAlignVertical: z.enum(['TOP', 'CENTER', 'BOTTOM']).optional(),
    textAutoResize: z
      .enum(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'])
      .optional(),
    textCase: z.enum(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE']).optional(),
    textDecoration: z.enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH']).optional(),
    lineHeight: lineHeightSchema.optional(),
    letterSpacing: letterSpacingSchema.optional(),
    vectorPaths: z.array(vectorPathSchema).optional(),
    booleanOperation: z
      .enum(['UNION', 'SUBTRACT', 'INTERSECT', 'EXCLUDE'])
      .optional(),
    isMask: z.boolean().optional(),
    variantProperties: z.record(z.string(), z.string()).optional(),
    mainComponentId: z.string().optional(),
    variantGroupProperties: z
      .record(z.string(), z.array(z.string()))
      .optional(),
    textTruncation: z.enum(['DISABLED', 'ENDING']).optional(),
    maxLines: z.number().optional(),
    fillStyleId: z.string().optional(),
    strokeStyleId: z.string().optional(),
    textStyleId: z.string().optional(),
    effectStyleId: z.string().optional(),
    componentProperties: z
      .record(z.string(), componentPropertyValueSchema)
      .optional(),
  }),
);
