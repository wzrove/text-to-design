import { z } from 'zod';

// ---- 基础类型 (对齐 plugin-typings runtime) ----

export const rgbSchema = z.object({
  r: z
    .number()
    .min(0)
    .max(1)
    .describe('红色通道,范围 0-1(0=无,1=满),如纯红为 1'),
  g: z.number().min(0).max(1).describe('绿色通道,范围 0-1'),
  b: z.number().min(0).max(1).describe('蓝色通道,范围 0-1'),
});
export type RGB = z.infer<typeof rgbSchema>;

export const rgbaSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1),
});
export type RGBA = z.infer<typeof rgbaSchema>;

export const gradientStopSchema = z
  .object({
    color: rgbaSchema,
    position: z.number().min(0).max(1),
  })
  .describe(
    '渐变停止点,如 {color:{r:1,g:0,b:0,a:1}, position:0}(起点红色)和 {color:{r:0,g:0,b:1,a:1}, position:1}(终点蓝色)',
  );
export type GradientStop = z.infer<typeof gradientStopSchema>;

export const transformSchema = z
  .tuple([
    z.tuple([z.number(), z.number(), z.number()]),
    z.tuple([z.number(), z.number(), z.number()]),
  ])
  .describe('变换矩阵,如 [[1,0,0],[0,1,0]] 表示无变换(Identity)');
export type Transform = z.infer<typeof transformSchema>;

// Paint: 填充/描边的统一表示 (对齐 runtime Paint union)
export const paintSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SOLID'),
    color: rgbSchema,
    opacity: z.number().min(0).max(1).optional(),
    visible: z.boolean().optional(),
    blendMode: z.string().optional(),
  }),
  z.object({
    type: z.literal('GRADIENT_LINEAR'),
    gradientStops: z.array(gradientStopSchema),
    gradientTransform: transformSchema,
  }),
  z.object({
    type: z.literal('GRADIENT_RADIAL'),
    gradientStops: z.array(gradientStopSchema),
    gradientTransform: transformSchema,
  }),
  z.object({
    type: z.literal('GRADIENT_ANGULAR'),
    gradientStops: z.array(gradientStopSchema),
    gradientTransform: transformSchema,
  }),
  z.object({
    type: z.literal('IMAGE'),
    imageHash: z.string(),
    scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional(),
  }),
]);
export type Paint = z.infer<typeof paintSchema>;

// 混合模式 (对齐 runtime BlendMode)
export const blendModeSchema = z.enum([
  'PASS_THROUGH',
  'NORMAL',
  'DARKEN',
  'MULTIPLY',
  'COLOR_BURN',
  'LIGHTEN',
  'SCREEN',
  'COLOR_DODGE',
  'OVERLAY',
  'SOFT_LIGHT',
  'HARD_LIGHT',
  'DIFFERENCE',
  'EXCLUSION',
  'HUE',
  'SATURATION',
  'COLOR',
  'LUMINOSITY',
]);
export type BlendMode = z.infer<typeof blendModeSchema>;

// 效果 (对齐 runtime Effect discriminated union)
export const effectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DROP_SHADOW'),
    color: rgbaSchema,
    offset: z.object({ x: z.number(), y: z.number() }),
    radius: z.number().min(0),
    spread: z.number().optional(),
    visible: z.boolean().optional(),
    blendMode: blendModeSchema.default('NORMAL'),
    showShadowBehindNode: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('INNER_SHADOW'),
    color: rgbaSchema,
    offset: z.object({ x: z.number(), y: z.number() }),
    radius: z.number().min(0),
    spread: z.number().optional(),
    visible: z.boolean().optional(),
    blendMode: blendModeSchema.default('NORMAL'),
  }),
  z.object({
    type: z.literal('LAYER_BLUR'),
    radius: z.number().min(0),
    visible: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('BACKGROUND_BLUR'),
    radius: z.number().min(0),
    visible: z.boolean().optional(),
  }),
]);
export type Effect = z.infer<typeof effectSchema>;

// 约束 (对齐 runtime Constraints)
export const constraintTypeSchema = z.enum([
  'MIN',
  'MAX',
  'STRETCH',
  'CENTER',
  'SCALE',
]);
export type ConstraintType = z.infer<typeof constraintTypeSchema>;

// 布局网格 (对齐 runtime LayoutGrid)
export interface LayoutGrid {
  pattern: 'ROWS' | 'COLUMNS' | 'GRID';
  alignment?: 'MIN' | 'MAX' | 'CENTER' | 'STRETCH';
  sectionSize?: number;
  count?: number;
  gutterSize?: number;
  offset?: number;
  visible?: boolean;
  color?: RGBA;
}

