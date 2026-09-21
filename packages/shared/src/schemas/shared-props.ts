import { z } from 'zod';

import {
  blendModeSchema,
  constraintTypeSchema,
  effectSchema,
  fontNameSchema,
  layoutGridSchema,
  letterSpacingSchema,
  lineHeightSchema,
  paintSchema,
} from './base';

// ---- 共享 schema (execute / update 共用) ----

export const transformPropsSchema = z.object({
  x: z
    .number()
    .optional()
    .describe(
      'X 坐标(px,相对父节点;auto-layout 子节点的位置由父容器接管,修改可能被布局覆盖)',
    ),
  y: z
    .number()
    .optional()
    .describe(
      'Y 坐标(px,相对父节点;auto-layout 子节点的位置由父容器接管,修改可能被布局覆盖)',
    ),
  width: z.number().optional().describe('schema.sharedProps.width'),
  height: z.number().optional().describe('schema.sharedProps.height'),
  rotation: z.number().optional().describe('schema.sharedProps.rotation'),
  opacity: z.number().optional().describe('schema.sharedProps.opacity'),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
});

/**
 * resize 工具的尺寸字段。
 *
 * 单独一份(不直接引用 transformPropsSchema.shape.width/height):resize 允许
 * **零轴**(横线 height=0 / 竖线 width=0),引擎侧由 core/update.ts 的 LINE 零轴
 * 豁免兜底过校验;而插入新节点时 width/height 不预置、零轴只在 LINE 上合法,
 * 两边约束不同,故分开描述,避免调用方以为 resize 也要 >= 0.01。
 */
export const resizePropsSchema = z.object({
  width: z
    .number()
    .min(0)
    .optional()
    .describe(
      '宽度(px)。横线(高度为 0 的 LINE)传 0;其他类型最低 0.01(引擎 resize 校验),低于会明确报错',
    ),
  height: z
    .number()
    .min(0)
    .optional()
    .describe(
      '高度(px)。竖线(宽度为 0 的 LINE)传 0;其他类型最低 0.01(引擎 resize 校验),低于会明确报错',
    ),
});

/** 多边形/星形形状参数 */
export const shapePropsSchema = z.object({
  pointCount: z.number().optional().describe('schema.sharedProps.pointCount'),
  innerRadius: z.number().optional().describe('schema.sharedProps.innerRadius'),
});

export const strokePropsSchema = z.object({
  strokes: z
    .array(paintSchema)
    .optional()
    .describe('schema.sharedProps.strokes'),
  strokeWeight: z
    .number()
    .optional()
    .describe('schema.sharedProps.strokeWeight'),
  strokeTopWeight: z
    .number()
    .optional()
    .describe('schema.sharedProps.strokeTopWeight'),
  strokeBottomWeight: z
    .number()
    .optional()
    .describe('schema.sharedProps.strokeBottomWeight'),
  strokeLeftWeight: z
    .number()
    .optional()
    .describe('schema.sharedProps.strokeLeftWeight'),
  strokeRightWeight: z
    .number()
    .optional()
    .describe('schema.sharedProps.strokeRightWeight'),
  strokeAlign: z
    .enum(['CENTER', 'INSIDE', 'OUTSIDE'])
    .optional()
    .describe('schema.sharedProps.strokeAlign'),
  strokeCap: z
    .enum(['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL'])
    .optional()
    .describe('schema.sharedProps.strokeCap'),
  strokeJoin: z
    .enum(['MITER', 'BEVEL', 'ROUND'])
    .optional()
    .describe('schema.sharedProps.strokeJoin'),
  dashPattern: z
    .array(z.number())
    .optional()
    .describe('schema.sharedProps.dashPattern'),
  strokeStyleId: z
    .string()
    .optional()
    .describe('schema.sharedProps.strokeStyleId'),
});

export const cornerPropsSchema = z.object({
  cornerRadius: z
    .number()
    .optional()
    .describe(
      '圆角半径(px),四角统一;仅 FRAME/RECTANGLE/ELLIPSE/POLYGON/STAR/VECTOR/BOOLEAN_OPERATION 生效(LINE/TEXT 无圆角)',
    ),
  topLeftRadius: z
    .number()
    .optional()
    .describe('schema.sharedProps.topLeftRadius'),
  topRightRadius: z
    .number()
    .optional()
    .describe('schema.sharedProps.topRightRadius'),
  bottomLeftRadius: z
    .number()
    .optional()
    .describe('schema.sharedProps.bottomLeftRadius'),
  bottomRightRadius: z
    .number()
    .optional()
    .describe('schema.sharedProps.bottomRightRadius'),
});

