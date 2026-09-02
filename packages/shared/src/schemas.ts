import { z } from 'zod';

// ---- 基础类型 (对齐 plugin-typings runtime) ----

export const rgbSchema = z
  .object({
    r: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 的色值请先除以 255 归一化)')
      .describe('红色通道,范围 0-1(0=无,1=满),如纯红为 1'),
    g: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 的色值请先除以 255 归一化)')
      .describe('绿色通道,范围 0-1'),
    b: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 的色值请先除以 255 归一化)')
      .describe('蓝色通道,范围 0-1'),
  })
  .strict();
export type RGB = z.infer<typeof rgbSchema>;

export const rgbaSchema = z
  .object({
    r: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 请先归一化)')
      .describe('红色通道,范围 0-1(0-255 请先除以 255 归一化)'),
    g: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 请先归一化)')
      .describe('绿色通道,范围 0-1'),
    b: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 请先归一化)')
      .describe('蓝色通道,范围 0-1'),
    a: z
      .number()
      .min(0)
      .max(1, 'alpha 通道最大 1(0-255 请先归一化)')
      .describe('不透明度,范围 0-1(0=全透明,1=不透明)'),
  })
  .strict()
  .describe('RGBA 颜色,通道均为 0-1(0-255 请先除以 255 归一化)');
export type RGBA = z.infer<typeof rgbaSchema>;

export const gradientStopSchema = z
  .object({
    color: rgbaSchema.describe('该停止点的颜色(带 alpha)'),
    position: z
      .number()
      .min(0)
      .max(1)
      .describe('停止点位置,范围 0-1(0=起点,1=终点)'),
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

// 混合模式 (对齐 runtime BlendMode)
export const blendModeSchema = z
  .enum([
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
  ])
  .describe(
    '混合模式:PASS_THROUGH=穿透 | NORMAL=正常 | DARKEN=变暗 | MULTIPLY=正片叠底 | COLOR_BURN=颜色加深 | LIGHTEN=变亮 | SCREEN=滤色 | COLOR_DODGE=颜色减淡 | OVERLAY=叠加 | SOFT_LIGHT=柔光 | HARD_LIGHT=强光 | DIFFERENCE=差值 | EXCLUSION=排除 | HUE=色相 | SATURATION=饱和度 | COLOR=颜色 | LUMINOSITY=明度',
  );
export type BlendMode = z.infer<typeof blendModeSchema>;

// Paint: 填充/描边的统一表示 (对齐 runtime Paint union)
export const paintSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('SOLID').describe('填充类型:纯色'),
      color: rgbSchema.describe('纯色值(RGB,各通道 0-1)'),
      opacity: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('不透明度 0-1,缺省 1'),
      visible: z.boolean().optional().describe('是否可见,缺省 true'),
      blendMode: blendModeSchema.optional().describe('混合模式,缺省 NORMAL'),
    })
    .strict()
    .describe('纯色填充(SOLID):{color:{r,g,b}}'),
  z
    .object({
      type: z.literal('GRADIENT_LINEAR').describe('填充类型:线性渐变'),
      gradientStops: z
        .array(gradientStopSchema)
        .describe('渐变停止点数组(至少 2 个,定义颜色与位置)'),
      gradientTransform: transformSchema,
    })
    .strict()
    .describe('线性渐变(GRADIENT_LINEAR):沿直线方向过渡'),
  z
    .object({
      type: z.literal('GRADIENT_RADIAL').describe('填充类型:径向渐变'),
      gradientStops: z
        .array(gradientStopSchema)
        .describe('渐变停止点数组(至少 2 个,定义颜色与位置)'),
      gradientTransform: transformSchema,
    })
    .strict()
    .describe('径向渐变(GRADIENT_RADIAL):从中心向外辐射'),
  z
    .object({
      type: z.literal('GRADIENT_ANGULAR').describe('填充类型:角度渐变'),
      gradientStops: z
        .array(gradientStopSchema)
        .describe('渐变停止点数组(至少 2 个,定义颜色与位置)'),
      gradientTransform: transformSchema,
    })
    .strict()
    .describe('角度渐变(GRADIENT_ANGULAR):沿圆周方向过渡'),
  z
    .object({
      type: z.literal('IMAGE').describe('填充类型:图片填充'),
      imageHash: z.string().describe('图片资源哈希(由 jsd_fill_image 等注入)'),
      scaleMode: z
        .enum(['FILL', 'FIT', 'CROP', 'TILE'])
        .optional()
        .describe('缩放模式:FILL=填充裁剪|FIT=完整适配|CROP=裁剪|TILE=平铺'),
    })
    .strict()
    .describe('图片填充(IMAGE):以 imageHash 引用图片'),
]);
export type Paint = z.infer<typeof paintSchema>;