export const layoutGridSchema: z.ZodType<LayoutGrid> = z
  .object({
    pattern: z
      .enum(['ROWS', 'COLUMNS', 'GRID'])
      .describe('网格类型:ROWS|COLUMNS|GRID'),
    alignment: z
      .enum(['MIN', 'MAX', 'CENTER', 'STRETCH'])
      .optional()
      .describe('对齐:MIN|MAX|CENTER|STRETCH'),
    sectionSize: z.number().optional().describe('分节尺寸(px)'),
    count: z.number().int().positive().optional().describe('网格数'),
    gutterSize: z.number().optional().describe('沟槽尺寸(px)'),
    offset: z.number().optional().describe('偏移(px)'),
    visible: z.boolean().optional().describe('是否可见'),
    color: rgbaSchema.optional().describe('网格颜色'),
  })
  .superRefine((val, ctx) => {
    if (val.pattern === 'GRID' && val.sectionSize == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pattern 为 GRID 时,sectionSize 为必填项',
        path: ['sectionSize'],
      });
    }
  });

// 矢量路径 (对齐 runtime VectorPath)
export interface VectorPath {
  data: string;
  windingRule?: 'NONZERO' | 'EVENODD';
}

export const vectorPathSchema: z.ZodType<VectorPath> = z.object({
  data: z
    .string()
    .describe(
      'SVG path data,如 "M0 0 L100 0 L100 100 Z"(M=移动到,L=画线到,Z=闭合)',
    ),
  windingRule: z
    .enum(['NONZERO', 'EVENODD'])
    .optional()
    .describe('环绕规则:NONZERO|EVENODD'),
});

// 字体 (对齐 runtime FontName)
export const fontNameSchema = z.object({
  family: z.string(),
  style: z.string(),
});
export type FontName = z.infer<typeof fontNameSchema>;

// 行高 (对齐 runtime LineHeight)
export type LineHeight =
  | { value: number; unit: 'PIXELS' }
  | { value: number; unit: 'PERCENT' }
  | { unit: 'AUTO' };

export const lineHeightSchema: z.ZodType<LineHeight> = z.union([
  z
    .object({ value: z.number(), unit: z.literal('PIXELS') })
    .describe(
      '固定行高:{value: 数值, unit: "PIXELS"},如 {value: 24, unit: "PIXELS"}',
    ),
  z
    .object({ value: z.number(), unit: z.literal('PERCENT') })
    .describe(
      '百分比行高:{value: 数值, unit: "PERCENT"},如 {value: 150, unit: "PERCENT"}',
    ),
  z
    .object({ unit: z.literal('AUTO') })
    .describe('自动行高:{unit: "AUTO"},无需传 value'),
]);

// 字距 (对齐 runtime LetterSpacing)
export interface LetterSpacing {
  value: number;
  unit: 'PIXELS' | 'PERCENT';
}

export const letterSpacingSchema: z.ZodType<LetterSpacing> = z.object({
  value: z.number(),
  unit: z.enum(['PIXELS', 'PERCENT']),
});

// ---- 节点类型枚举 (对齐 runtime NodeType) ----
export const nodeTypeSchema = z.enum([
  'SLICE',
  'FRAME',
  'GROUP',
  'COMPONENT_SET',
  'COMPONENT',
  'INSTANCE',
  'BOOLEAN_OPERATION',
  'VECTOR',
  'STAR',
  'LINE',
  'ELLIPSE',
  'POLYGON',
  'RECTANGLE',
  'TEXT',
]);
export type NodeType = z.infer<typeof nodeTypeSchema>;

// ---- 共享 schema (execute / update 共用) ----

export const transformPropsSchema = z.object({
  x: z.number().optional().describe('X 坐标(px)'),
  y: z.number().optional().describe('Y 坐标(px)'),
  width: z.number().optional().describe('宽度(px)'),
  height: z.number().optional().describe('高度(px)'),
  rotation: z.number().optional().describe('旋转角度(deg)'),
  opacity: z.number().optional().describe('不透明度 0-1'),
  visible: z.boolean().optional().describe('是否可见'),
  locked: z.boolean().optional().describe('锁定图层'),
});

export const strokePropsSchema = z.object({
  strokes: z.array(paintSchema).optional().describe('描边列表(Paint 数组)'),
  strokeWeight: z.number().optional().describe('描边宽度(px)'),
  strokeTopWeight: z.number().optional().describe('描边顶部宽(px)'),
  strokeBottomWeight: z.number().optional().describe('描边底部宽(px)'),
  strokeLeftWeight: z.number().optional().describe('描边左侧宽(px)'),
  strokeRightWeight: z.number().optional().describe('描边右侧宽(px)'),
  strokeAlign: z
    .enum(['CENTER', 'INSIDE', 'OUTSIDE'])
    .optional()
    .describe('描边对齐:CENTER|INSIDE|OUTSIDE'),
  strokeCap: z
    .enum(['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL'])
    .optional()
    .describe('描边端点:NONE|ROUND|SQUARE|ARROW_LINES|ARROW_EQUILATERAL'),
  strokeJoin: z
    .enum(['MITER', 'BEVEL', 'ROUND'])
    .optional()
    .describe('描边连接:MITER|BEVEL|ROUND'),
  dashPattern: z.array(z.number()).optional().describe('虚线段数组,如 [4,4]'),
});

