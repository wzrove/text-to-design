import { z } from 'zod';

import {
  BOOLEAN_OPERATION_DESCRIBE,
  BOOLEAN_OPERATIONS,
} from '../dicts/boolean-operation';
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

/** 从判别联合派生的扁平类型(全可选)。与手写 `ExecuteOp` 的互证见文件尾 */
export type ExecuteOpFromSchema = {
  [K in keyof z.infer<typeof executeNodeSchema>]?: z.infer<
    typeof executeNodeSchema
  >[K];
};

/**
 * 子节点直通 schema。
 *
 * 不能引用 executeNodeSchema:那是 10 种节点类型的 discriminatedUnion,zod 导出 JSON Schema
 * 时无法通过 $ref 复用循环引用,只能整体内联——单个 create_* 工具的 inputSchema 因此膨胀到
 * 约 18 万字符。这里只列判别字段与最常用定位字段,其余字段 catchall 放行:引擎收到的数据与
 * 严格校验时完全一致,字段写错由引擎报错;顶层入参本身仍是完整严格校验。
 */
export const childNodeSchema = z
  .object({
    type: nodeTypeSchema.describe('schema.executeSchemas.type'),
    name: z.string().optional(),
    x: z.number().optional().describe('schema.executeSchemas.x'),
    y: z.number().optional().describe('schema.executeSchemas.y'),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .catchall(z.unknown());

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
  isMask: z.boolean().optional().describe('schema.executeSchemas.isMask'),
  children: z
    .array(childNodeSchema)
    .max(100)
    .optional()
    .describe('schema.executeSchemas.childrenOf'),
};

/** 视觉字段(填充/描边/效果等,所有节点共享)。
 *  函数而非常量:各类型 schema 在模块顶层就展开它,而 baseNodeFields 之后才轮到
 *  cornerFields 的 const 初始化 —— 常量形态会撞 TDZ。 */
function visualFields() {
  return {
    fills: z
      .array(paintSchema)
      .optional()
      .describe('schema.executeSchemas.fills'),
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
      .enum(STROKE_ALIGN_VALUES)
      .optional()
      .describe('schema.executeSchemas.strokeAlign'),
    strokeCap: z
      .enum(STROKE_CAP_VALUES)
      .optional()
      .describe('schemaValue.strokeCap'),
    strokeJoin: z
      .enum(STROKE_JOIN_VALUES)
      .optional()
      .describe('schemaValue.strokeJoin'),
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
        horizontal: constraintTypeSchema,
        vertical: constraintTypeSchema,
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
    // ---- 样式引用(四个 `*StyleId`)----
    //
    // 为什么必须在这个字段组里:运行时本来就支持(`core/props/writers.ts` 的
    // `supersetWriter` 第一件事就是写这四个键,平台不具备时由能力门控点名跳过),
    // 但创建入参此前只在**修改类**工具上放行(`split-ops.ts` 的 `setFillColorProps` 等)。
    // 于是同一个字段出现两种结果:写进 `children`(该 schema 是 `.catchall` 放行)生效、
    // 写在顶层被 strict 拒掉并报 `Unrecognized key` —— 调用方只能绕道「建完再绑」,
    // 白多一轮往返。平台能力面见 `dicts/platform-knowledge.ts`(jsDesign 只有 styles
    // 这一面)。⚠ 绑了 fill style 的节点回读会带引擎私货 `blendMode:"NOTTHROUGH"`,
    // 读侧已在 `core/serialize.ts` 收口(见 0044)。
    fillStyleId: z
      .string()
      .optional()
      .describe('schema.sharedProps.fillStyleId'),
    strokeStyleId: z
      .string()
      .optional()
      .describe('schema.sharedProps.strokeStyleId'),
    textStyleId: z
      .string()
      .optional()
      .describe('schema.sharedProps.textStyleId'),
    effectStyleId: z
      .string()
      .optional()
      .describe('schema.sharedProps.effectStyleId'),
  };
}

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

/** auto-layout 字段(FRAME / GROUP 共用;由 declareAutoLayoutFields 逐类型声明) */
function autoLayoutFields() {
  return {
    layoutMode: z
      .enum(LAYOUT_MODE_VALUES)
      .optional()
      .describe('schema.executeSchemas.layoutMode'),
    itemSpacing: z
      .number()
      .optional()
      .describe('schema.executeSchemas.itemSpacing'),
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
      .enum(SIZING_MODE_VALUES)
      .optional()
      .describe('schema.executeSchemas.primaryAxisSizingMode'),
    counterAxisSizingMode: z
      .enum(SIZING_MODE_VALUES)
      .optional()
      .describe('schema.executeSchemas.counterAxisSizingMode'),
    primaryAxisAlignItems: z
      .enum(PRIMARY_AXIS_ALIGN_VALUES)
      .optional()
      .describe('schema.executeSchemas.primaryAxisAlignItems'),
    counterAxisAlignItems: z
      .enum(COUNTER_AXIS_ALIGN_VALUES)
      .optional()
      .describe('schema.executeSchemas.counterAxisAlignItems'),
    layoutGrow: z
      .number()
      .optional()
      .describe('schema.executeSchemas.layoutGrow'),
    layoutAlign: z
      .enum(LAYOUT_ALIGN_VALUES)
      .optional()
      .describe('schema.executeSchemas.layoutAlign'),
  };
}

/** 布局字段与 layoutMode 的依赖守卫(FRAME/GROUP 同规则) */
function checkLayoutMode(
  val: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  const hasLayoutFields = [
    'itemSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'primaryAxisSizingMode',
    'counterAxisSizingMode',
    'primaryAxisAlignItems',
    'counterAxisAlignItems',
  ].some((key) => val[key] != null);
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
}

const frameNodeSchema = z
  .object({
    type: z.literal('FRAME'),
    ...baseNodeFields,
    ...autoLayoutFields(),
    ...cornerFields,
    ...visualFields(),
  })
  .strict()
  .superRefine(checkLayoutMode)
  .describe('schema.executeSchemas.frameNote');

const rectangleNodeSchema = z
  .object({
    type: z.literal('RECTANGLE'),
    ...baseNodeFields,
    ...cornerFields,
    ...visualFields(),
  })
  .strict()
  .describe('schema.executeSchemas.type2');

const ellipseNodeSchema = z
  .object({
    type: z.literal('ELLIPSE'),
    ...baseNodeFields,
    cornerRadius: cornerFields.cornerRadius,
    arcData: z
      .object({
        startingAngle: z
          .number()
          .describe('schema.executeSchemas.startingAngle'),
        endingAngle: z.number().describe('schema.executeSchemas.endingAngle'),
        innerRadius: z.number().describe('schema.executeSchemas.innerRadius'),
      })
      .optional()
      .describe('schemaValue.arcData'),
    ...visualFields(),
  })
  .strict()
  .describe('schema.executeSchemas.ellipseNote');

const lineNodeSchema = z
  .object({
    type: z.literal('LINE'),
    ...baseNodeFields,
    ...visualFields(),
  })
  .strict()
  .describe('schema.executeSchemas.type3');

const polygonNodeSchema = z
  .object({
    type: z.literal('POLYGON'),
    ...baseNodeFields,
    pointCount: z.number().describe('schema.executeSchemas.pointCount'),
    ...cornerFields,
    ...visualFields(),
  })
  .strict()
  .describe('schema.executeSchemas.bottomRightRadius3');

const starNodeSchema = z
  .object({
    type: z.literal('STAR'),
    ...baseNodeFields,
    pointCount: z.number().describe('schema.executeSchemas.pointCount2'),
    innerRadius: z.number().describe('schema.executeSchemas.innerRadius4'),
    ...cornerFields,
    ...visualFields(),
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
    ...visualFields(),
  })
  .strict()
  .describe('schema.executeSchemas.vectorNote');

const textNodeSchema = z
  .object({
    type: z.literal('TEXT'),
    ...baseNodeFields,
    characters: z.string().describe('schema.executeSchemas.characters'),
    fontSize: z.number().optional().describe('schema.executeSchemas.fontSize'),
    fontName: fontNameSchema
      .optional()
      .describe('schema.executeSchemas.fontName'),
    textAlignHorizontal: z
      .enum(TEXT_ALIGN_HORIZONTAL_VALUES)
      .optional()
      .describe('schema.executeSchemas.textAlignHorizontal'),
    textAlignVertical: z
      .enum(TEXT_ALIGN_VERTICAL_VALUES)
      .optional()
      .describe('schema.executeSchemas.textAlignVertical'),
    textAutoResize: z
      .enum(TEXT_AUTO_RESIZE_VALUES)
      .optional()
      .describe('schema.executeSchemas.textAutoResize'),
    textCase: z
      .enum(TEXT_CASE_VALUES)
      .optional()
      .describe('schemaValue.textCase'),
    textDecoration: z
      .enum(TEXT_DECORATION_VALUES)
      .optional()
      .describe('schemaValue.textDecoration'),
    lineHeight: lineHeightSchema
      .optional()
      .describe('schema.executeSchemas.lineHeight'),
    letterSpacing: letterSpacingSchema
      .optional()
      .describe('schema.executeSchemas.letterSpacing'),
    // 平台特有超集(仅 Figma):两字段成对使用 —— maxLines 只在
    // textTruncation=ENDING 时有意义(core/serialize.ts 也只回传 ENDING)。
    // 放 TEXT 组而非 base:矩形上传它们本就是错,该被 strict 拒。
    textTruncation: z
      .enum(TEXT_TRUNCATION_VALUES)
      .optional()
      .describe('schema.sharedProps.textTruncation'),
    maxLines: z.number().optional().describe('schema.sharedProps.maxLines'),
    ...visualFields(),
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
    ...autoLayoutFields(),
    ...visualFields(),
  })
  .strict()
  .superRefine(checkLayoutMode)
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
    ...visualFields(),
  })
  .strict()
  .describe('schema.executeSchemas.children3');