// 效果 (对齐 runtime Effect discriminated union)
export const effectSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z
        .literal('DROP_SHADOW')
        .describe('效果类型:外阴影(投影到节点外侧)'),
      color: rgbaSchema.describe('阴影颜色(带 alpha 透明度)'),
      offset: z
        .object({
          x: z.number().describe('水平偏移(px),正值向右'),
          y: z.number().describe('垂直偏移(px),正值向下'),
        })
        .describe('阴影偏移向量(px)'),
      radius: z.number().min(0).describe('模糊半径(px),>=0'),
      spread: z
        .number()
        .optional()
        .describe('扩散(px),正值扩大阴影、负值收缩,默认 0'),
      visible: z.boolean().optional().describe('是否可见,默认 true'),
      blendMode: blendModeSchema
        .default('NORMAL')
        .describe('混合模式,默认 NORMAL'),
      showShadowBehindNode: z
        .boolean()
        .optional()
        .describe('是否在节点后方显示阴影(即便节点不透明也透出)'),
    })
    .strict()
    .describe('外阴影(DROP_SHADOW):投影到节点外侧的阴影'),
  z
    .object({
      type: z
        .literal('INNER_SHADOW')
        .describe('效果类型:内阴影(投影到节点内侧)'),
      color: rgbaSchema.describe('阴影颜色(带 alpha 透明度)'),
      offset: z
        .object({
          x: z.number().describe('水平偏移(px),正值向右'),
          y: z.number().describe('垂直偏移(px),正值向下'),
        })
        .describe('阴影偏移向量(px)'),
      radius: z.number().min(0).describe('模糊半径(px),>=0'),
      spread: z
        .number()
        .optional()
        .describe('扩散(px),正值扩大、负值收缩,默认 0'),
      visible: z.boolean().optional().describe('是否可见,默认 true'),
      blendMode: blendModeSchema
        .default('NORMAL')
        .describe('混合模式,默认 NORMAL'),
    })
    .strict()
    .describe('内阴影(INNER_SHADOW):投影到节点内侧的阴影'),
  z
    .object({
      type: z
        .literal('LAYER_BLUR')
        .describe('效果类型:图层模糊(模糊整个节点本身)'),
      radius: z.number().min(0).describe('模糊半径(px),>=0'),
      visible: z.boolean().optional().describe('是否可见,默认 true'),
    })
    .strict()
    .describe('图层模糊(LAYER_BLUR):模糊节点自身'),
  z
    .object({
      type: z
        .literal('BACKGROUND_BLUR')
        .describe('效果类型:背景模糊(模糊节点背后的内容)'),
      radius: z.number().min(0).describe('模糊半径(px),>=0'),
      visible: z.boolean().optional().describe('是否可见,默认 true'),
    })
    .strict()
    .describe('背景模糊(BACKGROUND_BLUR):模糊节点背后的内容'),
]);
export type Effect = z.infer<typeof effectSchema>;

// 约束 (对齐 runtime Constraints)
export const constraintTypeSchema = z
  .enum(['MIN', 'MAX', 'STRETCH', 'CENTER', 'SCALE'])
  .describe(
    '约束类型:MIN=吸附左/上 | MAX=吸附右/下 | STRETCH=拉伸 | CENTER=居中 | SCALE=等比缩放',
  );
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
    count: z.number().int().positive().optional(),
    gutterSize: z.number().optional().describe('沟槽尺寸(px)'),
    offset: z.number().optional().describe('偏移(px)'),
    visible: z.boolean().optional(),
    color: rgbaSchema.optional(),
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
  windingRule?: 'NONZERO' | 'EVENODD' | 'NONE';
}

export const vectorPathSchema: z.ZodType<VectorPath> = z.object({
  data: z
    .string()
    .describe(
      'SVG path data,如 "M0 0 L100 0 L100 100 Z"(M=移动到,L=画线到,Z=闭合)',
    ),
  windingRule: z
    .enum(['NONZERO', 'EVENODD', 'NONE'])
    .default('NONZERO')
    .describe('环绕规则:NONZERO|EVENODD|NONE,默认 NONZERO'),
});

