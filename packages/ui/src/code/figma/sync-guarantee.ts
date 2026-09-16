/**
 * 编译期契约一致性断言(Figma 侧):@figma/plugin-typings ↔ shared 的 DesignHost。
 *
 * 三件事:
 * 1) 线格式子集:Paint/Effect/BlendMode 必须是运行时类型的子集。
 * 2) 契约成员存在性:DesignHost / PageSkeleton / NodeSkeleton 声明的成员必须真实
 *    存在于运行时键空间 —— 契约里出现运行时没有的符号,core 调用就是幻影,这里
 *    编译失败并点名(此前只有顶层 keyof 检查,节点级方法面完全没覆盖)。
 * 3) 平台超集成员:Figma 必须有据;typings 未覆盖的运行时扩展显式登记,官方收录后
 *    断言失败,提醒回来收编类型。
 *
 * 断言全为类型级(type alias),不产出运行时代码;失败信息形如
 * "Type 'absolutePosition' does not satisfy the constraint 'never'" —— 直接报键名。
 */

// 捕获 figma 运行时全局类型(在 import 覆盖前)
type RuntimePaint = Paint;
type RuntimeEffect = Effect;
type RuntimeBlendMode = BlendMode;

import type {
  BlendMode,
  DesignHost,
  Effect,
  FIGMA_ONLY_NODE_TYPES,
  NodeSkeleton,
  NodeType,
  PageSkeleton,
  Paint,
} from 'text-to-design-shared';

export const _paintCheck: Paint extends RuntimePaint ? true : false = true;
export const _effectCheck: Effect extends RuntimeEffect ? true : false = true;
export const _blendModeCheck: BlendMode extends RuntimeBlendMode
  ? true
  : false = true;

// ---- 2) 契约成员存在性 ----

/** 联合类型全部成员的键并集(逐成员分配再并起来) */
type KeysOf<T> = T extends unknown ? keyof T : never;
/** 断言 T 为 never;不是 never 时编译错误会打出违规的键名 */
type ExpectNever<T extends never> = T;
/** 契约成员里运行时没有的键 */
type Missing<K extends string, T> = K extends KeysOf<T> ? never : K;
/** 该键被 typings 声明了(登记 typings 缺口时做反向断言) */
type Declared<K extends string, T> = K extends KeysOf<T> ? true : never;

/**
 * typings 未覆盖、运行时才存在的扩展符号(见 shared/core/host.ts 注释):
 * - absolutePosition:节点级,两平台 typings 均未声明;
 * - ungroup(**节点级**):Figma 官方入口是 PluginAPI.ungroup(node),GroupNode 上没有
 *   该方法(宿主层的 PluginAPI.ungroup 是存在的,已在 HostContractCheck 里覆盖)。
 * 官方 typings 收录后本断言失败 —— 提醒删白名单、改回真实类型。
 */
type NodeTypingsGap = 'absolutePosition' | 'ungroup';

export type HostContractCheck = ExpectNever<
  Missing<keyof DesignHost, PluginAPI>
>;
export type PageContractCheck = ExpectNever<
  Missing<keyof PageSkeleton, PluginAPI['currentPage']>
>;
export type UiContractCheck = ExpectNever<
  Missing<keyof DesignHost['ui'], PluginAPI['ui']>
>;
export type ViewportContractCheck = ExpectNever<
  Missing<keyof DesignHost['viewport'], PluginAPI['viewport']>
>;
export type NodeContractCheck = ExpectNever<
  Missing<Exclude<keyof NodeSkeleton, NodeTypingsGap>, SceneNode>
>;
export type NodeGapCheck = ExpectNever<Declared<NodeTypingsGap, SceneNode>>;

/** 写路径枚举是本仓能力子集:14 类必须都能在 Figma 运行时里创建 */
export type NodeTypeContractCheck = ExpectNever<
  Exclude<NodeType, SceneNode['type']>
>;

/**
 * Figma 独有的 20 类只读节点类型必须与登记表严格一致(双向):
 * 少登记 → 读结果过不了 schema;多登记 → 登记表里混进了不存在的类型。
 * 登记表见 shared/src/dicts/node-type.ts 的 FIGMA_ONLY_NODE_TYPES。
 */
type FigmaOnlyRuntime = Exclude<SceneNode['type'], NodeType>;
type FigmaOnlyRegistered = (typeof FIGMA_ONLY_NODE_TYPES)[number];
export type FigmaOnlyRegistrationCheck = ExpectNever<
  | Exclude<FigmaOnlyRuntime, FigmaOnlyRegistered>
  | Exclude<FigmaOnlyRegistered, FigmaOnlyRuntime>
>;

// ---- 3) 平台超集成员:Figma 侧必须有据 ----

export type SupersetPresenceCheck = ExpectNever<
  Missing<
    | 'textTruncation'
    | 'maxLines'
    | 'componentProperties'
    | 'resetOverrides'
    | 'removeOverrides'
    | 'getMainComponentAsync',
    SceneNode
  >
>;

// 超集字段的值类型也必须与运行时一致(键存在 ≠ 值兼容)
type RuntimeTextTruncation = TextNode['textTruncation'];
export const _textTruncationCheck: NonNullable<
  NodeSkeleton['textTruncation']
> extends RuntimeTextTruncation
  ? true
  : false = true;

type RuntimeComponentProperties = InstanceNode['componentProperties'];
export const _componentPropsCheck: NonNullable<
  NodeSkeleton['componentProperties']
> extends RuntimeComponentProperties
  ? true
  : false = true;