export const cornerPropsSchema = z.object({
  cornerRadius: z.number().optional().describe('圆角半径(px),四角统一'),
  topLeftRadius: z.number().optional().describe('左上圆角(px)'),
  topRightRadius: z.number().optional().describe('右上圆角(px)'),
  bottomLeftRadius: z.number().optional().describe('左下圆角(px)'),
  bottomRightRadius: z.number().optional().describe('右下圆角(px)'),
});

export const textPropsSchema = z.object({
  characters: z.string().optional().describe('文本内容'),
  fontSize: z.number().optional().describe('字号(px)'),
  fontName: fontNameSchema.optional().describe('字体:{family,style}'),
  textAlignHorizontal: z
    .enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'])
    .optional()
    .describe('水平对齐:LEFT|CENTER|RIGHT|JUSTIFIED'),
  textAlignVertical: z
    .enum(['TOP', 'CENTER', 'BOTTOM'])
    .optional()
    .describe('垂直对齐:TOP|CENTER|BOTTOM'),
  textAutoResize: z
    .enum(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'])
    .optional()
    .describe('文本自适应:NONE|WIDTH_AND_HEIGHT|HEIGHT|TRUNCATE'),
  textCase: z
    .enum(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE'])
    .optional()
    .describe('文本大小写:ORIGINAL|UPPER|LOWER|TITLE'),
  textDecoration: z
    .enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH'])
    .optional()
    .describe('文本装饰:NONE|UNDERLINE|STRIKETHROUGH'),
  lineHeight: lineHeightSchema.optional().describe('行高:{value,unit}'),
  letterSpacing: letterSpacingSchema.optional().describe('字距:{value,unit}'),
});

export const autoLayoutPropsSchema = z.object({
  layoutMode: z
    .enum(['NONE', 'HORIZONTAL', 'VERTICAL'])
    .optional()
    .describe('自动布局方向:NONE|HORIZONTAL|VERTICAL'),
  itemSpacing: z.number().optional().describe('自动布局项间距(px)'),
  paddingTop: z.number().optional().describe('上内边距(px)'),
  paddingRight: z.number().optional().describe('右内边距(px)'),
  paddingBottom: z.number().optional().describe('下内边距(px)'),
  paddingLeft: z.number().optional().describe('左内边距(px)'),
  primaryAxisSizingMode: z
    .enum(['FIXED', 'AUTO'])
    .optional()
    .describe('主轴尺寸模式:FIXED|AUTO'),
  counterAxisSizingMode: z
    .enum(['FIXED', 'AUTO'])
    .optional()
    .describe('交叉轴尺寸模式:FIXED|AUTO'),
  primaryAxisAlignItems: z
    .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
    .optional()
    .describe('主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN'),
  counterAxisAlignItems: z
    .enum(['MIN', 'MAX', 'CENTER'])
    .optional()
    .describe('交叉轴对齐:MIN|MAX|CENTER'),
  layoutGrow: z.number().optional().describe('自动布局内伸缩系数'),
  layoutAlign: z
    .enum(['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'])
    .optional()
    .describe('自动布局内对齐:MIN|CENTER|MAX|STRETCH|INHERIT'),
});

export const visualPropsSchema = z.object({
  fills: z.array(paintSchema).optional().describe('填充列表(Paint 数组)'),
  blendMode: blendModeSchema.optional().describe('混合模式'),
  effects: z
    .array(effectSchema)
    .optional()
    .describe('效果列表(阴影/模糊,可多层叠加)'),
  constraints: z
    .object({
      horizontal: constraintTypeSchema.describe(
        '水平约束:MIN|MAX|STRETCH|CENTER|SCALE',
      ),
      vertical: constraintTypeSchema.describe(
        '垂直约束:MIN|MAX|STRETCH|CENTER|SCALE',
      ),
    })
    .optional()
    .describe('自动布局中的约束'),
  clipsContent: z.boolean().optional().describe('是否裁剪溢出内容'),
  cornerSmoothing: z.number().optional().describe('圆角平滑度 0-1'),
  layoutGrids: z
    .array(layoutGridSchema)
    .optional()
    .describe('布局网格(参考线)'),
  arcData: z
    .object({
      startingAngle: z.number().describe('起始角度(radians)'),
      endingAngle: z.number().describe('结束角度(radians)'),
      innerRadius: z.number().describe('内半径(0-1 ratio)'),
    })
    .optional()
    .describe('环形路径参数(弧线)'),
});

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
  }),
);

