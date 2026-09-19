/**
 * 编译期契约一致性断言(jsDesign 侧):@jsdesigndeveloper/plugin-typings ↔
 * shared 的 DesignHost。与 figma/sync-guarantee.ts 镜像对称,差别只在平台超集部分。
 *
 * 三件事:
 * 1) 线格式子集:Paint/Effect/BlendMode 必须是运行时类型的子集。
 * 2) 契约成员存在性:DesignHost / PageSkeleton / NodeSkeleton 声明的成员必须真实
 *    存在于运行时键空间(幻影符号 = core 调用必炸),编译失败会点名具体键。
 * 3) 平台超集成员缺席:jsDesign 无截断/组件属性/异步主件等能力,这里反向断言它们
 *    不在 jsDesign typings 里 —— 证明 meta.capabilities = ['styles'] 不是笔误,而是
 *    与 typings 事实一致。
 */

// 捕获运行时全局类型(在 import 覆盖前)
type RuntimePaint = Paint;
type RuntimeEffect = Effect;
type RuntimeBlendMode = BlendMode;

import type {
  BlendMode,
  DesignHost,
  Effect,
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
/** 该键被 typings 声明了 */
type Declared<K extends string, T> = K extends KeysOf<T> ? true : never;

/**
 * jsDesign 侧不存在的平台超集成员 —— 必须与 ui/src/code/jsdesign/meta.ts 的
 * capabilities(['styles'])以及 shared 的 PLATFORM_SUPERSET_PROPS 对齐。
 */
type JsDesignAbsent =
  | 'textTruncation'
  | 'maxLines'
  | 'componentProperties'
  | 'getMainComponentAsync'
  | 'resetOverrides'
  | 'removeOverrides';

/**
 * typings 未覆盖、运行时才存在的扩展符号(见 shared/core/host.ts 注释):两平台都缺,
 * 官方 typings 收录后本断言失败 —— 提醒删白名单、改回真实类型。
 * - absolutePosition:节点级,两平台 typings 均未声明;
 * - ungroup:节点级,jsDesign typings 连 PluginAPI 层都没有(见下方 HostGapCheck)。
 */
type NodeTypingsGap = 'absolutePosition' | 'ungroup';

/**
 * jsDesign typings 的**宿主层**缺口:`ungroup` 在 Figma 是 `PluginAPI.ungroup(node)`,
 * 但 @jsdesigndeveloper/plugin-typings 里两级都没有。core 因此按运行时 typeof 探测
 * (有就用、没有就报明确错误),契约里声明为可选。
 */
type JsDesignHostTypingsGap = 'ungroup';

/**
 * dynamic-page 系缺口(0011):`getNodeByIdAsync` / `loadAllPagesAsync` /
 * `setCurrentPageAsync` / `getLocal*StylesAsync` 是 Figma 对 dynamic-page 的替代
 * 符号 —— jsDesign 没有 dynamic-page,typings 里也没有。契约里声明为可选,
 * Access 层按运行时探测回退到同步实现。若未来 jsDesign typings 收录了任一符号,
 * 下面的反向断言会编译失败,提醒删掉对应回退分支。
 */
type JsDesignAsyncGap =
  | 'getNodeByIdAsync'
  | 'loadAllPagesAsync'
  | 'setCurrentPageAsync'
  | 'getLocalPaintStylesAsync'
  | 'getLocalTextStylesAsync'
  | 'getLocalEffectStylesAsync'
  | 'getLocalGridStylesAsync';

export type HostContractCheck = ExpectNever<
  Missing<
    Exclude<keyof DesignHost, JsDesignHostTypingsGap | JsDesignAsyncGap>,
    PluginAPI
  >
>;
/** 反向:登记为缺口的东西必须真的不在 typings 里(登记不诚实也会报错) */
export type HostGapCheck = ExpectNever<
  Declared<JsDesignHostTypingsGap | JsDesignAsyncGap, PluginAPI>
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
  Missing<
    Exclude<keyof NodeSkeleton, JsDesignAbsent | NodeTypingsGap>,
    SceneNode
  >
>;
export type NodeGapCheck = ExpectNever<Declared<NodeTypingsGap, SceneNode>>;

/**
 * 节点类型:jsDesign 运行时就是本仓的 14 类,双向都必须一致。
 * (Figma 侧多出 20 类只读类型,登记在 figma/sync-guarantee.ts 与 dicts/node-type.ts)
 */
export type NodeTypeContractCheck = ExpectNever<
  Exclude<NodeType, SceneNode['type']> | Exclude<SceneNode['type'], NodeType>
>;

// ---- 3) 平台超集成员必须在 jsDesign typings 里缺席(反向断言) ----

export type SupersetAbsenceCheck = ExpectNever<
  Declared<JsDesignAbsent, SceneNode>
>;
