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

/**
 * ⚠ 引用全局类型的**唯一正确方式**(踩过的坑,别改回去):
 * `Paint` / `Effect` / `BlendMode` 与本仓线格式**同名**,而 import 声明在整个模块内
 * 生效、且优先于全局声明 —— 若按原名 import,`Paint` 就变成线格式自己,
 * 「线格式 ⊆ 运行时」的断言退化成 `X extends X` **恒真**(这三条曾经就是这样,
 * 看着在守,其实一条都没守)。故:
 * - 运行时全局类型:`Paint` / `Effect` / `BlendMode` 直接用原名(**本文件不 import 这三个名字**);
 * - 本仓线格式:一律带 `Wire` 前缀 import。
 * 其余全局类型(`SceneNode` / `EllipseNode` / `PluginAPI` …)本仓不导出同名符号,
 * 按原名用即可。
 *
 * 另外:**「线格式对象 ⊆ 运行时对象」这条断言本身就不成立**,别再写回去 ——
 * 线格式刻意是**超集**(否则三平台共用不了一个 schema),且允许缺省平台的必填字段
 * (由 `core/normalize` 在赋值前补齐)。真正能类型化、也真正要守的是下面第 1 节的两条:
 * 字段面与取值域。
 */
import type {
  DesignHost,
  JSDESIGN_RUNTIME_VALUE_DOMAIN,
  JSDESIGN_VALUE_DOMAIN,
  NodeSkeleton,
  NodeType,
  PageSkeleton,
  BlendMode as WireBlendMode,
  Effect as WireEffect,
  Paint as WirePaint,
} from 'text-to-design-shared';

// 捕获宿主全局类型(在 import 覆盖前):运行时取值域断言要拿它比
type RuntimeLayoutMixin = LayoutMixin;

// ---- 1) 线格式的字段面与取值域必须被运行时覆盖 ----

/** `ExtraKeys<W,R>` = 线格式有、运行时没有的键 —— 非 `never` 即线格式写了幻影字段 */
type ExtraKeys<W, R> = Exclude<keyof W, keyof R>;

type WireSolid = Extract<WirePaint, { type: 'SOLID' }>;
type WireImage = Extract<WirePaint, { type: 'IMAGE' }>;
type WireGradient = Extract<WirePaint, { type: 'GRADIENT_LINEAR' }>;
type WireShadow = Extract<WireEffect, { type: 'DROP_SHADOW' }>;
type WireBlur = Extract<WireEffect, { type: 'LAYER_BLUR' }>;

export type SolidKeyCheck = ExpectNever<
  ExtraKeys<WireSolid, Extract<Paint, { type: 'SOLID' }>>
>;
export type ImageKeyCheck = ExpectNever<
  ExtraKeys<WireImage, Extract<Paint, { type: 'IMAGE' }>>
>;
export type GradientKeyCheck = ExpectNever<
  ExtraKeys<WireGradient, Extract<Paint, { type: 'GRADIENT_LINEAR' }>>
>;
export type ShadowKeyCheck = ExpectNever<
  ExtraKeys<WireShadow, Extract<Effect, { type: 'DROP_SHADOW' }>>
>;
export type BlurKeyCheck = ExpectNever<
  ExtraKeys<WireBlur, Extract<Effect, { type: 'LAYER_BLUR' }>>
>;

export type PaintTypeDomainCheck = ExpectNever<
  Exclude<WirePaint['type'], Paint['type']>
>;
export type EffectTypeDomainCheck = ExpectNever<
  Exclude<WireEffect['type'], Effect['type']>
>;

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
  | 'boundVariables'
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

