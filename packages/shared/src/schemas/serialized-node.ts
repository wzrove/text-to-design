import { z } from 'zod';
import { BOOLEAN_OPERATIONS } from '../dicts/boolean-operation';
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
import { observedNodeTypeSchema } from './node-type';
import {
  boundVariablesSchema,
  componentPropertyReferencesSchema,
  componentPropertyValueSchema,
} from './platform';

/**
 * 读路径节点形状。**由 zod 派生**,与写路径 (`ExecuteOp`) 同一个原因:此前手写接口与
 * 下面的 zod 是同一份 40 字段清单的两抄,漂移零信号。字段语义注释留在 zod 一侧。
 *
 * 递归:主体与 children 分两个 schema。`z.infer` 对自引用的 `z.lazy` 会报 TS2502,
 * 故派生只取主体、`children` 在类型侧补回 —— 补漏由文件尾的断言守,不靠人记。
 */
type SerializedNodeBody = z.infer<typeof serializedNodeBodySchema>;
export type SerializedNode = SerializedNodeBody & {
  /** 子节点(递归) */
  children?: SerializedNode[];
};

const serializedNodeBodySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 读路径类型:含 Figma 独有只读类型(写路径仍只认 NodeType 的 14 类) */
  type: observedNodeTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  parentId: z.string().optional(),
  /**
   * 该节点在父级 children 数组里的下标 = 绘制顺序(0 = 最底层,末位 = 最上层)。
   * 判断谁遮谁直接读它,不必记数组方向;顶层节点也回传(其父级是当前页)。
   */
  z: z
    .number()
    .optional()
    .describe(
      '在父级 children 里的下标 = 绘制顺序,0 = 最底层、数值越大越靠上;判断遮挡读它,不用记数组方向',
    ),
  fills: z.array(paintSchema).optional(),
  strokes: z.array(paintSchema).optional(),
  strokeWeight: z.number().optional(),
  strokeTopWeight: z.number().optional(),
  strokeBottomWeight: z.number().optional(),
  strokeLeftWeight: z.number().optional(),
  strokeRightWeight: z.number().optional(),
  strokeAlign: z.enum(STROKE_ALIGN_VALUES).optional(),
  strokeCap: z.enum(STROKE_CAP_VALUES).optional(),
  strokeJoin: z.enum(STROKE_JOIN_VALUES).optional(),
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
  layoutMode: z.enum(LAYOUT_MODE_VALUES).optional(),
  itemSpacing: z.number().optional(),
  paddingTop: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  primaryAxisSizingMode: z.enum(SIZING_MODE_VALUES).optional(),
  counterAxisSizingMode: z.enum(SIZING_MODE_VALUES).optional(),
  primaryAxisAlignItems: z.enum(PRIMARY_AXIS_ALIGN_VALUES).optional(),
  counterAxisAlignItems: z.enum(COUNTER_AXIS_ALIGN_VALUES).optional(),
  layoutGrow: z.number().optional(),
  layoutAlign: z.enum(LAYOUT_ALIGN_VALUES).optional(),
  childCount: z.number().optional(),
  characters: z.string().optional(),
  fontSize: z.number().optional(),
  fontName: fontNameSchema.optional(),
  textAlignHorizontal: z.enum(TEXT_ALIGN_HORIZONTAL_VALUES).optional(),
  textAlignVertical: z.enum(TEXT_ALIGN_VERTICAL_VALUES).optional(),
  textAutoResize: z.enum(TEXT_AUTO_RESIZE_VALUES).optional(),
  textCase: z.enum(TEXT_CASE_VALUES).optional(),
  textDecoration: z.enum(TEXT_DECORATION_VALUES).optional(),
  lineHeight: lineHeightSchema.optional(),
  letterSpacing: letterSpacingSchema.optional(),
  vectorPaths: z.array(vectorPathSchema).optional(),
  booleanOperation: z.enum(BOOLEAN_OPERATIONS).optional(),
  isMask: z.boolean().optional(),
  variantProperties: z.record(z.string(), z.string()).optional(),
  mainComponentId: z.string().optional(),
  variantGroupProperties: z
    .record(z.string(), z.array(z.string()))
    .optional(),
  /** 平台特有字段(仅对应平台运行时存在,如 Figma;其他平台恒缺省) */
  textTruncation: z.enum(TEXT_TRUNCATION_VALUES).optional(),
  maxLines: z.number().optional(),
  fillStyleId: z.string().optional(),
  strokeStyleId: z.string().optional(),
  textStyleId: z.string().optional(),
  effectStyleId: z.string().optional(),
  componentProperties: z
    .record(z.string(), componentPropertyValueSchema)
    .optional(),
  /**
   * 组件属性**引用**(0041):本图层由哪个组件属性驱动,槽位 → 属性键。
   * 与 componentProperties 成对读:那条说值,这条说谁会被它改。
   */
  componentPropertyReferences: componentPropertyReferencesSchema.optional(),
  /** 变量绑定(仅 Figma;键在即至少有一条绑定) */
  boundVariables: boundVariablesSchema.optional(),
});

export const serializedNodeSchema: z.ZodType<SerializedNode> = z.lazy(() =>
  serializedNodeBodySchema.extend({
    children: z.array(serializedNodeSchema).optional(),
  }),
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;
/** 只在一侧出现的键(空 = 派生类型与 schema 字段面一致;断言失败时 tsc 报漂移的键名) */
type KeyMismatch<A, B> = {
  [K in keyof A | keyof B]: K extends keyof A
    ? K extends keyof B
      ? never
      : K
    : K;
}[keyof A | keyof B];

/**
 * 主体两侧必须同键:派生类型多一个键,schema 就会把序列化结果**拒掉**(写路径看不见);
 * 少一个键,赋值处报错(看得见)。
 */
export type _BodyKeysMatch = Expect<
  Equal<
    KeyMismatch<SerializedNodeBody, z.infer<typeof serializedNodeBodySchema>>,
    never
  >
>;

/** children 只许出现在拼出来的那一侧:主体里再写一次会让递归类型退化成 unknown[] */
export type _ChildrenOnlyOutside = Expect<
  Equal<Extract<keyof SerializedNodeBody, 'children'>, never>
>;