// ---- 结果 schema ----
export const createdResultSchema = z.object({
  created: z.union([serializedNodeSchema, z.array(serializedNodeSchema)]),
});
export const updatedResultSchema = z.object({
  updated: z.array(serializedNodeSchema),
});
export const pingResultSchema = z.object({
  connected: z.boolean(),
  error: z.string().optional(),
});
export const getSelectionResultSchema = z.object({
  selection: z.array(serializedNodeSchema),
  pageName: z.string(),
});
export const findResultSchema = z.object({
  nodes: z.array(serializedNodeSchema),
  total: z.number(),
});
export const manageNodesResultSchema = z.object({
  selected: z.array(z.string()).optional(),
  removed: z.array(z.string()).optional(),
  ungrouped: z.array(z.string()).optional(),
  moved: z.array(serializedNodeSchema).optional(),
  cleaned: z.array(z.string()).optional(),
  created: z
    .union([serializedNodeSchema, z.array(serializedNodeSchema)])
    .optional(),
});
export const manageComponentsResultSchema = z.object({
  created: z
    .union([serializedNodeSchema, z.array(serializedNodeSchema)])
    .optional(),
  swapped: z.array(serializedNodeSchema).optional(),
  updated: z.array(serializedNodeSchema).optional(),
});
export const exportResultSchema = z.object({
  exports: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      format: z.enum(['PNG', 'JPG', 'SVG', 'PDF']),
      mimeType: z.string(),
      size: z.number(),
      path: z.string().optional(),
      dataUrl: z.string().optional(),
    }),
  ),
});
export const listFontsResultSchema = z.object({
  families: z.array(z.string()),
  count: z.number(),
});

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
}

// 从 discriminated union 派生的平面类型(所有字段 optional,与 ExecuteOp 兼容)
type MergeUnion<T> = T extends any ? { [K in keyof T]?: T[K] } : never;
export type ExecuteOpFromSchema = MergeUnion<
  | z.infer<typeof frameNodeSchema>
  | z.infer<typeof rectangleNodeSchema>
  | z.infer<typeof ellipseNodeSchema>
  | z.infer<typeof lineNodeSchema>
  | z.infer<typeof polygonNodeSchema>
  | z.infer<typeof starNodeSchema>
  | z.infer<typeof vectorNodeSchema>
  | z.infer<typeof textNodeSchema>
  | z.infer<typeof groupNodeSchema>
  | z.infer<typeof booleanOperationNodeSchema>
>;

// ---- 基础字段(所有节点共享) ----
const baseNodeFields = {
  name: z.string().optional().describe('图层名'),
  x: z.number().optional().describe('X 坐标(px)'),
  y: z.number().optional().describe('Y 坐标(px)'),
  width: z.number().optional().describe('宽度(px)'),
  height: z.number().optional().describe('高度(px)'),
  rotation: z.number().optional().describe('旋转角度(deg)'),
  opacity: z.number().optional().describe('不透明度 0-1'),
  visible: z.boolean().optional().describe('是否可见'),
  locked: z.boolean().optional().describe('锁定图层'),
  isMask: z.boolean().optional().describe('是否为蒙版'),
  children: z
    .array(z.any())
    .max(10)
    .optional()
    .describe(
      '子节点数组(GROUP/BOOLEAN_OPERATION 使用,递归嵌套,最多 10 个直接子节点)',
    ),
};

// 视觉字段(填充/描边/效果等,所有节点共享)
const visualFields = {
  fills: z.array(paintSchema).optional().describe('填充列表(Paint 数组)'),
  strokes: z.array(paintSchema).optional().describe('描边列表(Paint 数组)'),
  strokeWeight: z.number().optional().describe('描边宽度(px)'),
  strokeTopWeight: z.number().optional().describe('描边顶部宽(px)'),
  strokeBottomWeight: z.number().optional().describe('描边底部宽(px)'),
  strokeLeftWeight: z.number().optional().describe('描边左侧宽(px)'),
  strokeRightWeight: z.number().optional().describe('描边右侧宽(px)'),
  strokeAlign: z
    .enum(['CENTER', 'INSIDE', 'OUTSIDE'])
    .optional()
    .describe('描边对齐:CENTER|INSIDE|OUTSIDE'),
  strokeCap: z
    .enum(['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL'])
    .optional()
    .describe('描边端点:NONE|ROUND|SQUARE|ARROW_LINES|ARROW_EQUILATERAL'),
  strokeJoin: z
    .enum(['MITER', 'BEVEL', 'ROUND'])
    .optional()
    .describe('描边连接:MITER|BEVEL|ROUND'),
  dashPattern: z.array(z.number()).optional().describe('虚线段数组,如 [4,4]'),
  blendMode: blendModeSchema.optional().describe('混合模式'),
  effects: z
    .array(effectSchema)
    .optional()
    .describe('效果列表(阴影/模糊,可多层叠加)'),
  constraints: z
    .object({
      horizontal: constraintTypeSchema.describe(
        '水平约束:MIN|MAX|STRETCH|CENTER|SCALE',
      ),
      vertical: constraintTypeSchema.describe(
        '垂直约束:MIN|MAX|STRETCH|CENTER|SCALE',
      ),
    })
    .optional()
    .describe('自动布局中的约束'),
  clipsContent: z.boolean().optional().describe('是否裁剪溢出内容'),
  cornerSmoothing: z.number().optional().describe('圆角平滑度 0-1'),
  layoutGrids: z
    .array(layoutGridSchema)
    .optional()
    .describe('布局网格(参考线)'),
};

// ---- 各类型 schema ----

