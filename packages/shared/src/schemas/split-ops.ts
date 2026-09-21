import { z } from 'zod';

import {
  autoLayoutPropsSchema,
  cornerPropsSchema,
  resizePropsSchema,
  shapePropsSchema,
  strokePropsSchema,
  textPropsSchema,
  transformPropsSchema,
  visualPropsSchema,
} from './shared-props';

// ---- 拆分后的小工具入参 schema ----
// 对齐 TalkToFigmaMCP 参考实现的工具定义风格:一个操作一个工具,扁平 schema +
// 逐字段 describe,没有 op 分发、没有 oneOf、没有 superRefine。聚合入口
// (jsd_manage_nodes / jsd_manage_components)保留,插件协议不变——小工具仍发
// node_op / component_op / update_node,只是把 op 字面量与字段子集固化到工具定义里;
// jsd_update_node 已删除,其长尾字段(pointCount/innerRadius)由 jsd_set_shape 承接。

/** 属性类小工具的节点定位字段(属性操作的 ids/matchName/recursive/includeSelf) */
export const updateTargetFields = {
  ids: z.array(z.string()).min(1).optional().describe('schema.splitOps.ids'),
  matchName: z.string().optional().describe('schema.splitOps.matchName'),
  recursive: z
    .boolean()
    .optional()
    .describe(
      '是否递归应用到子树,默认 false。recursive 只作用于**后代**,不含目标节点自身:给容器 FRAME 传它刷色,容器自己不会被改(容器自身加描边会渲染成方框)。目标是无子节点的叶子时,自身即整棵子树,仍会改。要把容器自己也算进去再传 includeSelf=true',
    ),
  includeSelf: z
    .boolean()
    .optional()
    .describe(
      '仅 recursive=true 时有意义:是否连目标节点自身一起改,默认 false。传 true 且目标是容器时结果会带 warnings 点名「容器自身也被修改」',
    ),
};

const requiredIds = (tip: string, min = 1) =>
  z.array(z.string()).min(min).describe(tip);

// ---- 节点结构操作(node_op) ----

export const selectNodesSchema = z
  .object({ ids: requiredIds('要设为当前选中的节点 id 列表') })
  .strict();

export const deleteNodeSchema = z
  .object({
    ids: z.array(z.string()).optional().describe('schema.splitOps.ids2'),
    matchName: z.string().optional().describe('schema.splitOps.matchName2'),
  })
  .strict();

export const cloneNodeSchema = z
  .object({
    ids: requiredIds('要复制的节点 id 列表(新副本右下偏移放置)'),
  })
  .strict();

export const groupNodesSchema = z
  .object({
    ids: requiredIds('要编组的节点 id 列表,至少 2 个', 2),
    name: z.string().optional().describe('schema.splitOps.name'),
    layoutMode: z
      .enum(['NONE', 'HORIZONTAL', 'VERTICAL'])
      .optional()
      .describe(
        '自动布局方向:NONE=纯归组(子节点仅叠加,不排布),HORIZONTAL=水平排列,VERTICAL=垂直排列',
      ),
    itemSpacing: z
      .number()
      .optional()
      .describe(
        '自动布局项间距(px);primaryAxisAlignItems=SPACE_BETWEEN 时该项被忽略(子项均匀分布)',
      ),
    paddingTop: z.number().optional().describe('schema.splitOps.paddingTop'),
    paddingRight: z
      .number()
      .optional()
      .describe('schema.splitOps.paddingRight'),
    paddingBottom: z
      .number()
      .optional()
      .describe('schema.splitOps.paddingBottom'),
    paddingLeft: z.number().optional().describe('schema.splitOps.paddingLeft'),
    primaryAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('schema.splitOps.primaryAxisSizingMode'),
    counterAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('schema.splitOps.counterAxisSizingMode'),
    primaryAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
      .optional()
      .describe(
        '主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN;设为 SPACE_BETWEEN 时 itemSpacing 被忽略(子项均匀分布)',
      ),
    counterAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER'])
      .optional()
      .describe('schema.splitOps.counterAxisAlignItems'),
  })
  .strict();

export const ungroupNodesSchema = z
  .object({ ids: requiredIds('要解组的节点 id 列表') })
  .strict();