// 字体 (对齐 runtime FontName)
export const fontNameSchema = z.object({
  family: z.string().describe('字体族,如 "PingFang SC"/"Inter"'),
  style: z.string().describe('字型,如 "Regular"/"Bold"/"Medium"'),
});
export type FontName = z.infer<typeof fontNameSchema>;

// 行高 (对齐 runtime LineHeight)
export type LineHeight =
  | { value: number; unit: 'PIXELS' }
  | { value: number; unit: 'PERCENT' }
  | { unit: 'AUTO' };

export const lineHeightSchema: z.ZodType<LineHeight> = z.union([
  z
    .object({
      value: z.number().describe('行高数值(px)'),
      unit: z.literal('PIXELS').describe('单位:PIXELS=固定像素'),
    })
    .describe(
      '固定行高:{value: 数值, unit: "PIXELS"},如 {value: 24, unit: "PIXELS"}',
    ),
  z
    .object({
      value: z.number().describe('行高数值(百分比)'),
      unit: z.literal('PERCENT').describe('单位:PERCENT=百分比'),
    })
    .describe(
      '百分比行高:{value: 数值, unit: "PERCENT"},如 {value: 150, unit: "PERCENT"}',
    ),
  z
    .object({ unit: z.literal('AUTO').describe('单位:AUTO=自动行高') })
    .describe('自动行高:{unit: "AUTO"},无需传 value'),
]);

// 字距 (对齐 runtime LetterSpacing)
export interface LetterSpacing {
  value: number;
  unit: 'PIXELS' | 'PERCENT';
}

export const letterSpacingSchema: z.ZodType<LetterSpacing> = z.object({
  value: z.number(),
  unit: z
    .enum(['PIXELS', 'PERCENT'])
    .describe('单位:PIXELS=像素 | PERCENT=百分比'),
});

// ---- 节点类型枚举 (对齐 runtime NodeType) ----
export const nodeTypeSchema = z
  .enum([
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
  ])
  .describe(
    '节点类型:SLICE=切片 | FRAME=容器 | GROUP=分组 | COMPONENT_SET=组件集 | COMPONENT=组件 | INSTANCE=实例 | BOOLEAN_OPERATION=布尔运算 | VECTOR=矢量 | STAR=星形 | LINE=线段 | ELLIPSE=椭圆 | POLYGON=多边形 | RECTANGLE=矩形 | TEXT=文本',
  );
export type NodeType = z.infer<typeof nodeTypeSchema>;

// ---- 共享 schema (execute / update 共用) ----