/**
 * 契约异步化后的**名字**缺口(0017):jsDesign 原生只有同步 `createNodeFromSvg` /
 * `createImage`,`*Async` 两个名字是本仓 adapter 包出来的(见 jsdesign/host.ts),
 * typings 里查不到属预期。官方将来收录同名异步符号时反向断言会失败,提醒收编。
 *
 * 注意 jsDesign 已有的 `createImageAsync(src: string)` 是**另一个语义**(收来源字符串),
 * 与契约的 `createImageFromBytesAsync`(收字节)不是一回事,故不在本缺口名单里。
 */
type JsDesignAsyncNameGap =
  | 'createNodeFromSvgAsync'
  | 'createImageFromBytesAsync';

export type HostContractCheck = ExpectNever<
  Missing<
    Exclude<
      keyof DesignHost,
      JsDesignHostTypingsGap | JsDesignAsyncGap | JsDesignAsyncNameGap
    >,
    PluginAPI
  >
>;
/** 反向:登记为缺口的东西必须真的不在 typings 里(登记不诚实也会报错) */
export type HostGapCheck = ExpectNever<
  Declared<
    JsDesignHostTypingsGap | JsDesignAsyncGap | JsDesignAsyncNameGap,
    PluginAPI
  >
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

// ---- 4) 平台类型事实表(0022):登记为「本平台没有」的必须真没有 ----

/**
 * `dicts/platform-value-domain.ts` 里登记了 jsDesign 的 `BlendMode` 少
 * `PASS_THROUGH`。两条断言各管一半:
 * - `Meaningful`:被排除的取值在**契约**枚举里真的存在(否则是登记笔误 ——
 *   写一个契约里没有的值,判定永远不触发,表面看却"已覆盖");
 * - `Absence`:它在 jsDesign typings 里真的**缺席**(否则是凭空限制 —— 把本平台
 *   支持的取值也拦掉)。
 *
 * Figma 侧有一条方向相反的断言(`PassThroughPresenceCheck`,断言该字面量在 Figma
 * **存在**)—— 两条合起来才证明这是平台差异,不是「我们少写了一个取值」。
 */
export type BlendDenyMeaningfulCheck = ExpectNever<
  Exclude<
    (typeof JSDESIGN_VALUE_DOMAIN)['blendMode']['deny'][number],
    NonNullable<NodeSkeleton['blendMode']>
  >
>;
export type BlendDenyAbsenceCheck = ExpectNever<
  Extract<
    (typeof JSDESIGN_VALUE_DOMAIN)['blendMode']['deny'][number],
    BlendMode
  >
>;
/**
 * **收窄登记的完备性**(三条断言里最重要的一条):
 * 线格式取值域 − 本平台取值域 − 登记为收窄的 = **空**。
 *
 * 它守的是「没有漏登记的差异」:线格式将来加了新的混合模式而 jsDesign 没有,
 * 这条会红 —— 提醒去 `dicts/platform-value-domain.ts` 补一条 deny(否则那个值会
 * 悄无声息地写进 jsDesign,就是本记录要根治的静默失效)。
 * 只断言「登记项真缺席」是不够的:漏登记时那三条全绿,而这个值谁都没管。
 */
export type BlendModeCompletenessCheck = ExpectNever<
  Exclude<
    WireBlendMode,
    BlendMode | (typeof JSDESIGN_VALUE_DOMAIN)['blendMode']['deny'][number]
  >
>;

/**
 * 圆角族在 jsDesign 的 `EllipseNode` 上**存在**(与 Figma 同)。
 * MasterGo 侧的反向断言说它的 `EllipseNode` 不含 CornerMixin —— 这条证明「椭圆
 * 无圆角」是 MG 的平台差异,而不是三平台共有的领域事实(否则该收窄应写进
 * `PROP_APPLICABILITY` 而不是平台表)。
 * `Declared` 命中才返回 `true`,故 `= true` 即断言「存在」。
 */
export const _jsdesignEllipseCornerCheck: Declared<
  'cornerSmoothing',
  EllipseNode
> = true;

// ---- 5) 运行时取值域收窄:登记项必须**在** typings 里(与第 4 节方向相反) ----