// 各类型子 schema 导出:供 per-type 拆分工具(create.ts 等)取单节点负载做 inputSchema,
// 每个工具只用自己那一类,避免整体 executeNodeSchema 大表挑字段。
const executeNodeOpItems = [
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
] as const;

/**
 * 导出: discriminated union on `type`(用于 JSON Schema 生成,LLM 看到按 type 分组的字段)。
 */
export const executeNodeSchema: z.ZodType<ExecuteOp> = z.discriminatedUnion(
  'type',
  executeNodeOpItems,
);

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

// ---- 手写 ExecuteOp 与派生类型的一致性断言(漂移在编译期失败) ----
// 守卫 `textTruncation` / `maxLines` 那个 bug:它们在 `ExecuteOp` 与 `core/serialize.ts` 里
// 都有、schema 里却没有,创建路径传它们直接被 `.strict()` 拒,且没有任何编译期信号。
// 方向必须逐个字段查,不能用 `Exclude<keyof A, keyof B>`:`keyof ExecuteOpFromSchema`
// 含 zod 的字符串索引签名,任何键都「存在」,那式子恒为空集(本轮踩过)。

/**
 * zod 对象**显式声明**的键(不含索引签名)。为什么不用 `keyof typeof X` / `X['shape']`:
 * `.catchall()` / 索引签名会让那份 `keyof` 退化成 `string`。
 */