export const flattenNodesSchema = z
  .object({
    ids: requiredIds('要合并为单一矢量的节点 id 列表,至少 2 个', 2),
  })
  .strict();

export const outlineStrokeSchema = z
  .object({ ids: requiredIds('要把描边转成轮廓矢量的节点 id 列表') })
  .strict();

export const reparentNodesSchema = z
  .object({
    ids: requiredIds('要移动的节点 id 列表'),
    parentId: z
      .string()
      .optional()
      .describe(
        '目标父节点 id。**强烈建议显式传**:只给 index 不给 parentId 时,缺省父级取「当前选中里第一个不是被移动节点的节点」——当前选中为空或不含父容器时该值不可靠(历史上因此报过「没有找到目标父节点」,或把节点误移进另一个被选中的节点下)。不传 parentId 的可用姿势:①先用 jsd_select_nodes 选中目标容器;②只给 index 且 ids 里含被调整节点本身 → 按被调整节点的原父级在此处调层序。跨父级移动**保持节点绝对位置**:内部按页面系记账并自动换算成新父下的 x/y,不要按「相对系重解释」手动摆回(那会把节点推走)。唯一例外是移入 auto-layout 容器 —— 位置由布局接管,要调排布改 itemSpacing / 对齐',
      ),
    index: z
      .number()
      .optional()
      .describe(
        '目标在父节点 children 数组里的最终下标;缺省追加到末尾。语义 = 绘制顺序(也就是序列化里的 z):0 是最底层,末位是最上层。节点已在该父级下时,本参数用于调整层序(不传则原地不动);auto-layout 容器同样支持(内部临时关掉布局插入后恢复),若引擎没落位会明确报错',
      ),
  })
  .strict();

export const repairNodesSchema = z
  .object({
    ids: z.array(z.string()).optional().describe('schema.splitOps.ids3'),
  })
  .strict();

// ---- 组件/实例操作(component_op) ----

export const createComponentSchema = z
  .object({
    ids: requiredIds('要固化为组件的节点 id 列表'),
    name: z.string().optional().describe('schema.splitOps.name2'),
  })
  .strict();

export const createInstanceSchema = z
  .object({ ids: requiredIds('要生成实例的组件(COMPONENT)节点 id 列表') })
  .strict();

export const detachInstanceSchema = z
  .object({
    ids: requiredIds('要取消实例链接的实例(INSTANCE)节点 id 列表'),
  })
  .strict();

export const importComponentSchema = z
  .object({
    key: z.string().describe('schema.splitOps.key'),
    name: z.string().optional().describe('schema.splitOps.name3'),
  })
  .strict();

export const swapComponentSchema = z
  .object({
    ids: requiredIds('要换绑的实例(INSTANCE)节点 id 列表'),
    componentId: z.string().describe('schema.splitOps.componentId'),
  })
  .strict();

export const setInstancePropertiesSchema = z
  .object({
    ids: requiredIds('要设置变体属性的实例(INSTANCE)节点 id 列表'),
    properties: z
      .record(z.string(), z.string())
      .describe(
        '变体属性名→值,如 {"状态":"禁用"};可调属性需从 jsd_find / jsd_get_selection 返回的 variantGroupProperties 获取,属性名必须完全匹配',
      ),
  })
  .strict();

export const combineAsVariantsSchema = z
  .object({
    ids: requiredIds(
      '要合并为变体集(分量)的组件(COMPONENT)节点 id 列表;实例不能直接合成,须先 jsd_detach_instance 或重建为组件',
    ),
    name: z.string().optional().describe('schema.splitOps.name4'),
  })
  .strict();

export const copyOverridesSchema = z
  .object({
    sourceId: z
      .string()
      .describe(
        '源实例(INSTANCE)节点 id,要复制其覆盖(变体/组件属性/可见样式文本)',
      ),
  })
  .strict();

const applyOverrideFields = {
  ids: requiredIds('要套用覆盖快照的目标实例(INSTANCE)节点 id 列表'),
  sourceId: z.string().describe('schema.splitOps.sourceId'),
  swapToSource: z
    .boolean()
    .optional()
    .describe(
      '套用时是否把目标实例 swap 成源组件,默认 false(swap 会丢失目标既有覆盖,需显式开启)',
    ),
};

export const applyOverridesSchema = z.object(applyOverrideFields).strict();