/**
 * `JSDESIGN_RUNTIME_VALUE_DOMAIN` 的断言方向与第 4 节**相反**,这不是笔误:
 * 第 4 节那张表登记「类型不支持」→ 断言「登记的项必须真**缺席**」;
 * 这张表登记「类型支持、运行时不吃」→ 断言「登记的项必须真**存在**于 typings」。
 * 哪天 jsDesign 把 `MIN` 从 `layoutAlign` 取值域里删掉,这条会失败 —— 提醒把它
 * 挪回类型事实那张表(反之亦然)。
 *
 * 另一半断言(「登记的项必须在契约取值域里」)与第 4 节同因:写一个契约里没有的值,
 * 判定永远不触发,表面看却"已覆盖"。
 *
 * 与 MG 侧的差别:jsDesign 的子项字段名与契约**同名**(`layoutAlign` / `layoutGrow`),
 * 故这里不需要过值映射表;MG 那边要先按 `VALUE_TO_MG` 换成 `alignSelf` / `flexGrow`。
 */
type RuntimeDeniedAlign =
  (typeof JSDESIGN_RUNTIME_VALUE_DOMAIN)['layoutAlign']['deny'][number];
type RuntimeGrowAllow =
  (typeof JSDESIGN_RUNTIME_VALUE_DOMAIN)['layoutGrow']['allow'][number];

/**
 * ① 登记的「类型里有、运行时不吃」项必须真在 jsDesign 取值域里
 * (`plugin-api.d.ts:749-750`:`layoutAlign` 是 5 值字面量联合、`layoutGrow` 是 `number`)。
 *
 * `layoutAlign` 这条**有信号**:往登记里塞一个 typings 没有的字面量,`tsc` 会精确报出该键名。
 * `layoutGrow` 这条**天然弱** —— `allow: [0, 1]` 必然落进 `number`,断言无从判别;
 * 数值域收窄没有「缺了哪几个字面量」的类型信号,只能靠真机实测冻结(退出条件见
 * `GrowStillNumberCheck`)。
 */
export type RuntimeAlignInTypingsCheck = ExpectNever<
  Exclude<RuntimeDeniedAlign, RuntimeLayoutMixin['layoutAlign']>
>;
export type RuntimeGrowInTypingsCheck = ExpectNever<
  Exclude<RuntimeGrowAllow, RuntimeLayoutMixin['layoutGrow']>
>;
/** 登记留在 runtime 表的前提:jsDesign 的类型**仍是** `number`;收窄成字面量联合即失败 */
export type GrowStillNumberCheck = ExpectNever<
  number extends RuntimeLayoutMixin['layoutGrow']
    ? never
    : '已收成类型字面量_挪回PLATFORM_VALUE_DOMAIN'
>;

/** ② 同理,登记的项必须在**契约**取值域里(否则判定永不触发) */
export type RuntimeAlignMeaningfulCheck = ExpectNever<
  Exclude<RuntimeDeniedAlign, NonNullable<NodeSkeleton['layoutAlign']>>
>;
export type RuntimeGrowMeaningfulCheck = ExpectNever<
  Exclude<RuntimeGrowAllow, NonNullable<NodeSkeleton['layoutGrow']>>
>;

/**
 * 反向覆盖:jsDesign 声明的取值域必须**整体落在契约里**(契约漏了一个,收窄判定
 * 就管不到它)。与 MG 的 `AlignDomainCoverageCheck` 同旨。
 */
export type AlignDomainCoverageCheck = ExpectNever<
  Exclude<
    RuntimeLayoutMixin['layoutAlign'],
    NonNullable<NodeSkeleton['layoutAlign']>
  >
>;
export type GrowDomainCoverageCheck = ExpectNever<
  Exclude<
    RuntimeLayoutMixin['layoutGrow'],
    NonNullable<NodeSkeleton['layoutGrow']>
  >
>;
