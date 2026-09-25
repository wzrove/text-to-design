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

/**
 * ⚠ 引用全局类型的**唯一正确方式**(踩过的坑,别改回去):
 * `Paint` / `Effect` / `BlendMode` 与本仓线格式**同名**,而 import 声明在整个模块内
 * 生效、且优先于全局声明 —— 若按原名 import,`Paint` 就变成线格式自己,
 * 「线格式 ⊆ 运行时」的断言退化成 `X extends X` **恒真**(这三条曾经就是这样,
 * 看着在守,其实一条都没守)。故:
 * - 运行时全局类型:`Paint` / `Effect` / `BlendMode` 直接用原名(**本文件不 import 这三个名字**);
 * - 本仓线格式:一律带 `Wire` 前缀 import。
 * 其余全局类型(`SceneNode` / `EllipseNode` / `RectangleNode` / `PluginAPI` …)本仓不导出
 * 同名符号,按原名用即可。
 *
 * 另外:**「线格式对象 ⊆ 运行时对象」这条断言本身就不成立**,别再写回去 ——
 * 线格式刻意是**超集**(否则三平台共用不了一个 schema),且允许缺省平台的必填字段
 * (由 `core/normalize` 在赋值前补齐:IMAGE 的 `scaleMode`、Effect 的 `visible`、
 * RGBA 的 `a`)。真正能类型化、也真正要守的是下面第 1 节的两条:字段面与取值域。
 */
import type {
  DesignHost,
  FIGMA_ONLY_NODE_TYPES,
  FIGMA_RUNTIME_VALUE_DOMAIN,
  NodeSkeleton,
  NodeType,
  PageSkeleton,
  BlendMode as WireBlendMode,
  Effect as WireEffect,
  Paint as WirePaint,
} from 'text-to-design-shared';

// ---- 1) 线格式的字段面与取值域必须被运行时覆盖 ----

/**
 * 契约成员存在性一节复用的键工具(此处先声明,供第 1 节使用)。
 * `ExtraKeys<W,R>` = 线格式有、运行时没有的键 —— 非 `never` 即线格式写了幻影字段。
 */
type ExtraKeys<W, R> = Exclude<keyof W, keyof R>;

type WireSolid = Extract<WirePaint, { type: 'SOLID' }>;
type WireImage = Extract<WirePaint, { type: 'IMAGE' }>;
type WireGradient = Extract<WirePaint, { type: 'GRADIENT_LINEAR' }>;
type WireShadow = Extract<WireEffect, { type: 'DROP_SHADOW' }>;
type WireBlur = Extract<WireEffect, { type: 'LAYER_BLUR' }>;

/** 字段面:线格式的每个 Paint / Effect 变体不许出现运行时没有的键 */
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

/**
 * 取值域:线格式的每个取值必须被运行时覆盖。
 * **这里没有 `deny` 补偿项** —— 与 jsDesign / MasterGo 两侧的差别正在此:Figma 的
 * `BlendMode` 是线格式的超集(多 `LINEAR_BURN` / `LINEAR_DODGE`),故不需要任何收窄登记。
 * 哪天 Figma 砍掉某个字面量,这条会红,提醒去 `dicts/platform-value-domain.ts` 登记。
 */
export type PaintTypeDomainCheck = ExpectNever<
  Exclude<WirePaint['type'], Paint['type']>
>;
export type EffectTypeDomainCheck = ExpectNever<
  Exclude<WireEffect['type'], Effect['type']>
>;
export type BlendModeDomainCheck = ExpectNever<
  Exclude<WireBlendMode, BlendMode>
>;

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

/**
 * 契约异步化后的**名字**缺口(0017):Figma 原生只有同步 `createNodeFromSvg` /
 * `createImage`,`*Async` 两个名字是本仓 adapter 包出来的(见 figma/host.ts),
 * 故 typings 里必然查不到。若 Figma 官方将来收录了同名异步符号,下面的反向
 * 断言会编译失败 —— 提醒删掉 adapter 里的包装、直接用原生符号。
 *
 * 注意 Figma 已有的 `createImageAsync(src: string)` 是**另一个语义**(收来源字符串),
 * 与契约的 `createImageFromBytesAsync`(收字节)不是一回事,故不在本缺口名单里。
 */
type HostAsyncNameGap = 'createNodeFromSvgAsync' | 'createImageFromBytesAsync';

export type HostContractCheck = ExpectNever<
  Missing<Exclude<keyof DesignHost, HostAsyncNameGap>, PluginAPI>
>;
export type HostAsyncNameGapCheck = ExpectNever<
  Declared<HostAsyncNameGap, PluginAPI>
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
    | 'boundVariables'
    | 'addComponentProperty'
    | 'resetOverrides'
    | 'removeOverrides'
    | 'getMainComponentAsync',
    SceneNode
  >
>;

/**
 * ⚠ `boundVariables` **只守存在性,不守值类型一致**(0024):
 * 线格式刻意是自描述的三态联合(`VariableAliasRef | VariableAliasRef[] | Record<string, VariableAliasRef>`),
 * 而运行时是 mapped type over 有限字段名 —— `Record<string, …>` 在 `fills` 键上与目标要求的
 * `VariableAlias[]` 不可分配,写子集断言必然恒假。真正的漂移守护是「上面这条存在性断言 +
 * serialize 运行时逐字拷贝」:引擎若改名/增字段,拷贝会照带,不会静默丢。
 */

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

