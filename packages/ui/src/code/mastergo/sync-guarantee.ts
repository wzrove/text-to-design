/**
 * 编译期契约一致性断言(MasterGo 侧):@mastergo/plugin-typings ↔ shared 的 DesignHost。
 *
 * 与 figma / jsdesign 的镜像断言**目的不同**:那两家的节点结构上满足契约,断言证明
 * 「宿主有这些符号」;MasterGo 的结构不满足契约,靠 `host.ts` + `node-facade.ts` 投影,
 * 所以这里证明的是**映射表本身诚实**:
 * 1. 表里每个「契约名」在 MG typings 里**确实不存在**(否则重命名是多余的);
 * 2. 表里每个「MG 名」在 MG typings 里**确实存在**(否则写的是幻影符号);
 * 3. 文本属性在 MG 的 `TextNode` 上确实没有实例属性、对应 `setRangeXxx` 确实存在;
 * 4. 登记为「MG 无法表达」的成员确实一个都不在 typings 里(登记不诚实会编译失败)。
 *
 * 断言全为类型级,不产出运行时代码;失败信息形如
 * "Type 'flexMode' does not satisfy the constraint 'never'" —— 直接报键名。
 */

// 捕获宿主全局类型(在 import 覆盖前)
type RuntimeSceneNode = SceneNode;
type RuntimeTextNode = TextNode;
type RuntimeImagePaint = ImagePaint;
type RuntimeAutoLayout = AutoLayout;
type RuntimeInstanceNode = InstanceNode;
type RuntimeComponentNode = ComponentNode;
type RuntimeVariantProperty = VariantProperty;
type RuntimeLayoutMixin = LayoutMixin;
type RuntimeEllipseNode = EllipseNode;
type RuntimePolygonNode = PolygonNode;
type RuntimeStarNode = StarNode;
type RuntimePenNode = PenNode;
type RuntimeRowsColsLayoutGrid = RowsColsLayoutGrid;
type RuntimeShadowEffect = ShadowEffect;
type RuntimeBlurEffect = BlurEffect;

import type {
  DesignHost,
  MASTERGO_PROP_TYPE_EXCLUSION,
  MASTERGO_RUNTIME_VALUE_DOMAIN,
  MASTERGO_VALUE_DOMAIN,
  NodeSkeleton,
  NodeType,
  PageSkeleton,
  BlendMode as WireBlendMode,
  Effect as WireEffect,
  Paint as WirePaint,
} from 'text-to-design-shared';
import type {
  GRID_ALIGN_TO_MG,
  KEY_TO_MG,
  MG_BLUR_DEFAULTS,
  MG_BLUR_GRADIENT,
  MG_SHADOW_DEFAULTS,
  MG_TYPE_TO_CONTRACT,
  TEXT_RANGE_SETTERS,
  VALUE_TO_MG,
} from './node-facade';

/** 联合类型全部成员的键并集 */
type KeysOf<T> = T extends unknown ? keyof T : never;
/** 断言 T 为 never;不是 never 时编译错误会打出违规的键名 */
type ExpectNever<T extends never> = T;
type Missing<K extends string, T> = K extends KeysOf<T> ? never : K;
type Declared<K extends string, T> = K extends KeysOf<T> ? true : never;

// ---- 1) 重命名表:契约名必须缺席、MG 名必须存在 ----

type RenameContractKeys = keyof typeof KEY_TO_MG;
type RenameMgKeys = (typeof KEY_TO_MG)[RenameContractKeys];

/** 表里每个契约名在 MG 里都不该存在(存在就说明这行映射是多余的) */
export type RenameNecessityCheck = ExpectNever<
  Declared<RenameContractKeys, RuntimeSceneNode>
>;
/** 表里每个 MG 名都必须真实存在(否则门面写的是幻影字段) */
export type RenameTargetCheck = ExpectNever<
  Missing<RenameMgKeys, RuntimeSceneNode>