const frameNodeSchema = z
  .object({
    type: z.literal('FRAME'),
    ...baseNodeFields,
    layoutMode: z
      .enum(['NONE', 'HORIZONTAL', 'VERTICAL'])
      .optional()
      .describe(
        '自动布局方向:NONE=无布局,HORIZONTAL=水平排列,VERTICAL=垂直排列。传 itemSpacing/padding*/primaryAxis* 等布局属性前必须先设为 HORIZONTAL 或 VERTICAL',
      ),
    itemSpacing: z
      .number()
      .optional()
      .describe('自动布局项间距(px),需先设 layoutMode'),
    paddingTop: z.number().optional().describe('上内边距(px)'),
    paddingRight: z.number().optional().describe('右内边距(px)'),
    paddingBottom: z.number().optional().describe('下内边距(px)'),
    paddingLeft: z.number().optional().describe('左内边距(px)'),
    primaryAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('主轴尺寸模式:FIXED|AUTO'),
    counterAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('交叉轴尺寸模式:FIXED|AUTO'),
    primaryAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
      .optional()
      .describe('主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN'),
    counterAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER'])
      .optional()
      .describe('交叉轴对齐:MIN|MAX|CENTER'),
    layoutGrow: z.number().optional().describe('自动布局内伸缩系数'),
    layoutAlign: z
      .enum(['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'])
      .optional()
      .describe('自动布局内对齐:MIN|CENTER|MAX|STRETCH|INHERIT'),
    ...visualFields,
  })
  .superRefine((val, ctx) => {
    // itemSpacing/padding*/primaryAxis*/counterAxis* 需要 layoutMode != NONE
    const hasLayoutFields =
      val.itemSpacing != null ||
      val.paddingTop != null ||
      val.paddingRight != null ||
      val.paddingBottom != null ||
      val.paddingLeft != null ||
      val.primaryAxisSizingMode != null ||
      val.counterAxisSizingMode != null ||
      val.primaryAxisAlignItems != null ||
      val.counterAxisAlignItems != null;
    if (
      hasLayoutFields &&
      (val.layoutMode == null || val.layoutMode === 'NONE')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          '传 itemSpacing/padding*/primaryAxis*/counterAxis* 等布局属性前,layoutMode 必须设为 HORIZONTAL 或 VERTICAL',
        path: ['layoutMode'],
      });
    }
  })
  .describe('FRAME=容器(可 auto-layout)');

const rectangleNodeSchema = z
  .object({
    type: z.literal('RECTANGLE'),
    ...baseNodeFields,
    cornerRadius: z.number().optional().describe('圆角半径(px),四角统一'),
    topLeftRadius: z.number().optional().describe('左上圆角(px)'),
    topRightRadius: z.number().optional().describe('右上圆角(px)'),
    bottomLeftRadius: z.number().optional().describe('左下圆角(px)'),
    bottomRightRadius: z.number().optional().describe('右下圆角(px)'),
    ...visualFields,
  })
  .describe('RECTANGLE=矩形');

const ellipseNodeSchema = z
  .object({
    type: z.literal('ELLIPSE'),
    ...baseNodeFields,
    cornerRadius: z.number().optional().describe('圆角半径(px)'),
    arcData: z
      .object({
        startingAngle: z.number().describe('起始角度(radians)'),
        endingAngle: z.number().describe('结束角度(radians)'),
        innerRadius: z.number().describe('内半径(0-1 ratio)'),
      })
      .optional()
      .describe('环形路径参数(弧线),可画圆环'),
    ...visualFields,
  })
  .describe('ELLIPSE=椭圆(配合 arcData 可画环)');

const lineNodeSchema = z
  .object({
    type: z.literal('LINE'),
    ...baseNodeFields,
    ...visualFields,
  })
  .describe('LINE=线段');

const polygonNodeSchema = z
  .object({
    type: z.literal('POLYGON'),
    ...baseNodeFields,
    pointCount: z.number().describe('多边形角点数,如 6=六边形'),
    cornerRadius: z.number().optional().describe('圆角半径(px)'),
    topLeftRadius: z.number().optional().describe('左上圆角(px)'),
    topRightRadius: z.number().optional().describe('右上圆角(px)'),
    bottomLeftRadius: z.number().optional().describe('左下圆角(px)'),
    bottomRightRadius: z.number().optional().describe('右下圆角(px)'),
    ...visualFields,
  })
  .describe('POLYGON=多边形(配合 pointCount)');

const starNodeSchema = z
  .object({
    type: z.literal('STAR'),
    ...baseNodeFields,
    pointCount: z.number().describe('星形角点数,如 5=五角星'),
    innerRadius: z.number().describe('星形内半径(px),值越小角越尖锐'),
    cornerRadius: z.number().optional().describe('圆角半径(px)'),
    topLeftRadius: z.number().optional().describe('左上圆角(px)'),
    topRightRadius: z.number().optional().describe('右上圆角(px)'),
    bottomLeftRadius: z.number().optional().describe('左下圆角(px)'),
    bottomRightRadius: z.number().optional().describe('右下圆角(px)'),
    ...visualFields,
  })
  .describe('STAR=星形(配合 pointCount + innerRadius)');