export const syncOverridesSchema = z.object(applyOverrideFields).strict();

// ---- 属性操作(update_node 的字段子集) ----
// 每个工具的 props 只含本工具负责的那一组字段;ids/matchName/recursive 定位字段
// 由 updateTargetFields 统一提供。

const setFillColorProps = {
  fills: visualPropsSchema.shape.fills,
  fillStyleId: visualPropsSchema.shape.fillStyleId,
  blendMode: visualPropsSchema.shape.blendMode,
};

const setStrokeProps = {
  ...strokePropsSchema.shape,
};

const setCornerRadiusProps = {
  cornerRadius: cornerPropsSchema.shape.cornerRadius,
  topLeftRadius: cornerPropsSchema.shape.topLeftRadius,
  topRightRadius: cornerPropsSchema.shape.topRightRadius,
  bottomLeftRadius: cornerPropsSchema.shape.bottomLeftRadius,
  bottomRightRadius: cornerPropsSchema.shape.bottomRightRadius,
  cornerSmoothing: visualPropsSchema.shape.cornerSmoothing,
};

const setTextProps = { ...textPropsSchema.shape };

const moveNodeProps = {
  x: transformPropsSchema.shape.x,
  y: transformPropsSchema.shape.y,
  rotation: transformPropsSchema.shape.rotation,
};

const resizeNodeProps = {
  ...resizePropsSchema.shape,
  // 尺寸 + 位置常常一起改(典型场景:节点从页面级移进容器后一次摆回原位)。
  // 拆两次调用除多一轮往返外,中间态还会被引擎的自动尺寸/约束改写。
  // x/y 由本方法直接拥有,故引擎白名单与工具入参天然放行;move 仍是 x/y 的
  // 语义归属方法,字段同源(transformPropsSchema),不存在两套定义漂移。
  x: transformPropsSchema.shape.x,
  y: transformPropsSchema.shape.y,
};

const setLayoutProps = {
  ...autoLayoutPropsSchema.shape,
  constraints: visualPropsSchema.shape.constraints,
};

const setEffectsProps = {
  effects: visualPropsSchema.shape.effects,
  effectStyleId: visualPropsSchema.shape.effectStyleId,
  clipsContent: visualPropsSchema.shape.clipsContent,
  layoutGrids: visualPropsSchema.shape.layoutGrids,
  arcData: visualPropsSchema.shape.arcData,
};

const setVisibilityProps = {
  opacity: transformPropsSchema.shape.opacity,
  visible: transformPropsSchema.shape.visible,
  locked: transformPropsSchema.shape.locked,
};

const renameNodeProps = {
  name: z.string().describe('schema.splitOps.name5'),
};

// 多边形/星形形状参数(长尾字段,原 jsd_update_node 独有):pointCount 仅
// POLYGON/STAR,innerRadius 仅 STAR。归入 jsd_set_shape 单属性工具。
const setShapeProps = { ...shapePropsSchema.shape };

function propSchema<T extends Record<string, unknown>>(props: T): z.ZodType {
  return z.object({ ...updateTargetFields, ...props }).strict();
}

export const setFillColorSchema = propSchema(setFillColorProps);
export const setStrokeSchema = propSchema(setStrokeProps);
export const setCornerRadiusSchema = propSchema(setCornerRadiusProps);
export const setTextSchema = propSchema(setTextProps);
export const moveNodeSchema = propSchema(moveNodeProps);
export const resizeNodeSchema = propSchema(resizeNodeProps);
export const setLayoutSchema = propSchema(setLayoutProps);
export const setEffectsSchema = propSchema(setEffectsProps);
export const setVisibilitySchema = propSchema(setVisibilityProps);
export const renameNodeSchema = propSchema(renameNodeProps);
export const setShapeSchema = propSchema(setShapeProps);

// ---- 属性引擎方法:每个方法对应一个属性组,字段集从上面对应的 props 对象派生 ----
// 原来唯一的 update_node 方法收任意 50 键 props,引擎无法在方法层拒绝越界字段;
// 拆开后方法名本身即字段分组,白名单由同一份 props 对象派生,不会与入参 schema 漂移。
export type PropMethod =
  | 'set_fill'
  | 'set_stroke'
  | 'set_corner_radius'
  | 'set_text'
  | 'move'
  | 'resize'
  | 'set_layout'
  | 'set_effects'
  | 'set_visibility'
  | 'rename'
  | 'set_shape';