export const textPropsSchema = z.object({
  characters: z.string().optional().describe('schema.sharedProps.characters'),
  fontSize: z.number().optional().describe('schema.sharedProps.fontSize'),
  fontName: fontNameSchema
    .optional()
    .describe(
      '字体:{family,style};需精确匹配,建议先用 jsd_list_fonts 查可用字体(不可用时静默回退默认字体)',
    ),
  textAlignHorizontal: z
    .enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'])
    .optional()
    .describe('schema.sharedProps.textAlignHorizontal'),
  textAlignVertical: z
    .enum(['TOP', 'CENTER', 'BOTTOM'])
    .optional()
    .describe('schema.sharedProps.textAlignVertical'),
  textAutoResize: z
    .enum(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'])
    .optional()
    .describe(
      '文本自适应:NONE=固定尺寸|WIDTH_AND_HEIGHT=按内容撑开(缺省,此时修改 width/height 会被覆盖)|HEIGHT=固定宽自适应高|TRUNCATE=截断。要固定文本框尺寸必须设为 NONE',
    ),
  textCase: z
    .enum(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE'])
    .optional()
    .describe('schema.sharedProps.textCase'),
  textDecoration: z
    .enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH'])
    .optional()
    .describe('schema.sharedProps.textDecoration'),
  lineHeight: lineHeightSchema
    .optional()
    .describe('schema.sharedProps.lineHeight'),
  letterSpacing: letterSpacingSchema
    .optional()
    .describe('schema.sharedProps.letterSpacing'),
  textStyleId: z.string().optional().describe('schema.sharedProps.textStyleId'),
  textTruncation: z
    .enum(['DISABLED', 'ENDING'])
    .optional()
    .describe('schema.sharedProps.textTruncation'),
  maxLines: z.number().optional().describe('schema.sharedProps.maxLines'),
});

export const autoLayoutPropsSchema = z.object({
  layoutMode: z
    .enum(['NONE', 'HORIZONTAL', 'VERTICAL'])
    .optional()
    .describe(
      '自动布局方向:NONE|HORIZONTAL|VERTICAL,仅 FRAME 节点生效。传 itemSpacing/padding*/primaryAxis* 等布局属性前必须先设为 HORIZONTAL 或 VERTICAL',
    ),
  itemSpacing: z
    .number()
    .optional()
    .describe(
      '自动布局项间距(px);primaryAxisAlignItems=SPACE_BETWEEN 时该项被忽略(子项均匀分布)',
    ),
  paddingTop: z.number().optional().describe('schema.sharedProps.paddingTop'),
  paddingRight: z
    .number()
    .optional()
    .describe('schema.sharedProps.paddingRight'),
  paddingBottom: z
    .number()
    .optional()
    .describe('schema.sharedProps.paddingBottom'),
  paddingLeft: z.number().optional().describe('schema.sharedProps.paddingLeft'),
  primaryAxisSizingMode: z
    .enum(['FIXED', 'AUTO'])
    .optional()
    .describe('schema.sharedProps.primaryAxisSizingMode'),
  counterAxisSizingMode: z
    .enum(['FIXED', 'AUTO'])
    .optional()
    .describe('schema.sharedProps.counterAxisSizingMode'),
  primaryAxisAlignItems: z
    .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
    .optional()
    .describe(
      '主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN;设为 SPACE_BETWEEN 时 itemSpacing 被忽略(子项均匀分布)',
    ),
  counterAxisAlignItems: z
    .enum(['MIN', 'MAX', 'CENTER'])
    .optional()
    .describe('schema.sharedProps.counterAxisAlignItems'),
  layoutGrow: z.number().optional().describe('schema.sharedProps.layoutGrow'),
  layoutAlign: z
    .enum(['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'])
    .optional()
    .describe('schema.sharedProps.layoutAlign'),
});

export const visualPropsSchema = z.object({
  fills: z
    .array(paintSchema)
    .optional()
    .describe(
      '填充列表(Paint 数组;整体替换,非合并,需保留的现有填充项要一并传入)',
    ),
  fillStyleId: z.string().optional().describe('schema.sharedProps.fillStyleId'),
  blendMode: blendModeSchema.optional(),
  effectStyleId: z
    .string()
    .optional()
    .describe('schema.sharedProps.effectStyleId'),
  effects: z
    .array(effectSchema)
    .optional()
    .describe('schema.sharedProps.effects'),
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
    .describe('schema.sharedProps.vertical'),
  clipsContent: z
    .boolean()
    .optional()
    .describe('schema.sharedProps.clipsContent'),
  cornerSmoothing: z
    .number()
    .optional()
    .describe('schema.sharedProps.cornerSmoothing'),
  layoutGrids: z
    .array(layoutGridSchema)
    .optional()
    .describe('schema.sharedProps.layoutGrids'),
  arcData: z
    .object({
      startingAngle: z.number().describe('schema.sharedProps.startingAngle'),
      endingAngle: z.number().describe('schema.sharedProps.endingAngle'),
      innerRadius: z.number().describe('schema.sharedProps.innerRadius2'),
    })
    .optional()
    .describe('schema.sharedProps.innerRadius3'),
});