type DeclaredKeys<S extends z.ZodObject> = keyof z.output<S>;

/** schema 实际收的全部字段名:10 个节点类型的显式键并集 + 子节点直通 schema */
type SchemaKeys =
  | DeclaredKeys<typeof frameNodeSchema>
  | DeclaredKeys<typeof rectangleNodeSchema>
  | DeclaredKeys<typeof ellipseNodeSchema>
  | DeclaredKeys<typeof lineNodeSchema>
  | DeclaredKeys<typeof polygonNodeSchema>
  | DeclaredKeys<typeof starNodeSchema>
  | DeclaredKeys<typeof vectorNodeSchema>
  | DeclaredKeys<typeof textNodeSchema>
  | DeclaredKeys<typeof groupNodeSchema>
  | DeclaredKeys<typeof booleanOperationNodeSchema>;
// childNodeSchema 不进并集:它带 `.catchall()`,其 `keyof` 退化成 `string`,并进来等于恒真。

/** `ExecuteOp` 里必须真的存在于 schema 的键:`type` / `children` 是接口刻意更宽的两处 */
type WrittenKeys = Exclude<keyof ExecuteOp, 'type' | 'children'>;

/**
 * **多一份必失:接口声称有、schema 却不收的键**。映射类型把每个键分别判一次,
 * 失败时 tsc 报的就是缺字段的键名(缺 `textTruncation` 的那次会在这里红)。
 */
type MissingFromSchema = {
  [K in WrittenKeys]: K extends SchemaKeys ? never : K;
}[WrittenKeys];
type MissingFromExecuteOp = {
  [K in SchemaKeys]: K extends keyof ExecuteOp ? never : K;
}[SchemaKeys];

/**
 * 两个方向都必须落到 `never`。
 *
 * 为什么不用 `const x: {...} = null as never`:那种写法经 `never` 实例化后整个映射
 * 类型塌成 `never`,任何赋值都成立 —— 恒真断言,漂移检出率为零(实测加字段不报错)。
 */
const _noMissingFromSchema: [MissingFromSchema] extends [never] ? true : false =
  true;
const _noMissingFromExecuteOp: [MissingFromExecuteOp] extends [never]
  ? true
  : false = true;
void _noMissingFromSchema;
void _noMissingFromExecuteOp;