// ---- 4) 平台类型事实表的两侧对照(0022) ----

/**
 * `PASS_THROUGH` 在 **Figma 有**、在 jsDesign **没有** —— 故它进了
 * `dicts/platform-value-domain.ts` 的 jsDesign 收窄表(deny),而 Figma 这边一个字
 * 都不用登记。这条断言证明「不是漏登记,是平台确实不同」:
 * 若哪天 Figma 也去掉该字面量,它会编译失败,提醒把 JS 侧那条 deny 一起撤掉。
 */
export type PassThroughPresenceCheck = ExpectNever<
  Exclude<'PASS_THROUGH', BlendMode>
>;

/**
 * 圆角族在 Figma 的 `EllipseNode` 上**存在**(`cornerSmoothing` 来自 CornerMixin)。
 * 与 MasterGo 侧的反向断言成对:MG 的 `EllipseNode` 不含 CornerMixin,故那里登记了
 * 「椭圆无圆角」的适用性收窄,这里必须查得到 —— 两侧一起才说明那条收窄是**平台差异**
 * 而不是「我们偷懒少写了一个类型」。
 * `Declared` 命中才返回 `true`,故 `= true` 即断言「存在」。
 */
export const _figmaEllipseCornerCheck: Declared<
  'cornerSmoothing',
  EllipseNode
> = true;
export const _figmaRectCornerCheck: Declared<'cornerSmoothing', RectangleNode> =
  true;

// ---- 运行时取值域收窄(Figma):登记项必须**在** typings 里 ----

/**
 * `FIGMA_RUNTIME_VALUE_DOMAIN` 记的是「typings 声明支持、运行时不吃」的项,故断言
 * 方向与类型事实表**相反**:登记项必须真**存在**于 Figma typings。
 *
 * 依据逐条对到 `@figma/plugin-typings` 1.137.0 的声明处(不是 `LayoutMixin`,那只是
 * 转发用的组合接口):`layoutGrow` 由 `AutoLayoutChildrenMixin` 声明
 * (`plugin-api.d.ts:8281`),类型是 `number`,而**同一段 JSDoc 的 `@remarks` 自己写了**
 * 「0 and 1 are currently the only supported values」⇒ 值域收窄活在文档 + 运行时里,
 * 类型层面不收窄。故登记进 runtime 表,而非 `PLATFORM_VALUE_DOMAIN`。
 *
 * 四条断言的**强弱必须分清**(别拿弱的那条当闸门):
 * - `…InTypingsCheck` / `…MeaningfulCheck` / `…GrowDomainCoverageCheck`:这三条对
 *   **数值域**天然弱 —— 登记项(`0 \| 1`)、契约类型(`layoutGrow?: number`)与 Figma
 *   类型都落在 `number` 里,任何 `Exclude` 都是 `never`,填错也判不出。留着只为在
 *   Figma 哪天把取值写成字面量联合时自动变严;
 * - `…StillNumberCheck`:**这一条才是真信号**,也是本条登记的退出条件 —— 断言 Figma
 *   的类型**仍是** `number`。哪天官方收成 `0 \| 1` 字面量联合,`number extends 0 \| 1`
 *   不成立 ⇒ 编译失败,提醒把该项从 runtime 表挪回类型事实表(并撤掉实测依赖)。
 *   已用同形小样验过判别力:`StillNumber<number>` 过、`StillNumber<0 \| 1>` 报
 *   `TS2344: Type '"…"' does not satisfy the constraint 'never'`。
 * 数值域收窄本身只能靠**真机实测冻结**(2026-09-24 Figma 客户端),依据写在
 * `dicts/platform-value-domain.ts`。
 */
type FigmaLayoutGrow = AutoLayoutChildrenMixin['layoutGrow'];
type RuntimeGrowAllow =
  (typeof FIGMA_RUNTIME_VALUE_DOMAIN)['layoutGrow']['allow'][number];

export type FigmaRuntimeGrowInTypingsCheck = ExpectNever<
  Exclude<RuntimeGrowAllow, FigmaLayoutGrow>
>;
export type FigmaRuntimeGrowStillNumberCheck = ExpectNever<
  number extends FigmaLayoutGrow
    ? never
    : 'Figma已把layoutGrow收成类型字面量_挪回PLATFORM_VALUE_DOMAIN'
>;
export type FigmaRuntimeGrowMeaningfulCheck = ExpectNever<
  Exclude<RuntimeGrowAllow, NonNullable<NodeSkeleton['layoutGrow']>>
>;
/** 反向覆盖:Figma 声明的 `layoutGrow` 取值域必须整体落在契约里(契约漏了 ⇒ 收窄管不到它) */
export type FigmaGrowDomainCoverageCheck = ExpectNever<
  Exclude<FigmaLayoutGrow, NonNullable<NodeSkeleton['layoutGrow']>>
>;
