import { z } from 'zod';

import {
  autoLayoutPropsSchema,
  cornerPropsSchema,
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

/** 属性类小工具的节点定位字段(update_node 的 ids/matchName/recursive) */
export const updateTargetFields = {
  ids: z
    .array(z.string())
    .min(1)
    .optional()
    .describe('目标节点 id 列表;缺省时作用于当前选中节点'),
  matchName: z
    .string()
    .optional()
    .describe('按节点 name 精确过滤(精确等值,非模糊/包含),仅命中节点被修改'),
  recursive: z
    .boolean()
    .optional()
    .describe(
      '是否递归应用到子树,默认 false;目标为大容器时慎用(会连坐修改全部后代)',
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
    ids: z
      .array(z.string())
      .optional()
      .describe('要删除的节点 id 列表;缺省时删除当前选中节点'),
    matchName: z
      .string()
      .optional()
      .describe('在 ids(或当前选中)范围内,仅删除 name 精确匹配的节点'),
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
    name: z.string().optional().describe('组名'),
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
        '目标父节点 id,缺省用当前选中第一个节点。移动后节点坐标按新父相对系解释,通常需再 jsd_move_node 修正 x/y',
      ),
    index: z.number().optional().describe('插入位置,缺省追加到末尾;置底用 0'),
  })
  .strict();

export const repairNodesSchema = z
  .object({
    ids: z
      .array(z.string())
      .optional()
      .describe('要清理的已损坏节点 id 列表;缺省时清理当前页全部损坏节点'),
  })
  .strict();

// ---- 组件/实例操作(component_op) ----

export const createComponentSchema = z
  .object({
    ids: requiredIds('要固化为组件的节点 id 列表'),
    name: z.string().optional().describe('组件名称'),
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
    key: z.string().describe('团队库组件唯一标识 Key'),
    name: z.string().optional().describe('导入后的节点名称'),
  })
  .strict();

export const swapComponentSchema = z
  .object({
    ids: requiredIds('要换绑的实例(INSTANCE)节点 id 列表'),
    componentId: z.string().describe('目标组件(COMPONENT)节点 id'),
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
    name: z.string().optional().describe('变体集名称'),
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
  sourceId: z
    .string()
    .describe('源实例 id,即先前 copy_overrides 返回的 snapshotId'),
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
  width: transformPropsSchema.shape.width,
  height: transformPropsSchema.shape.height,
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
  name: z.string().describe('节点新名称'),
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
// params.props 只含本方法白名单内的字段;11 组字段零重叠(见 smoke-split 断言),
// 因此引擎内部的 UpdateNodeProps 由 11 份 Partial 交集导出,仍是同一来源、不手工维护。
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