export const transformPropsSchema = z.object({
  x: z.number().optional().describe('X 坐标(px)'),
  y: z.number().optional().describe('Y 坐标(px)'),
  width: z.number().optional().describe('宽度(px)'),
  height: z.number().optional().describe('高度(px)'),
  rotation: z.number().optional().describe('旋转角度(deg)'),
  opacity: z.number().optional().describe('不透明度 0-1'),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
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
  characters: z.string().optional(),
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
    .describe(
      '自动布局方向:NONE|HORIZONTAL|VERTICAL。传 itemSpacing/padding*/primaryAxis* 等布局属性前必须先设为 HORIZONTAL 或 VERTICAL',
    ),
  itemSpacing: z
    .number()
    .optional()
    .describe(
      '自动布局项间距(px);primaryAxisAlignItems=SPACE_BETWEEN 时该项被忽略(子项均匀分布)',
    ),
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
    .describe(
      '主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN;设为 SPACE_BETWEEN 时 itemSpacing 被忽略(子项均匀分布)',
    ),
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
  blendMode: blendModeSchema.optional(),
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

// ---- 结果 schema ----
export const createdResultSchema = z.object({
  created: z.union([serializedNodeSchema, z.array(serializedNodeSchema)]),
});
export const updatedResultSchema = z.object({
  updated: z.array(serializedNodeSchema),
});
/** 平台枚举:当前支持即时设计/Figma,未来新增平台在此加值 */
export const pluginPlatformSchema = z.enum(['jsdesign', 'figma']);
export type PluginPlatform = z.infer<typeof pluginPlatformSchema>;

/** 平台能力枚举:adapter 声明当前平台支持哪些超集能力(供 ping/capabilities 上报) */
export const hostCapabilitySchema = z.enum([
  'styles',
  'textTruncation',
  'componentProperties',
  'variables',
  'getMainComponentAsync',
  'platformOps',
]);
export type HostCapability = z.infer<typeof hostCapabilitySchema>;

/** 实例组件属性值(Figma ComponentPropertyValue 的线格式,preferredValues 对齐 InstanceSwapPreferredValue) */
export const componentPropertyValueSchema = z.object({
  type: z.enum(['BOOLEAN', 'VARIANT', 'TEXT', 'INSTANCE_SWAP']),
  value: z.union([z.boolean(), z.string()]),
  preferredValues: z
    .array(
      z.object({
        type: z.enum(['COMPONENT', 'COMPONENT_SET']),
        key: z.string(),
      }),
    )
    .optional(),
});
export type ComponentPropertyValue = z.infer<
  typeof componentPropertyValueSchema
>;

export const pingResultSchema = z.object({
  connected: z.boolean(),
  platform: pluginPlatformSchema.optional(),
  capabilities: z
    .array(hostCapabilitySchema)
    .optional()
    .describe('当前平台支持的能力列表(先查此字段再决定能否调用平台特有操作)'),
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
/** 实例覆盖摘要(只回传键名,不回传大体积值) */
export const overrideSummarySchema = z.object({
  variantProperties: z.record(z.string(), z.string()).optional(),
  componentProperties: z
    .record(z.string(), componentPropertyValueSchema)
    .optional(),
  propsSummary: z.array(z.string()).optional(),
});

/** 单实例套用结果 */
export const applyOverrideItemSchema = z.object({
  instanceId: z.string(),
  instanceName: z.string(),
  ok: z.boolean(),
  message: z.string().optional(),
});

export const manageComponentsResultSchema = z.object({
  created: z
    .union([serializedNodeSchema, z.array(serializedNodeSchema)])
    .optional(),
  swapped: z.array(serializedNodeSchema).optional(),
  updated: z.array(serializedNodeSchema).optional(),
  /** copy_overrides 返回的快照标识(=源实例 id) */
  snapshotId: z.string().optional(),
  sourceName: z.string().optional(),
  /** copy_overrides 返回的复制摘要 */
  captured: overrideSummarySchema.optional(),
  /** apply/sync 返回的逐条套用结果 */
  applied: z.array(applyOverrideItemSchema).optional(),
  /** apply/sync 返回的已套用摘要 */
  source: overrideSummarySchema.optional(),
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

/** 页面结构总览:当前页顶层节点的轻量摘要(不递归子节点) */
export const pageStructureResultSchema = z.object({
  pageName: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: nodeTypeSchema,
      x: z.number(),
      y: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      childCount: z.number().optional(),
    }),
  ),
  count: z.number(),
});

/** 本地样式枚举结果(两平台 API 同构:PAINT/TEXT/EFFECT/GRID) */
export const listStylesResultSchema = z.object({
  styles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['PAINT', 'TEXT', 'EFFECT', 'GRID']),
    }),
  ),
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
  /** 平台特有写字段(仅对应平台生效,其他平台被忽略) */
  textTruncation?: 'DISABLED' | 'ENDING';
  maxLines?: number;
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
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
  name: z.string().optional(),
  x: z.number().optional().describe('X 坐标(px)'),
  y: z.number().optional().describe('Y 坐标(px)'),
  width: z.number().optional().describe('宽度(px)'),
  height: z.number().optional().describe('高度(px)'),
  rotation: z.number().optional().describe('旋转角度(deg)'),
  opacity: z.number().optional().describe('不透明度 0-1'),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  isMask: z.boolean().optional(),
  children: z
    .array(z.lazy(() => executeNodeSchema))
    .max(100)
    .optional()
    .describe(
      '子节点数组(GROUP/BOOLEAN_OPERATION 使用,递归嵌套,最多 100 个直接子节点;更大的结构建议分批创建后用 jsd_manage_nodes op=reparent 归组)',
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
  blendMode: blendModeSchema.optional(),
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
      .describe(
        '自动布局项间距(px),需先设 layoutMode;primaryAxisAlignItems=SPACE_BETWEEN 时该项被忽略(子项均匀分布)',
      ),
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
      .describe(
        '主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN;设为 SPACE_BETWEEN 时 itemSpacing 被忽略(子项均匀分布)',
      ),
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
    itemSpacing: z
      .number()
      .optional()
      .describe(
        '项间距(px),需先设 layoutMode;primaryAxisAlignItems=SPACE_BETWEEN 时该项被忽略(子项均匀分布)',
      ),
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
      .describe(
        '主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN;设为 SPACE_BETWEEN 时 itemSpacing 被忽略(子项均匀分布)',
      ),
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
    children: z
      .array(z.lazy(() => executeNodeSchema))
      .min(2)
      .describe('要合并的子节点数组(至少 2 个)'),
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
    name: z.string().optional(),
    pointCount: z.number().optional().describe('多边形/星形角点数'),
    innerRadius: z.number().optional().describe('星形内半径(px)'),
  })
  .and(transformPropsSchema)
  .and(strokePropsSchema)
  .and(cornerPropsSchema)
  .and(textPropsSchema)
  .and(autoLayoutPropsSchema)
  .and(visualPropsSchema)
  .and(
    z.object({
      textTruncation: z
        .enum(['DISABLED', 'ENDING'])
        .optional()
        .describe(
          '文本截断(DISABLED=不截断,ENDING=末尾省略号截断),仅 Figma 生效',
        ),
      maxLines: z.number().optional().describe('文本最大行数,仅 Figma 生效'),
      fillStyleId: z.string().optional().describe('填充样式 id(团队库样式)'),
      strokeStyleId: z.string().optional().describe('描边样式 id(团队库样式)'),
      textStyleId: z.string().optional().describe('文本样式 id(团队库样式)'),
      effectStyleId: z.string().optional().describe('效果样式 id(团队库样式)'),
    }),
  );

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