export const PROP_METHOD_FIELDS: Record<PropMethod, readonly string[]> = {
  set_fill: Object.keys(setFillColorProps),
  set_stroke: Object.keys(setStrokeProps),
  set_corner_radius: Object.keys(setCornerRadiusProps),
  set_text: Object.keys(setTextProps),
  move: Object.keys(moveNodeProps),
  resize: Object.keys(resizeNodeProps),
  set_layout: Object.keys(setLayoutProps),
  set_effects: Object.keys(setEffectsProps),
  set_visibility: Object.keys(setVisibilityProps),
  rename: Object.keys(renameNodeProps),
  set_shape: Object.keys(setShapeProps),
};

// ---- 引擎侧线格式:每个方法一份 schema/类型,不再共用一张 50 键大表 ----
// ⚠ 这句早期注释是错的:x/y 由 move 与 resize 两个方法共有(见下方 resizeNodeProps
// 注释)。互斥性由 packages/shared/src/__tests__/prop-method-parity.test.ts 用
// 「显式共享登记表」守卫 —— 加共享字段必须显式登记,不许悄悄破坏分组前提。
// UpdateNodeProps 由下面各方法的 props 派生,仍是同一来源、不手工维护。
function propParamsSchema<T extends Record<string, z.ZodType>>(fields: T) {
  return z
    .object({
      ...updateTargetFields,
      props: z.object(fields).strict(),
    })
    .strict();
}

export const setFillParamsSchema = propParamsSchema(setFillColorProps);
export type SetFillProps = z.infer<typeof setFillParamsSchema>['props'];
export type SetFillParams = z.infer<typeof setFillParamsSchema>;

export const setStrokeParamsSchema = propParamsSchema(setStrokeProps);
export type SetStrokeProps = z.infer<typeof setStrokeParamsSchema>['props'];
export type SetStrokeParams = z.infer<typeof setStrokeParamsSchema>;

export const setCornerRadiusParamsSchema =
  propParamsSchema(setCornerRadiusProps);
export type SetCornerRadiusProps = z.infer<
  typeof setCornerRadiusParamsSchema
>['props'];
export type SetCornerRadiusParams = z.infer<typeof setCornerRadiusParamsSchema>;

export const setTextParamsSchema = propParamsSchema(setTextProps);
export type SetTextProps = z.infer<typeof setTextParamsSchema>['props'];
export type SetTextParams = z.infer<typeof setTextParamsSchema>;

export const moveParamsSchema = propParamsSchema(moveNodeProps);
export type MoveProps = z.infer<typeof moveParamsSchema>['props'];
export type MoveParams = z.infer<typeof moveParamsSchema>;

export const resizeParamsSchema = propParamsSchema(resizeNodeProps);
export type ResizeProps = z.infer<typeof resizeParamsSchema>['props'];
export type ResizeParams = z.infer<typeof resizeParamsSchema>;

export const setLayoutParamsSchema = propParamsSchema(setLayoutProps);
export type SetLayoutProps = z.infer<typeof setLayoutParamsSchema>['props'];
export type SetLayoutParams = z.infer<typeof setLayoutParamsSchema>;

export const setEffectsParamsSchema = propParamsSchema(setEffectsProps);
export type SetEffectsProps = z.infer<typeof setEffectsParamsSchema>['props'];
export type SetEffectsParams = z.infer<typeof setEffectsParamsSchema>;

export const setVisibilityParamsSchema = propParamsSchema(setVisibilityProps);
export type SetVisibilityProps = z.infer<
  typeof setVisibilityParamsSchema
>['props'];
export type SetVisibilityParams = z.infer<typeof setVisibilityParamsSchema>;

export const renameParamsSchema = propParamsSchema(renameNodeProps);
export type RenameProps = z.infer<typeof renameParamsSchema>['props'];
export type RenameParams = z.infer<typeof renameParamsSchema>;

export const setShapeParamsSchema = propParamsSchema(setShapeProps);
export type SetShapeProps = z.infer<typeof setShapeParamsSchema>['props'];
export type SetShapeParams = z.infer<typeof setShapeParamsSchema>;
