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
  vectorPathSchema,
} from './base';
import type { ExecuteOp } from './execute-op';

// 从 discriminated union 派生的平面类型(所有字段 optional,与 ExecuteOp 兼容)
type MergeUnion<T> = T extends unknown ? { [K in keyof T]?: T[K] } : never;
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
  x: z
    .number()
    .optional()
    .describe('X 坐标(px,相对父节点,缺省 0;根节点的摆放由 placement 控制)'),
  y: z
    .number()
    .optional()
    .describe('Y 坐标(px,相对父节点,缺省 0;根节点的摆放由 placement 控制)'),
  width: z.number().optional().describe('宽度(px)'),
  height: z.number().optional().describe('高度(px)'),
  rotation: z
    .number()
    .optional()
    .describe('旋转角度(deg,绕节点自身左上角原点,x/y 不变)'),
  opacity: z.number().optional().describe('不透明度 0-1'),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  isMask: z.boolean().optional(),
  children: z
    .array(z.lazy(() => executeNodeSchema))
    .max(100)
    .optional()
    .describe(
      '子节点数组(递归嵌套,最多 100 个直接子节点;更大的结构建议分批创建后用 jsd_manage_nodes op=reparent 归组)。子节点 x/y 相对父节点,未传 x/y 会叠放在父节点原点(0,0)——非 auto-layout 容器需为每个子节点指定相对坐标',
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
  .strict()
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
  .strict()
  .describe(
    'FRAME=容器(可 auto-layout)。注意:未显式传 fills 时引擎默认白底,透明容器请显式传 fills:[{type:"SOLID",color:{r:0,g:0,b:0},opacity:0}]',
  );

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
  .strict()
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
  .strict()
  .describe('ELLIPSE=椭圆(配合 arcData 可画环)');

const lineNodeSchema = z
  .object({
    type: z.literal('LINE'),
    ...baseNodeFields,
    ...visualFields,
  })
  .strict()
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
  .strict()
  .describe('POLYGON=多边形(配合 pointCount)');

const starNodeSchema = z
  .object({
    type: z.literal('STAR'),
    ...baseNodeFields,
    pointCount: z.number().describe('星形角点数,如 5=五角星'),
    innerRadius: z
      .number()
      .describe('星形内半径比例(0-1,相对外半径),值越小角越尖锐'),
    cornerRadius: z.number().optional().describe('圆角半径(px)'),
    topLeftRadius: z.number().optional().describe('左上圆角(px)'),
    topRightRadius: z.number().optional().describe('右上圆角(px)'),
    bottomLeftRadius: z.number().optional().describe('左下圆角(px)'),
    bottomRightRadius: z.number().optional().describe('右下圆角(px)'),
    ...visualFields,
  })
  .strict()
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
  .strict()
  .describe(
    'VECTOR=矢量(配合 vectorPaths 传 SVG path data)。注意:当前平台创建后 vectorPaths 偶发丢失/形变,短直线段建议改用 LINE+rotation 更稳定',
  );

const textNodeSchema = z
  .object({
    type: z.literal('TEXT'),
    ...baseNodeFields,
    characters: z
      .string()
      .describe(
        '文本内容,如 "Hello World"。注意:个别 emoji 依赖客户端字体可能缺字(渲染为 ☒),上线前逐个目检',
      ),
    fontSize: z.number().optional().describe('字号(px),默认 16'),
    fontName: fontNameSchema
      .optional()
      .describe(
        '字体:{family,style},如 {family:"PingFang SC",style:"Regular"};需精确匹配,建议先用 jsd_list_fonts 查可用字体(不可用时静默回退默认字体)',
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
        '文本自适应:NONE=固定尺寸|WIDTH_AND_HEIGHT=按内容撑开(缺省,此时显式 width/height 会被覆盖)|HEIGHT=固定宽自适应高|TRUNCATE=截断。要固定文本框尺寸必须设为 NONE',
      ),
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
  .strict()
  .describe('TEXT=文本(配合 characters/fontSize/fontName 等)');

const groupNodeSchema = z
  .object({
    type: z.literal('GROUP'),
    ...baseNodeFields,
    // GROUP 运行时要求至少 2 个子节点(core/buildNode),schema 前置拦截
    children: z
      .array(z.lazy(() => executeNodeSchema))
      .min(2)
      .max(100)
      .describe('子节点数组,至少 2 个;递归嵌套,最多 100 个直接子节点'),
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
  .strict()
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
  .strict()
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