>;

// ---- 2) 枚举值表:MG 侧的取值必须落在该字段的取值域里 ----

/** 表里写出来的 MG 取值必须落在该字段的取值域里(用 Exclude 判「有落在外面的」) */
export type AlignItemsValueCheck = ExpectNever<
  Exclude<
    (typeof VALUE_TO_MG)['primaryAxisAlignItems'][keyof (typeof VALUE_TO_MG)['primaryAxisAlignItems']],
    RuntimeAutoLayout['mainAxisAlignItems']
  >
>;
export type DistributeValueCheck = ExpectNever<
  Exclude<
    (typeof VALUE_TO_MG)['counterAxisAlignItems'][keyof (typeof VALUE_TO_MG)['counterAxisAlignItems']],
    RuntimeAutoLayout['crossAxisAlignItems']
  >
>;

// ---- 3) 文本属性:MG 节点上没有实例属性,只有分段 setter ----

type TextRangeContractKeys = keyof typeof TEXT_RANGE_SETTERS;
type TextRangeSetterNames = (typeof TEXT_RANGE_SETTERS)[TextRangeContractKeys];

/** 这批字段在 MG 的 TextNode 上必须**缺席**(否则门面该直接读写而非走 setRange) */
export type TextPropAbsenceCheck = ExpectNever<
  Declared<TextRangeContractKeys, RuntimeTextNode>
>;
/** 对应的 setRangeXxx 必须存在 */
export type TextSetterPresenceCheck = ExpectNever<
  Missing<TextRangeSetterNames, RuntimeTextNode>
>;

// ---- 4) 图片 paint:MG 用 imageRef,线格式用 imageHash(门面负责翻译) ----

export type ImageRefCheck = ExpectNever<Missing<'imageRef', RuntimeImagePaint>>;
export type ImageHashAbsenceCheck = ExpectNever<
  Declared<'imageHash', RuntimeImagePaint>
>;

// ---- 5) 节点类型名:矢量在 MG 叫 PEN,门面翻成本仓的 VECTOR ----

export type PenTypeCheck = ExpectNever<
  Exclude<keyof typeof MG_TYPE_TO_CONTRACT, RuntimeSceneNode['type']>
>;

/**
 * 本仓 14 类里除 VECTOR 外,MG 运行时都要有同名的类型(有 ⇒ 读路径不用翻译)。
 * VECTOR 由 `MG_TYPE_TO_CONTRACT` 从 PEN 翻回来,故单独排除。
 */
export type NodeTypeCoverageCheck = ExpectNever<
  Exclude<Exclude<NodeType, 'VECTOR'>, RuntimeSceneNode['type']>
>;

// ---- 6) 混合哨兵:MG 的 mixed 不是纯字符串,直接比较可能恒 false ----

export const _mixedSymbolCheck: symbol extends PluginAPI['mixed']
  ? true
  : false = true;

// ---- 7) 宿主层:投影项与缺席项都要如实登记 ----

/**
 * **投影项**:MG 有等价能力,但名字/形态不同,由 host.ts 换算(不是「没有」)。
 * - `currentPage` / `root` → `mg` 顶层没有,挂在 `mg.document` 下;
 * - `createVector` → MG 只有 `createPen`(节点类型也叫 `PEN`,由门面翻回 `VECTOR`)。
 *
 * 装饰高(0028)的 `chromeHeight` 也在这里:本平台是**三平台里唯一有真源的**
 * (`ui.viewport.headerHeight`),适配器实现了它 —— 但符号不在 `ui` 这一层
 * (`ui` 只有 `resize`),而在 `ui.viewport` 下,由 host.ts 换算取出 ⇒ 位置不同。
 */
type HostProjectionGap =
  | 'currentPage'
  | 'root'
  | 'createVector'
  | 'chromeHeight';

