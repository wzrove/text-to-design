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
  width: z.number().optional().describe('宽度(px)'),
  height: z.number().optional().describe('高度(px)'),
  rotation: z
    .number()
    .optional()
    .describe('旋转角度(deg,绕节点自身左上角原点,x/y 不变)'),
  opacity: z.number().optional().describe('不透明度 0-1'),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
});

export const strokePropsSchema = z.object({
  strokes: z
    .array(paintSchema)
    .optional()
    .describe('描边列表(Paint 数组;整体替换,非合并,需保留的描边要一并传入)'),
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
  cornerRadius: z
    .number()
    .optional()
    .describe(
      '圆角半径(px),四角统一;仅 FRAME/RECTANGLE/ELLIPSE/POLYGON/STAR/VECTOR/BOOLEAN_OPERATION 生效(LINE/TEXT 无圆角)',
    ),
  topLeftRadius: z
    .number()
    .optional()
    .describe('左上圆角(px),适用类型同 cornerRadius'),
  topRightRadius: z
    .number()
    .optional()
    .describe('右上圆角(px),适用类型同 cornerRadius'),
  bottomLeftRadius: z
    .number()
    .optional()
    .describe('左下圆角(px),适用类型同 cornerRadius'),
  bottomRightRadius: z
    .number()
    .optional()
    .describe('右下圆角(px),适用类型同 cornerRadius'),
});

export const textPropsSchema = z.object({
  characters: z.string().optional().describe('文本内容(仅 TEXT 节点生效)'),
  fontSize: z.number().optional().describe('字号(px)'),
  fontName: fontNameSchema
    .optional()
    .describe(
      '字体:{family,style};需精确匹配,建议先用 jsd_list_fonts 查可用字体(不可用时静默回退默认字体)',
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
    .describe(
      '文本自适应:NONE=固定尺寸|WIDTH_AND_HEIGHT=按内容撑开(缺省,此时修改 width/height 会被覆盖)|HEIGHT=固定宽自适应高|TRUNCATE=截断。要固定文本框尺寸必须设为 NONE',
    ),
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
      '自动布局方向:NONE|HORIZONTAL|VERTICAL,仅 FRAME 节点生效。传 itemSpacing/padding*/primaryAxis* 等布局属性前必须先设为 HORIZONTAL 或 VERTICAL',
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
  fills: z
    .array(paintSchema)
    .optional()
    .describe(
      '填充列表(Paint 数组;整体替换,非合并,需保留的现有填充项要一并传入)',
    ),
  blendMode: blendModeSchema.optional(),
  effects: z
    .array(effectSchema)
    .optional()
    .describe('效果列表(阴影/模糊,可多层叠加;整体替换,非合并)'),
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
    .describe('环形路径参数(弧线),仅 ELLIPSE 节点生效'),
});
