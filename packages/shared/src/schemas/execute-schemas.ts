import { z } from 'zod';

import {
  BOOLEAN_OPERATION_DESCRIBE,
  BOOLEAN_OPERATIONS,
} from '../dicts/boolean-operation';
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
import { nodeTypeSchema } from './node-type';

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

/**
 * 子节点直通 schema。
 *
 * 不能引用 executeNodeSchema:那是 10 种节点类型的 discriminatedUnion,zod 导出 JSON Schema
 * 时无法通过 $ref 复用循环引用,只能整体内联——单个 create_* 工具的 inputSchema 因此膨胀到
 * 约 18 万字符。这里只列判别字段与最常用定位字段,其余字段 catchall 放行:引擎收到的数据与
 * 严格校验时完全一致,字段写错由引擎报错;顶层入参本身仍是完整严格校验。
 */
const childNodeSchema: z.ZodType<ExecuteOp> = z
  .object({
    type: nodeTypeSchema.describe('schema.executeSchemas.type'),
    name: z.string().optional(),
    x: z.number().optional().describe('schema.executeSchemas.x'),
    y: z.number().optional().describe('schema.executeSchemas.y'),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .catchall(z.unknown());

// ---- 基础字段(所有节点共享) ----
const baseNodeFields = {
  name: z.string().optional(),
  x: z.number().optional().describe('schema.executeSchemas.x2'),
  y: z.number().optional().describe('schema.executeSchemas.y2'),
  width: z.number().optional().describe('schema.executeSchemas.width'),
  height: z.number().optional().describe('schema.executeSchemas.height'),
  rotation: z.number().optional().describe('schema.executeSchemas.rotation'),
  opacity: z.number().optional().describe('schema.executeSchemas.opacity'),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  isMask: z.boolean().optional(),
  children: z
    .array(childNodeSchema)
    .max(100)
    .optional()
    .describe(
      '子节点数组(递归嵌套,最多 100 个直接子节点;更大的结构建议分批创建后用 jsd_manage_nodes op=reparent 归组)。子节点可使用的字段与顶层 create 入参一致(fills/strokes/cornerRadius/effects 等均可用);x/y 相对父节点,未传 x/y 会叠放在父节点原点(0,0)——非 auto-layout 容器需为每个子节点指定相对坐标',
    ),
};

// 视觉字段(填充/描边/效果等,所有节点共享)
const visualFields = {
  fills: z
    .array(paintSchema)
    .optional()
    .describe(
      '填充列表(Paint 数组)。缺省时的引擎默认:FRAME 为白底;非 FRAME 图形若同时传了 strokes,则填充置空(纯描边,不再被引擎塞 #CCCCCC 灰底)——需要底色请显式传 fills',
    ),
  strokes: z
    .array(paintSchema)
    .optional()
    .describe('schema.executeSchemas.strokes'),
  strokeWeight: z
    .number()
    .optional()
    .describe('schema.executeSchemas.strokeWeight'),
  strokeTopWeight: z
    .number()
    .optional()
    .describe('schema.executeSchemas.strokeTopWeight'),
  strokeBottomWeight: z
    .number()
    .optional()
    .describe('schema.executeSchemas.strokeBottomWeight'),
  strokeLeftWeight: z
    .number()
    .optional()
    .describe('schema.executeSchemas.strokeLeftWeight'),
  strokeRightWeight: z
    .number()
    .optional()
    .describe('schema.executeSchemas.strokeRightWeight'),
  strokeAlign: z
    .enum(['CENTER', 'INSIDE', 'OUTSIDE'])
    .optional()
    .describe('schema.executeSchemas.strokeAlign'),
  strokeCap: z
    .enum(['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL'])
    .optional()
    .describe('schema.executeSchemas.strokeCap'),
  strokeJoin: z
    .enum(['MITER', 'BEVEL', 'ROUND'])
    .optional()
    .describe('schema.executeSchemas.strokeJoin'),
  dashPattern: z
    .array(z.number())
    .optional()
    .describe('schema.executeSchemas.dashPattern'),
  blendMode: blendModeSchema.optional(),
  effects: z
    .array(effectSchema)
    .optional()
    .describe('schema.executeSchemas.effects'),
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
    .describe('schema.executeSchemas.vertical'),
  clipsContent: z
    .boolean()
    .optional()
    .describe('schema.executeSchemas.clipsContent'),
  cornerSmoothing: z
    .number()
    .optional()
    .describe('schema.executeSchemas.cornerSmoothing'),
  layoutGrids: z
    .array(layoutGridSchema)
    .optional()
    .describe('schema.executeSchemas.layoutGrids'),
};

/**
 * 圆角字段(FRAME/RECTANGLE/ELLIPSE/POLYGON/STAR/VECTOR 等共用)。
 *
 * 单独抽出来是因为 FRAME 原来**没有**这些字段:调用方给 `jsd_create_frame`
 * 传 `cornerRadius` 会被 strict schema 拒掉,而报错只说「must NOT have
 * additional properties」并把全部入参字段列进去,看着像每个字段都非法。
 * 实际引擎是支持 FRAME 圆角的(jsd_set_cornerRadius 也写明 FRAME 生效)。
 */
const cornerFields = {
  cornerRadius: z
    .number()
    .optional()
    .describe('schema.executeSchemas.cornerRadius'),
  topLeftRadius: z
    .number()
    .optional()
    .describe('schema.executeSchemas.topLeftRadius'),
  topRightRadius: z
    .number()
    .optional()
    .describe('schema.executeSchemas.topRightRadius'),
  bottomLeftRadius: z
    .number()
    .optional()
    .describe('schema.executeSchemas.bottomLeftRadius'),
  bottomRightRadius: z
    .number()
    .optional()
    .describe('schema.executeSchemas.bottomRightRadius'),
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
    paddingTop: z
      .number()
      .optional()
      .describe('schema.executeSchemas.paddingTop'),
    paddingRight: z
      .number()
      .optional()
      .describe('schema.executeSchemas.paddingRight'),
    paddingBottom: z
      .number()
      .optional()
      .describe('schema.executeSchemas.paddingBottom'),
    paddingLeft: z
      .number()
      .optional()
      .describe('schema.executeSchemas.paddingLeft'),
    primaryAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('schema.executeSchemas.primaryAxisSizingMode'),
    counterAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('schema.executeSchemas.counterAxisSizingMode'),
    primaryAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
      .optional()
      .describe(
        '主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN;设为 SPACE_BETWEEN 时 itemSpacing 被忽略(子项均匀分布)',
      ),
    counterAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER'])
      .optional()
      .describe('schema.executeSchemas.counterAxisAlignItems'),
    layoutGrow: z
      .number()
      .optional()
      .describe('schema.executeSchemas.layoutGrow'),
    layoutAlign: z
      .enum(['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'])
      .optional()
      .describe('schema.executeSchemas.layoutAlign'),
    ...cornerFields,
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
    ...cornerFields,
    ...visualFields,
  })
  .strict()
  .describe('schema.executeSchemas.type2');

const ellipseNodeSchema = z
  .object({
    type: z.literal('ELLIPSE'),
    ...baseNodeFields,
    cornerRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.cornerRadius2'),
    arcData: z
      .object({
        startingAngle: z
          .number()
          .describe('schema.executeSchemas.startingAngle'),
        endingAngle: z.number().describe('schema.executeSchemas.endingAngle'),
        innerRadius: z.number().describe('schema.executeSchemas.innerRadius'),
      })
      .optional()
      .describe('schema.executeSchemas.innerRadius2'),
    ...visualFields,
  })
  .strict()
  .describe('schema.executeSchemas.innerRadius3');

const lineNodeSchema = z
  .object({
    type: z.literal('LINE'),
    ...baseNodeFields,
    ...visualFields,
  })
  .strict()
  .describe('schema.executeSchemas.type3');

const polygonNodeSchema = z
  .object({
    type: z.literal('POLYGON'),
    ...baseNodeFields,
    pointCount: z.number().describe('schema.executeSchemas.pointCount'),
    cornerRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.cornerRadius3'),
    topLeftRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.topLeftRadius2'),
    topRightRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.topRightRadius2'),
    bottomLeftRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.bottomLeftRadius2'),
    bottomRightRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.bottomRightRadius2'),
    ...visualFields,
  })
  .strict()
  .describe('schema.executeSchemas.bottomRightRadius3');

const starNodeSchema = z
  .object({
    type: z.literal('STAR'),
    ...baseNodeFields,
    pointCount: z.number().describe('schema.executeSchemas.pointCount2'),
    innerRadius: z.number().describe('schema.executeSchemas.innerRadius4'),
    cornerRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.cornerRadius4'),
    topLeftRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.topLeftRadius3'),
    topRightRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.topRightRadius3'),
    bottomLeftRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.bottomLeftRadius3'),
    bottomRightRadius: z
      .number()
      .optional()
      .describe('schema.executeSchemas.bottomRightRadius4'),
    ...visualFields,
  })
  .strict()
  .describe('schema.executeSchemas.bottomRightRadius5');

const vectorNodeSchema = z
  .object({
    type: z.literal('VECTOR'),
    ...baseNodeFields,
    vectorPaths: z
      .array(vectorPathSchema)
      .describe('schema.executeSchemas.vectorPaths'),
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
    fontSize: z.number().optional().describe('schema.executeSchemas.fontSize'),
    fontName: fontNameSchema
      .optional()
      .describe(
        '字体:{family,style},如 {family:"PingFang SC",style:"Regular"};需精确匹配,建议先用 jsd_list_fonts 查可用字体(不可用时静默回退默认字体)',
      ),
    textAlignHorizontal: z
      .enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'])
      .optional()
      .describe('schema.executeSchemas.textAlignHorizontal'),
    textAlignVertical: z
      .enum(['TOP', 'CENTER', 'BOTTOM'])
      .optional()
      .describe('schema.executeSchemas.textAlignVertical'),
    textAutoResize: z
      .enum(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'])
      .optional()
      .describe(
        '文本自适应:NONE=固定尺寸|WIDTH_AND_HEIGHT=按内容撑开(缺省,此时显式 width/height 会被覆盖)|HEIGHT=固定宽自适应高|TRUNCATE=截断。要固定文本框尺寸必须设为 NONE',
      ),
    textCase: z
      .enum(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE'])
      .optional()
      .describe('schema.executeSchemas.textCase'),
    textDecoration: z
      .enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH'])
      .optional()
      .describe('schema.executeSchemas.textDecoration'),
    lineHeight: lineHeightSchema
      .optional()
      .describe('schema.executeSchemas.lineHeight'),
    letterSpacing: letterSpacingSchema
      .optional()
      .describe('schema.executeSchemas.letterSpacing'),
    ...visualFields,
  })
  .strict()
  .describe('schema.executeSchemas.letterSpacing2');

const groupNodeSchema = z
  .object({
    type: z.literal('GROUP'),
    ...baseNodeFields,
    // GROUP 运行时要求至少 2 个子节点(core/buildNode),schema 前置拦截
    children: z
      .array(childNodeSchema)
      .min(2)
      .max(100)
      .describe('schema.executeSchemas.children'),
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
    paddingTop: z
      .number()
      .optional()
      .describe('schema.executeSchemas.paddingTop2'),
    paddingRight: z
      .number()
      .optional()
      .describe('schema.executeSchemas.paddingRight2'),
    paddingBottom: z
      .number()
      .optional()
      .describe('schema.executeSchemas.paddingBottom2'),
    paddingLeft: z
      .number()
      .optional()
      .describe('schema.executeSchemas.paddingLeft2'),
    primaryAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('schema.executeSchemas.primaryAxisSizingMode2'),
    counterAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('schema.executeSchemas.counterAxisSizingMode2'),
    primaryAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
      .optional()
      .describe(
        '主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN;设为 SPACE_BETWEEN 时 itemSpacing 被忽略(子项均匀分布)',
      ),
    counterAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER'])
      .optional()
      .describe('schema.executeSchemas.counterAxisAlignItems2'),
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
  .describe('schema.executeSchemas.path');

const booleanOperationNodeSchema = z
  .object({
    type: z.literal('BOOLEAN_OPERATION'),
    ...baseNodeFields,
    booleanOperation: z
      .enum(BOOLEAN_OPERATIONS)
      .describe(BOOLEAN_OPERATION_DESCRIBE),
    children: z
      .array(childNodeSchema)
      .min(2)
      .describe('schema.executeSchemas.children2'),
    ...visualFields,
  })
  .strict()
  .describe('schema.executeSchemas.children3');

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

// 各类型子 schema 导出:供 per-type 拆分工具(create.ts 等)取单节点负载做 inputSchema,
// 每个工具只用自己那一类,避免整体 executeNodeSchema 大表挑字段。
export {
  booleanOperationNodeSchema,
  ellipseNodeSchema,
  frameNodeSchema,
  groupNodeSchema,
  lineNodeSchema,
  polygonNodeSchema,
  rectangleNodeSchema,
  starNodeSchema,
  textNodeSchema,
  vectorNodeSchema,
};

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