/**
 * **缺席项**:MG 两级 API 都没有,契约里声明为可选,core 按运行时探测回退或用明确
 * 报错兜住(见 host.ts 头注释)。`createImageAsync` 只是名字不同:MG 叫 `createImage`。
 */
type HostAbsentGap =
  | 'createImageFromBytesAsync'
  | 'ungroup'
  | 'getNodeByIdAsync'
  | 'loadAllPagesAsync'
  | 'setCurrentPageAsync'
  | 'getLocalPaintStylesAsync'
  | 'getLocalTextStylesAsync'
  | 'getLocalEffectStylesAsync'
  | 'getLocalGridStylesAsync';

export type HostContractCheck = ExpectNever<
  Missing<
    Exclude<keyof DesignHost, HostProjectionGap | HostAbsentGap>,
    PluginAPI
  >
>;
/** 投影项的来源必须真的在 document 上(证明「不是没有,是位置不同」) */
export type PageProjectionCheck = ExpectNever<
  Missing<'currentPage', PluginAPI['document']>
>;
/** 反向:登记为缺席的东西必须真的都不在 typings 里 */
export type HostGapHonestyCheck = ExpectNever<
  Declared<HostAbsentGap, PluginAPI>
>;
/** 反向:登记为投影的东西也不该在 mg 顶层(在顶层就说明不用投影,该删登记) */
export type HostProjectionHonestyCheck = ExpectNever<
  Declared<HostProjectionGap, PluginAPI>
>;

export type PageContractCheck = ExpectNever<
  Missing<keyof PageSkeleton, PluginAPI['document']['currentPage']>
>;
export type UiContractCheck = ExpectNever<
  Missing<Exclude<keyof DesignHost['ui'], HostProjectionGap>, PluginAPI['ui']>
>;
export type ViewportContractCheck = ExpectNever<
  Missing<keyof DesignHost['viewport'], PluginAPI['viewport']>
>;

/**
 * 节点契约面:排除掉「重命名」「文本分段」「MG 无法表达」三类之后,其余成员必须同名存在。
 * 三类清单都由上面的表派生,不在这里手抄第二份 —— 表改了,断言跟着改。
 */
type NodeAbsentGap =
  | 'absolutePosition'
  | 'vectorPaths'
  | 'getMainComponentAsync'
  | 'variantGroupProperties'
  | 'boundVariables'
  | 'removeOverrides'
  | 'ungroup'
  | 'textTruncation'
  | 'maxLines';

/**
 * 「存在但形状不同」的两项:
 * - `variantProperties`:MG 是 `Array<{property,value}>`(2958 / 3092 行),门面**投影**成契约的
 *   `Record<string,string>`(真机验证过读得到,这是调用方发现可写属性的唯一入口);
 * - `componentProperties`:MG 是 `Array<ComponentProperties>`(3020 / 3096 行),门面同样**投影**
 *   (键取 `id ?? name`)。
 * 两条断言的共同含义是「**形状确实不同**」—— 哪天 MG 改成 Record,会编译失败提醒回来收编。
 */
export const _componentPropsShapeCheck: NodeSkeleton['componentProperties'] extends InstanceNode['componentProperties']
  ? false
  : true = true;
export const _variantPropsShapeCheck: NodeSkeleton['variantProperties'] extends InstanceNode['variantProperties']
  ? false
  : true = true;
/** 投影的读法依赖这两个字段名(`VariantProperty{property, value}`,2958 行) */
export type VariantPropertyFieldsCheck = ExpectNever<
  Missing<'property' | 'value', RuntimeVariantProperty>
>;

/**
 * 运行时才有、typings 未收录的字段:`InstanceNode.mainComponentId`(字符串)。
 * 真机实测:实例键里有它、而 typings 声明的 `mainComponent` 反而读不到 —— 门面用它
 * 回退解析主组件(见 node-facade.ts)。将来 typings 收录后本断言会失败,回来收编。
 */
type MgTypingsGap = 'mainComponentId';
export type MgGapCheck = ExpectNever<Declared<MgTypingsGap, RuntimeSceneNode>>;