/**
 * 节点结构操作入参:扁平结构 + 运行时按 op 精查(与 manageComponentsSchema 同范式)。
 * 不用 discriminatedUnion 生成 oneOf——根级 oneOf 有两个问题:
 * 1) 调用方漏传 op 时,JSON-Schema 校验把每个分支的缺失字段全列一遍(oneOf 复读机式报错);
 * 2) 部分客户端对「根级 oneOf 工具」的出参序列化存在缺陷,实参会在到达服务端前被丢弃
 *    (实测 7/7 复现,扁平对象工具无此现象)。扁平化后两点同时规避。
 */
export const manageNodesSchema = z
  .object({
    op: z
      .enum([
        'select',
        'remove',
        'clone',
        'group',
        'ungroup',
        'flatten',
        'outline_stroke',
        'reparent',
        'repair',
      ])
      .describe(
        '节点结构操作类型:select 设当前选中 | remove 删除(matchName 可再过滤) | clone 复制(右下偏移) | group 编组(可带 layoutMode/itemSpacing/padding* 参数) | ungroup 解组 | flatten 合并为矢量(至少 2 节点) | outline_stroke 描边转轮廓 | reparent 移到 parentId 下(缺省当前选中第一个) | repair 清理已损坏节点',
      ),
    ids: z
      .array(z.string())
      .optional()
      .describe(
        '节点 id 列表;除 remove/repair 外全部 op 必填(remove 缺省用当前选中)',
      ),
    matchName: z
      .string()
      .optional()
      .describe(
        '仅 remove:在 ids(或当前选中)范围内,仅删除 name 精确匹配的节点',
      ),
    name: z.string().optional().describe('仅 group:组名'),
    layoutMode: z
      .enum(['NONE', 'HORIZONTAL', 'VERTICAL'])
      .optional()
      .describe(
        '仅 group。自动布局方向:NONE=纯归组,子节点仅叠加,HORIZONTAL=水平排列,VERTICAL=垂直排列',
      ),
    itemSpacing: z
      .number()
      .optional()
      .describe(
        '仅 group。自动布局项间距(px);primaryAxisAlignItems=SPACE_BETWEEN 时该项被忽略(子项均匀分布)',
      ),
    paddingTop: z.number().optional().describe('仅 group。上内边距(px)'),
    paddingRight: z.number().optional().describe('仅 group。右内边距(px)'),
    paddingBottom: z.number().optional().describe('仅 group。下内边距(px)'),
    paddingLeft: z.number().optional().describe('仅 group。左内边距(px)'),
    primaryAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('仅 group。主轴尺寸模式:FIXED|AUTO'),
    counterAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('仅 group。交叉轴尺寸模式:FIXED|AUTO'),
    primaryAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
      .optional()
      .describe(
        '仅 group。主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN;设为 SPACE_BETWEEN 时 itemSpacing 被忽略(子项均匀分布)',
      ),
    counterAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER'])
      .optional()
      .describe('仅 group。交叉轴对齐:MIN|MAX|CENTER'),
    parentId: z
      .string()
      .optional()
      .describe('仅 reparent:目标父节点 id,缺省用当前选中第一个节点'),
    index: z
      .number()
      .optional()
      .describe('仅 reparent:插入位置,缺省追加到末尾'),
  })
  .superRefine((v, ctx) => {
    const missing = (field: string): void => {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `op=${v.op} 缺少必填字段 ${field}`,
      });
    };
    const hasIds =
      Array.isArray(v.ids) &&
      v.ids.length > 0 &&
      v.ids.every((x) => typeof x === 'string');
    switch (v.op) {
      case 'select':
      case 'clone':
      case 'group':
      case 'ungroup':
      case 'flatten':
      case 'outline_stroke':
      case 'reparent':
        if (!hasIds) missing('ids');
        break;
      case 'remove':
      case 'repair':
        break;
    }
    if (
      v.op === 'flatten' &&
      hasIds &&
      Array.isArray(v.ids) &&
      v.ids.length < 2
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['ids'],
        message: 'op=flatten 至少需要 2 个节点 id',
      });
    }
  });