const vectorNodeSchema = z
  .object({
    type: z.literal('VECTOR'),
    ...baseNodeFields,
    vectorPaths: z
      .array(vectorPathSchema)
      .describe('矢量路径数组,每项含 SVG path data(如 "M0 0 L100 100")'),
    ...visualFields,
  })
  .describe('VECTOR=矢量(配合 vectorPaths 传 SVG path data)');

const textNodeSchema = z
  .object({
    type: z.literal('TEXT'),
    ...baseNodeFields,
    characters: z.string().describe('文本内容,如 "Hello World"'),
    fontSize: z.number().optional().describe('字号(px),默认 16'),
    fontName: fontNameSchema
      .optional()
      .describe(
        '字体:{family,style},如 {family:"PingFang SC",style:"Regular"}',
      ),
    textAlignHorizontal: z
      .enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'])
      .optional()
      .describe('水平对齐:LEFT|CENTER|RIGHT|JUSTIFIED'),
    textAlignVertical: z
      .enum(['TOP', 'CENTER', 'BOTTOM'])
      .optional()
      .describe('垂直对齐:TOP|CENTER|BOTTOM'),
    textAutoResize: z
      .enum(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'])
      .optional()
      .describe('文本自适应:NONE|WIDTH_AND_HEIGHT|HEIGHT|TRUNCATE'),
    textCase: z
      .enum(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE'])
      .optional()
      .describe('文本大小写:ORIGINAL|UPPER|LOWER|TITLE'),
    textDecoration: z
      .enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH'])
      .optional()
      .describe('文本装饰:NONE|UNDERLINE|STRIKETHROUGH'),
    lineHeight: lineHeightSchema
      .optional()
      .describe('行高:{value,unit},unit 为 PIXELS|PERCENT;或 {unit:"AUTO"}'),
    letterSpacing: letterSpacingSchema
      .optional()
      .describe('字距:{value,unit},unit 为 PIXELS|PERCENT'),
    ...visualFields,
  })
  .describe('TEXT=文本(配合 characters/fontSize/fontName 等)');

const groupNodeSchema = z
  .object({
    type: z.literal('GROUP'),
    ...baseNodeFields,
    layoutMode: z
      .enum(['NONE', 'HORIZONTAL', 'VERTICAL'])
      .optional()
      .describe(
        '自动布局方向:NONE=纯归组,HORIZONTAL=水平,VERTICAL=垂直。传 itemSpacing/padding* 等布局属性前必须先设为 HORIZONTAL 或 VERTICAL',
      ),
    itemSpacing: z.number().optional().describe('项间距(px),需先设 layoutMode'),
    paddingTop: z.number().optional().describe('上内边距(px)'),
    paddingRight: z.number().optional().describe('右内边距(px)'),
    paddingBottom: z.number().optional().describe('下内边距(px)'),
    paddingLeft: z.number().optional().describe('左内边距(px)'),
    primaryAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('主轴尺寸模式:FIXED|AUTO'),
    counterAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('交叉轴尺寸模式:FIXED|AUTO'),
    primaryAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
      .optional()
      .describe('主轴对齐'),
    counterAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER'])
      .optional()
      .describe('交叉轴对齐'),
    ...visualFields,
  })
  .superRefine((val, ctx) => {
    const hasLayoutFields =
      val.itemSpacing != null ||
      val.paddingTop != null ||
      val.paddingRight != null ||
      val.paddingBottom != null ||
      val.paddingLeft != null ||
      val.primaryAxisSizingMode != null ||
      val.counterAxisSizingMode != null ||
      val.primaryAxisAlignItems != null ||
      val.counterAxisAlignItems != null;
    if (
      hasLayoutFields &&
      (val.layoutMode == null || val.layoutMode === 'NONE')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          '传 itemSpacing/padding*/primaryAxis*/counterAxis* 等布局属性前,layoutMode 必须设为 HORIZONTAL 或 VERTICAL',
        path: ['layoutMode'],
      });
    }
  })
  .describe('GROUP=分组(内部用 Frame 实现)');

const booleanOperationNodeSchema = z
  .object({
    type: z.literal('BOOLEAN_OPERATION'),
    ...baseNodeFields,
    booleanOperation: z
      .enum(['UNION', 'SUBTRACT', 'INTERSECT', 'EXCLUDE'])
      .describe(
        '布尔运算:UNION=合并,SUBTRACT=减去,INTERSECT=相交,EXCLUDE=排除',
      ),
    children: z.array(z.any()).min(2).describe('要合并的子节点数组(至少 2 个)'),
    ...visualFields,
  })
  .describe('BOOLEAN_OPERATION=布尔运算(合并子节点)');