/**
 * 组件/变体属性的写入入口(**typings 收录**情况;注意运行时行为不同 —— 变体值的实际写法
 * 是集合内换绑,见 `variant-swap.ts` 与 0018。这两条断言守的是「typings 里确实有」,
 * 用来在官方改动时提醒回来复核):
 * - `setVariantPropertyValues(Record<string,string>)` 在 `InstanceNode`(3094 行)
 *   与 `ComponentNode`(3057 行)**都有** —— 两个节点类型都能切变体;
 * - `setProperties({[propertyId]: string|boolean})` **只收标量**(3097 行),故门面必须先取
 *   `.value` 并按 propertyId 归键。哪天 MG 改成收对象,这条会失败,回来简化。
 */
export type VariantSetterCheck = ExpectNever<
  Missing<'setVariantPropertyValues', RuntimeInstanceNode>
>;
export type VariantSetterOnComponentCheck = ExpectNever<
  Missing<'setVariantPropertyValues', RuntimeComponentNode>
>;
export const _setPropsArgsCheck: RuntimeInstanceNode['setProperties'] extends (p: {
  [propertyId: string]: string | boolean;
}) => void
  ? true
  : false = true;

export type NodeContractCheck = ExpectNever<
  Missing<
    Exclude<
      keyof NodeSkeleton,
      RenameContractKeys | TextRangeContractKeys | NodeAbsentGap
    >,
    RuntimeSceneNode
  >
>;
/** 反向:登记为无法表达的东西必须真的不在 MG typings 里 */
export type NodeGapHonestyCheck = ExpectNever<
  Declared<NodeAbsentGap, RuntimeSceneNode>
>;

// ---- 8) 平台类型事实表(dicts/platform-value-domain)(0022) ----

/**
 * 表里登记的值域收窄与适用性收窄,必须**真的**是 MG 的收窄 —— 两类断言各两条:
 * - `Meaningful`:被收窄的东西在**契约**里真的存在(防登记笔误:写一个契约里没有的
 *   取值/属性,会让判定永远不触发,而表面看起来"已覆盖");
 * - `Absence` / `Exact`:被收窄的东西在 **MG typings** 里真的缺席(防过度收窄:
 *   把 MG 本来支持的取值也拦掉,是凭空制造限制)。
 * 缺任一条,这张表就退化成又一个"看起来在守、其实没守"的手抄清单。
 */

/** 契约侧取值域(NodeSkeleton 是唯一真源,schema 由它派生) */
type ContractAlign = NonNullable<NodeSkeleton['layoutAlign']>;

/** ② MG 的 `alignSelf` 只有两个取值:被排除的三个必须在契约里存在 */
export type AlignDenyMeaningfulCheck = ExpectNever<
  Exclude<
    (typeof MASTERGO_VALUE_DOMAIN)['layoutAlign']['deny'][number],
    ContractAlign
  >
>;
/** 且必须真的不在 MG 的 `alignSelf` 取值域里(否则是凭空限制) */
export type AlignDenyAbsenceCheck = ExpectNever<
  Extract<
    (typeof MASTERGO_VALUE_DOMAIN)['layoutAlign']['deny'][number],
    RuntimeLayoutMixin['alignSelf']
  >
>;
/** MG 的 `alignSelf` 取值域必须完整落在契约里(契约漏了一个、判定就管不到它) */
export type AlignDomainCoverageCheck = ExpectNever<
  Exclude<RuntimeLayoutMixin['alignSelf'], ContractAlign>
>;
/**
 * **收窄登记的完备性**(本节最重要的一条):线格式取值域 − 本平台取值域 − 登记为
 * 收窄的 = **空**。`alignSelf` 那条走这条;`blendMode` / Paint 类型 / Effect 类型也一并查
 * —— MG 的域是线格式的超集,故这三条不需要 deny,断言写出来即证明"确实不需要"。
 */