/**
 * 组件操作入参:扁平结构 + 运行时按 op 精查。
 * 不用 discriminatedUnion 生成 oneOf——调用方漏传 op 时,JSON-Schema 校验会把
 * 每个分支的缺失字段全列一遍(oneOf 复读机式报错);扁平化后缺 op 只有一行错,
 * op 合法但缺字段时由 superRefine 给出中文定位。
 */
export const manageComponentsSchema = z
  .object({
    op: z
      .enum([
        'create_component',
        'create_instance',
        'detach_instance',
        'import_component',
        'swap_component',
        'set_instance_properties',
        'combine_as_variants',
        'copy_overrides',
        'apply_overrides',
        'sync_overrides',
      ])
      .describe('组件操作类型'),
    ids: z
      .array(z.string())
      .optional()
      .describe(
        '节点 id 列表;除 import_component 外全部 op 必填(create_component 为要固化的节点,其余为实例/组件节点)',
      ),
    name: z
      .string()
      .optional()
      .describe(
        '名称;create_component/import_component/combine_as_variants 可选',
      ),
    key: z
      .string()
      .optional()
      .describe('团队库组件唯一标识 Key(仅 import_component 必填)'),
    componentId: z
      .string()
      .optional()
      .describe('目标组件(COMPONENT)节点 id(仅 swap_component 必填)'),
    properties: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        '变体属性名→值,如 {"状态":"禁用"}(仅 set_instance_properties 必填);可调属性需从 jsd_find/jsd_get_selection 返回的 variantGroupProperties 获取,属性名必须完全匹配',
      ),
    sourceId: z
      .string()
      .optional()
      .describe(
        '源实例(INSTANCE)节点 id;copy_overrides/apply_overrides/sync_overrides 必填',
      ),
    swapToSource: z
      .boolean()
      .optional()
      .describe(
        '套用时是否把目标实例 swap 成源组件,默认 false(swap 会丢失目标既有覆盖,需显式开启)',
      ),
  })
  .superRefine((v, ctx) => {
    const missing = (field: string): void => {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `op=${v.op} 缺少必填字段 ${field}`,
      });
    };
    const hasIds =
      Array.isArray(v.ids) &&
      v.ids.length > 0 &&
      v.ids.every((x) => typeof x === 'string');
    switch (v.op) {
      case 'create_component':
      case 'create_instance':
      case 'detach_instance':
      case 'swap_component':
      case 'set_instance_properties':
      case 'combine_as_variants':
        if (!hasIds) missing('ids');
        break;
      case 'import_component':
        if (typeof v.key !== 'string' || v.key.length === 0) missing('key');
        break;
      case 'copy_overrides':
        if (typeof v.sourceId !== 'string' || v.sourceId.length === 0)
          missing('sourceId');
        break;
      case 'apply_overrides':
        if (!hasIds) missing('ids');
        if (typeof v.sourceId !== 'string' || v.sourceId.length === 0)
          missing('sourceId');
        break;
      case 'sync_overrides':
        if (!hasIds) missing('ids');
        if (typeof v.sourceId !== 'string' || v.sourceId.length === 0)
          missing('sourceId');
        break;
    }
    if (v.op === 'swap_component' && typeof v.componentId !== 'string') {
      missing('componentId');
    }
    if (
      v.op === 'set_instance_properties' &&
      (v.properties == null || typeof v.properties !== 'object')
    ) {
      missing('properties');
    }
  });

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
export const listStylesSchema = z.object({});
export const getPageStructureSchema = z.object({});