// 导出: discriminated union on `type`(用于 JSON Schema 生成,LLM 看到按 type 分组的字段)
// 运行时校验使用,TypeScript 类型保持为扁平 ExecuteOp 以兼容 UI 侧 duck-typing
export const executeNodeSchema: z.ZodType<ExecuteOp> = z.discriminatedUnion(
  'type',
  [
    frameNodeSchema,
    rectangleNodeSchema,
    ellipseNodeSchema,
    lineNodeSchema,
    polygonNodeSchema,
    starNodeSchema,
    vectorNodeSchema,
    textNodeSchema,
    groupNodeSchema,
    booleanOperationNodeSchema,
  ],
);

// 导出各子类型(供 UI 侧类型断言使用)
export type FrameNodeOp = z.infer<typeof frameNodeSchema>;
export type RectangleNodeOp = z.infer<typeof rectangleNodeSchema>;
export type EllipseNodeOp = z.infer<typeof ellipseNodeSchema>;
export type LineNodeOp = z.infer<typeof lineNodeSchema>;
export type PolygonNodeOp = z.infer<typeof polygonNodeSchema>;
export type StarNodeOp = z.infer<typeof starNodeSchema>;
export type VectorNodeOp = z.infer<typeof vectorNodeSchema>;
export type TextNodeOp = z.infer<typeof textNodeSchema>;
export type GroupNodeOp = z.infer<typeof groupNodeSchema>;
export type BooleanOperationNodeOp = z.infer<typeof booleanOperationNodeSchema>;

export const placementSchema = z
  .object({
    mode: z
      .enum(['center', 'manual', 'absolute'])
      .optional()
      .describe(
        '放置模式:center=居中画布/manual=保持节点原始坐标/absolute=使用 x/y 指定坐标(选 absolute 必须传 x 和 y)',
      ),
    x: z
      .number()
      .optional()
      .describe('absolute 模式下的绝对 X 坐标,与 mode="absolute" 配合使用'),
    y: z
      .number()
      .optional()
      .describe('absolute 模式下的绝对 Y 坐标,与 mode="absolute" 配合使用'),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'absolute' && (val.x == null || val.y == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'placement.mode 为 absolute 时,x 和 y 均为必填项',
        path: val.x == null ? ['x'] : ['y'],
      });
    }
  });

export const executeSchema = z.object({
  ops: z.array(executeNodeSchema).describe('设计指令节点树'),
  placement: placementSchema
    .optional()
    .describe('放置方式,缺省 center 居中。选 absolute 模式必须传 x 和 y 坐标'),
});

export const createSvgSchema = z.object({
  svg: z
    .string()
    .describe(
      '完整 SVG 字符串,如 <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0 L100 0 L100 100 Z" fill="#ff0000"/></svg>',
    ),
  name: z.string().optional().describe('生成的图层名,默认 svg-design'),
});

export const htmlToDesignSchema = z.object({
  html: z.string().describe('HTML 片段,支持内联 style'),
  name: z.string().optional().describe('生成的图层名,默认 html-design'),
});

export const createIconSchema = z.object({
  icon: z
    .string()
    .describe(
      '图标名/别名/语义描述,如 home、arrow-right、search、magnifier(搜索);支持模糊匹配与别名联想,查无返回候选提示',
    ),
  size: z.number().optional().describe('图标边长 px,默认 24'),
  color: z.string().optional().describe('描边颜色(十六进制),默认 #000000'),
  strokeWidth: z.number().optional().describe('描边宽度,默认 2'),
  name: z.string().optional().describe('生成的图层名,默认 icon-<图标名>'),
});

// update_node props (字段对齐 runtime, 复用共享 schema)
export const updateNodePropsSchema = z
  .object({
    name: z.string().optional().describe('图层名称'),
    pointCount: z.number().optional().describe('多边形/星形角点数'),
    innerRadius: z.number().optional().describe('星形内半径(px)'),
  })
  .and(transformPropsSchema)
  .and(strokePropsSchema)
  .and(cornerPropsSchema)
  .and(textPropsSchema)
  .and(autoLayoutPropsSchema)
  .and(visualPropsSchema);

export const updateNodeSchema = z.object({
  ids: z.array(z.string()).optional().describe('指定节点 id'),
  matchName: z
    .string()
    .optional()
    .describe('按节点 name 过滤,仅命中节点被修改'),
  recursive: z.boolean().optional().describe('是否递归应用到子节点,默认 false'),
  props: updateNodePropsSchema.describe('要修改的属性'),
});

export const findSchema = z.object({
  ids: z.array(z.string()).optional().describe('按节点 id 精确查找,优先级最高'),
  name: z.string().optional().describe('按名称模糊匹配(包含)'),
  type: z
    .string()
    .optional()
    .describe(
      '节点类型过滤,支持:SLICE/FRAME/GROUP/COMPONENT_SET/COMPONENT/INSTANCE/BOOLEAN_OPERATION/VECTOR/STAR/LINE/ELLIPSE/POLYGON/RECTANGLE/TEXT',
    ),
  recursive: z.boolean().optional().describe('是否递归查找(默认 true)'),
  depth: z
    .number()
    .optional()
    .describe('序列化深度:0=仅自身,1=含直接子节点;缺省 1'),
});