export type AlignCompletenessCheck = ExpectNever<
  Exclude<
    ContractAlign,
    | RuntimeLayoutMixin['alignSelf']
    | (typeof MASTERGO_VALUE_DOMAIN)['layoutAlign']['deny'][number]
  >
>;
export type BlendCompletenessCheck = ExpectNever<
  Exclude<WireBlendMode, BlendMode>
>;
export type PaintTypeCompletenessCheck = ExpectNever<
  Exclude<WirePaint['type'], Paint['type']>
>;
export type EffectTypeCompletenessCheck = ExpectNever<
  Exclude<WireEffect['type'], Effect['type']>
>;

/** ③ MG 的 `flexGrow` 是 `0 | 1` 字面量联合:白名单与它**双向**相等 */
export type GrowAllowSubsetCheck = ExpectNever<
  Exclude<
    (typeof MASTERGO_VALUE_DOMAIN)['layoutGrow']['allow'][number],
    RuntimeLayoutMixin['flexGrow']
  >
>;
export type GrowAllowCompleteCheck = ExpectNever<
  Exclude<
    RuntimeLayoutMixin['flexGrow'],
    (typeof MASTERGO_VALUE_DOMAIN)['layoutGrow']['allow'][number]
  >
>;

/**
 * ① 圆角族:登记的缺席项必须在 `EllipseNode` 上**真的缺席**。
 *
 * 注意用 `MgName` 把**契约字段名**翻成 MG 字段名再查 —— 表里写的是契约名
 * (`cornerSmoothing`),而 MG 上叫 `cornerSmooth`;直接拿契约名查 `keyof` 会
 * 因为「名字对不上」而恒真通过(那就成了一条看着在守、其实没守的断言)。
 * `MgName` 复用 `KEY_TO_MG`(那张表本身有「契约名必须缺席 / MG 名必须存在」两条断言)。
 */
type ExcludedProp = keyof typeof MASTERGO_PROP_TYPE_EXCLUSION;
type MgName<K extends string> = K extends keyof typeof KEY_TO_MG
  ? (typeof KEY_TO_MG)[K]
  : K;

export type EllipseCornerAbsenceCheck = ExpectNever<
  Declared<MgName<ExcludedProp>, RuntimeEllipseNode>
>;
/** 顺带确认断言的对象没查错:那个接口的 type 字面量必须就是登记的那个节点类型 */
export const _ellipseTypeCheck: RuntimeEllipseNode['type'] extends NodeType
  ? true
  : false = true;

/**
 * 反向:圆角族在**其它形状**上必须真的存在 —— 防的是「把整组圆角都误登记成
 * MG 不支持」这种更粗的错误(那样上面那条也照样通过)。
 * `Declared<K, T>` 命中才返回 `true`,故 `= true` 即断言「存在」。
 */
export const _polygonCornerCheck: Declared<
  MgName<ExcludedProp>,
  RuntimePolygonNode
> = true;
export const _starCornerCheck: Declared<
  MgName<ExcludedProp>,
  RuntimeStarNode
> = true;
export const _penCornerCheck: Declared<
  MgName<ExcludedProp>,
  RuntimePenNode
> = true;

// ---- 9) 门面的补丁表必须覆盖 MG 的必填字段(0022) ----

/**
 * MG 把 Effect 的一批字段列为**必填**;门面按 {@link MG_SHADOW_DEFAULTS} /
 * {@link MG_BLUR_DEFAULTS} / {@link MG_BLUR_GRADIENT} 补。这三条断言把「补的键」
 * 钉在 typings 上:官方改了必填集合(或改了字段名)会编译失败 —— 此前它们是内联
 * 字面量,真机上「阴影又不落」才发现。
 */
export const _shadowDefaultsCheck: typeof MG_SHADOW_DEFAULTS extends Pick<
  RuntimeShadowEffect,
  'isVisible' | 'blendMode' | 'spread' | 'showShadowBehindNode'