/** 图片填充入参:server 读本地文件,经二进制通道传给插件 */
export const fillImageSchema = z.object({
  ids: z.array(z.string()).describe('要填充图片的节点 id 列表'),
  sourcePath: z.string().describe('本地图片文件绝对路径,如 /tmp/poster.png'),
});
export type FillImageParams = z.infer<typeof fillImageSchema>;

/** 平台特有操作(platform_op)入参:通用通道,op 名由 ping.capabilities 告知 */
export const platformOpParamsSchema = z.object({
  op: z
    .string()
    .describe(
      '平台特有操作名(如 figma_variables_create)。先 jsd_ping 看 capabilities 与平台支持列表',
    ),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('操作参数,结构随 op 而定'),
});
export type PlatformOpParams = z.infer<typeof platformOpParamsSchema>;

// ---- 批量编排(jsd_batch):服务端顺序执行多步工具调用,前步结果注入后步 ----

export const batchCallSchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      '步骤唯一标识,供后续步骤以双花括号占位符(id.字段路径)引用本步结果;缺省自动命名 step1/step2/…',
    ),
  tool: z
    .string()
    .describe(
      '要执行的 jsd_* 工具名,如 jsd_create_nodes / jsd_find / jsd_update_node',
    ),
  args: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      '该工具的完整入参;任意位置的字符串值里可放双花括号占位符(步骤id.字段路径)引用先前步骤结果',
    ),
  continueOnError: z
    .boolean()
    .optional()
    .describe(
      '本步【执行】失败时是否继续后续步骤;仅对执行失败生效,id 重复/未知工具/引用解析失败一律中止',
    ),
});
export type BatchCall = z.infer<typeof batchCallSchema>;

/** 与 manageComponentsSchema 同思路:扁平结构,schema 保持简单,语义约束由运行时给出 */
export const batchSchema = z.object({
  calls: z
    .array(batchCallSchema)
    .min(1)
    .max(50)
    .describe('按数组顺序执行的步骤列表'),
  stopOnError: z
    .boolean()
    .optional()
    .describe(
      '全局失败策略,默认 true=任一步执行失败即停止,false=配合单步走完全部',
    ),
});
export type BatchParams = z.infer<typeof batchSchema>;

export const batchResultSchema = z.object({
  ok: z
    .boolean()
    .describe('全部步骤均执行且成功(executed 小于 total 即为中途停止)'),
  executed: z.number().int().min(0).describe('实际产生结果的步骤数'),
  total: z.number().int().min(0).describe('计划的步骤总数'),
  results: z
    .array(
      z.object({
        id: z.string(),
        tool: z.string(),
        ok: z.boolean(),
        data: z
          .unknown()
          .optional()
          .describe('成功时该工具的 structuredContent'),
        error: z.string().optional().describe('失败原因(人读文本)'),
      }),
    )
    .describe('各步骤结果,顺序与入参一致;被中止而未执行的步骤不出现在此列表'),
});
export type BatchResult = z.infer<typeof batchResultSchema>;

/** 平台特有操作结果:plugin 统一回 {ok, data},data 结构随 op 而定 */
export const platformOpResultSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
});
export type PlatformOpResult = z.infer<typeof platformOpResultSchema>;

// ---- 由 schema 推导的领域类型(core 与 index.ts 复用,唯一真源) ----

export type SerializedNodeType = z.infer<typeof nodeTypeSchema>;
export type FindParams = z.infer<typeof findSchema>;
export type FindResult = z.infer<typeof findResultSchema>;
export type UpdateNodeProps = z.infer<typeof updateNodePropsSchema>;
export type ListFontsResult = z.infer<typeof listFontsResultSchema>;
export type ListStylesResult = z.infer<typeof listStylesResultSchema>;
export type PageStructureResult = z.infer<typeof pageStructureResultSchema>;

/** 插件 exportNodes 原始返回(keyed by id,含二进制字节) */
export interface RawExportFile {
  id: string;
  name: string;
  format: 'PNG' | 'JPG' | 'SVG' | 'PDF';
  scale: number;
  mimeType: string;
  bytes: Uint8Array;
}