export const manageNodesSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('select'),
    ids: z.array(z.string()).describe('要选中的节点 id 列表'),
  }),
  z.object({
    op: z.literal('remove'),
    ids: z
      .array(z.string())
      .optional()
      .describe('要删除的节点 id 列表,缺省用当前选中'),
    matchName: z
      .string()
      .optional()
      .describe('在 ids(或当前选中)范围内,仅删除 name 精确匹配的节点'),
  }),
  z.object({
    op: z.literal('clone'),
    ids: z.array(z.string()).describe('要复制的节点 id 列表'),
  }),
  z.object({
    op: z.literal('group'),
    ids: z.array(z.string()).describe('要编组的节点 id 列表'),
    name: z.string().optional().describe('组名'),
    layoutMode: z
      .enum(['NONE', 'HORIZONTAL', 'VERTICAL'])
      .optional()
      .describe(
        '自动布局方向:NONE=纯归组,子节点仅叠加,HORIZONTAL=水平排列,VERTICAL=垂直排列',
      ),
    itemSpacing: z.number().optional().describe('自动布局项间距(px)'),
    paddingTop: z.number().optional().describe('上内边距(px)'),
    paddingRight: z.number().optional().describe('右内边距(px)'),
    paddingBottom: z.number().optional().describe('下内边距(px)'),
    paddingLeft: z.number().optional().describe('左内边距(px)'),
    primaryAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('主轴尺寸模式:FIXED|AUTO'),
    counterAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('交叉轴尺寸模式:FIXED|AUTO'),
    primaryAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
      .optional()
      .describe('主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN'),
    counterAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER'])
      .optional()
      .describe('交叉轴对齐:MIN|MAX|CENTER'),
  }),
  z.object({
    op: z.literal('ungroup'),
    ids: z.array(z.string()).describe('要取消编组的节点 id 列表'),
  }),
  z.object({
    op: z.literal('flatten'),
    ids: z
      .array(z.string())
      .describe('要合并为单个矢量的节点 id 列表(至少 2 个)'),
  }),
  z.object({
    op: z.literal('outline_stroke'),
    ids: z.array(z.string()).describe('要转描边的节点 id 列表'),
  }),
  z.object({
    op: z.literal('reparent'),
    ids: z.array(z.string()).describe('要移动的节点 id 列表'),
    parentId: z
      .string()
      .optional()
      .describe('目标父节点 id,缺省用当前选中第一个节点'),
    index: z.number().optional().describe('插入位置,缺省追加到末尾'),
  }),
  z.object({
    op: z
      .literal('repair')
      .describe('清理画布中已损坏/失效的节点(读取失败的节点直接删除)'),
  }),
]);

export const manageComponentsSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create_component'),
    ids: z.array(z.string()).describe('要固化为组件的节点 id 列表'),
    name: z.string().optional().describe('组件名,默认 component'),
  }),
  z.object({
    op: z.literal('create_instance'),
    ids: z
      .array(z.string())
      .describe('组件(COMPONENT)节点 id 列表,每个生成一个实例'),
  }),
  z.object({
    op: z.literal('detach_instance'),
    ids: z.array(z.string()).describe('实例(INSTANCE)节点 id 列表'),
  }),
  z.object({
    op: z.literal('import_component'),
    key: z.string().describe('团队库组件的唯一标识 Key(从设计稿/团队库获取)'),
    name: z.string().optional().describe('导入后的组件名'),
  }),
  z.object({
    op: z.literal('swap_component'),
    ids: z.array(z.string()).describe('实例(INSTANCE)节点 id 列表'),
    componentId: z.string().describe('目标组件(COMPONENT)节点 id'),
  }),
  z.object({
    op: z.literal('set_instance_properties'),
    ids: z.array(z.string()).describe('实例(INSTANCE)节点 id 列表'),
    properties: z
      .record(z.string(), z.string())
      .describe(
        '变体属性名→值,如 {"状态":"禁用"}。可调属性列表需从 jsd_find/jsd_get_selection 返回的 variantGroupProperties 获取,属性名必须完全匹配',
      ),
  }),
  z.object({
    op: z.literal('combine_as_variants'),
    ids: z.array(z.string()).describe('组件(COMPONENT)节点 id 列表(至少 2 个)'),
    name: z.string().optional().describe('组件集名'),
  }),
]);

export const exportSchema = z.object({
  ids: z.array(z.string()).describe('要导出的节点 id 列表'),
  format: z
    .enum(['PNG', 'JPG', 'SVG', 'PDF'])
    .optional()
    .describe('导出格式,默认 PNG'),
  scale: z.number().optional().describe('缩放倍率(PNG/JPG),默认 1'),
  savePath: z.string().optional().describe('落盘文件绝对路径,如 /tmp/icon.png'),
  includeDataUrl: z
    .boolean()
    .optional()
    .describe('是否同时返回 base64 dataURL,默认 false'),
});

export const listFontsSchema = z.object({});