>
  ? true
  : false = true;
export const _blurDefaultsCheck: typeof MG_BLUR_DEFAULTS extends Pick<
  RuntimeBlurEffect,
  'isVisible' | 'blendMode'
>
  ? true
  : false = true;
/** 模糊必填的 `gradient` 是对象(渐进模糊模型),补的默认值必须是它的合法成员 */
export const _blurGradientCheck: typeof MG_BLUR_GRADIENT extends RuntimeBlurEffect['gradient']
  ? true
  : false = true;

// ---- 10) 网格对齐:契约取值 → MG 取值的映射必须落在 MG 取值域里 ----

/**
 * 契约的 `MIN/MAX` 在 MG 叫 `LEFT/RIGHT`(Figma/jsDesign 都叫 `MIN/MAX`)。
 * 值映射表的每个产出必须是 MG `RowsColsLayoutGrid.alignment` 的合法成员。
 */
export type GridAlignValueCheck = ExpectNever<
  Exclude<
    (typeof GRID_ALIGN_TO_MG)[keyof typeof GRID_ALIGN_TO_MG],
    RuntimeRowsColsLayoutGrid['alignment']
  >
>;

// ---- 11) 运行时取值域收窄:登记项必须**在** typings 里(与上面第 8 节方向相反) ----

/**
 * {@link MASTERGO_RUNTIME_VALUE_DOMAIN} 的断言方向与第 8 节**相反**,这不是笔误:
 * 那张表登记「类型不支持」→ 断言「登记的项必须真缺席」;
 * 这张表登记「类型支持、运行时不吃」→ 断言「登记的项必须真**存在**于 typings」。
 * 若某天 MG 把 `FLEX_END` 从取值域里删掉,这条会失败 —— 提醒把它挪回类型事实那张表。
 *
 * 注意比较前必须过 `VALUE_TO_MG` 把**契约名**翻成 MG 名(表里写的是 `MAX`,
 * MG 上叫 `FLEX_END`):直接拿契约名去比 MG 取值域会恒不相等、断言恒真 —— 那正是
 * 第 1 节踩过的「看着在守其实没守」的另一种写法。
 *
 * 另一半断言(「登记的项必须在契约枚举里」)与第 8 节同因:写一个契约里没有的值,
 * 判定永远不触发,表面看却"已覆盖"。
 */
type RuntimeDeniedMainAlign =
  (typeof MASTERGO_RUNTIME_VALUE_DOMAIN)['primaryAxisAlignItems']['deny'][number];
type RuntimeDeniedCrossAlign =
  (typeof MASTERGO_RUNTIME_VALUE_DOMAIN)['counterAxisAlignItems']['deny'][number];

/** 契约值 → MG 值(门面表是唯一真源;缺键会在这里编译失败) */
type MgMainAlign =
  (typeof VALUE_TO_MG)['primaryAxisAlignItems'][RuntimeDeniedMainAlign];
type MgCrossAlign =
  (typeof VALUE_TO_MG)['counterAxisAlignItems'][RuntimeDeniedCrossAlign];

export type RuntimeMainAlignMeaningfulCheck = ExpectNever<
  Exclude<
    RuntimeDeniedMainAlign,
    NonNullable<NodeSkeleton['primaryAxisAlignItems']>
  >
>;
export type RuntimeMainAlignInTypingsCheck = ExpectNever<
  Exclude<MgMainAlign, RuntimeAutoLayout['mainAxisAlignItems']>
>;
export type RuntimeCrossAlignMeaningfulCheck = ExpectNever<
  Exclude<
    RuntimeDeniedCrossAlign,
    NonNullable<NodeSkeleton['counterAxisAlignItems']>
  >
>;
export type RuntimeCrossAlignInTypingsCheck = ExpectNever<
  Exclude<MgCrossAlign, RuntimeAutoLayout['crossAxisAlignItems']>
>;
