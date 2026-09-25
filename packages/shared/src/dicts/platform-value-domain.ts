/**
 * 平台类型事实声明表(唯一真源):按平台登记**比线格式更窄**的取值域与适用性。
 *
 * 为什么需要这份表:线格式(`schemas/*`)按**全平台超集**声明 —— 它要同时满足三个
 * 平台的并集;而「某个值能不能被某个平台表达」是**分平台**的事实。此前这条事实没有
 * 归属:`schemas` 只能声明超集,`core/props/writers.ts` 只做 `'in' in node` 的存在性
 * 守卫(不看值域),于是唯一知道值域差异的地方是**平台门面**(如 MG 的 alignSelf
 * 只有 STRETCH/INHERIT)—— 而门面手上既没有 `RuntimeContext`(不知道"当前是哪个
 * 平台"以外的事)也没有 `WriteOutcome`(没有出口),只能打 console,调用方拿到的是
 * 「成功」而画布没变(违反 0007)。判定归位到 core 写路径的理由与代价见决策 0022。
 *
 * **收录范围(刻意收窄)**:只登记「比线格式更窄」的项 —— 三平台与线格式同形的部分
 * 一个字都不写。收进来只是把事实抄第二遍,还会把「该平台不支持」误报成「值不合法」。
 *
 * 三条硬纪律:
 * 1. 登记方向是**声明事实**,不是防御:表里写「MG 的 alignSelf 只有 STRETCH/INHERIT」,
 *    而不是「其它值都试试看」;
 * 2. 每条登记都必须能在对应平台的 typings 里对上 —— 由该平台薄壳包的
 *    `sync-guarantee.ts` 做**双向**类型级断言(登记的缺席项必须真缺席、放行的值必须
 *    真在取值域里),登记不诚实会 `tsc --noEmit` 失败;
 * 3. 未登记的属性一律 fail-open(放行):拿不准就别拦,交给存在性守卫与回读兜底 ——
 *    与 `RuntimeContext` 未注入时的既有口径一致(0002)。
 */

import type { NodeTypeKey } from './node-type';
import type { PlatformKey } from './platform';

/**
 * 一条取值域规则。两种形态**互斥使用**,不要同时写:
 * - `deny`:本平台 typings 里没有这些取值(如 jsDesign 无 `PASS_THROUGH`)。
 *   选择 deny 而非 allow 的理由:线格式的枚举是超集,「没有哪几个」比「有哪几个」
 *   更短、也更贴近 typings 的事实(typings 里就是缺那几个字面量);
 * - `allow`:本平台把取值域收得比线格式的类型更紧(如 MG 的 `flexGrow` 是 `0 | 1`
 *   而线格式是 `number`)—— 这类"数值域"没有"缺了哪几个字面量"的说法,只能列白名单。
 */
export interface ValueDomainRule {
  /** 白名单:本平台只接受这些取值(数值域收窄用) */
  readonly allow?: readonly (string | number)[];
  /** 黑名单:本平台 typings 里没有这些取值 */
  readonly deny?: readonly string[];
}

/**
 * 契约的 `blendMode` 取值域(17 值)。
 *
 * 放在 dicts 而不是内联在 `schemas/base.ts`:① 本仓约定静态字典统一收在 `dicts/`
 * (见 AGENTS.md);② 被平台收窄的属性需要知道「候选有哪些」才能算出「本平台接受
 * 什么」并填进被拒文案 —— 只说「不支持 MIN/CENTER/MAX」不可执行,调用方还得猜。
 * 它就是 schema 枚举的唯一真源,不是第二份手写。
 */
export const BLEND_MODE_VALUES = [
  'PASS_THROUGH',
  'NORMAL',
  'DARKEN',
  'MULTIPLY',
  'COLOR_BURN',
  'LIGHTEN',
  'SCREEN',
  'COLOR_DODGE',
  'OVERLAY',
  'SOFT_LIGHT',
  'HARD_LIGHT',
  'DIFFERENCE',
  'EXCLUSION',
  'HUE',
  'SATURATION',
  'COLOR',
  'LUMINOSITY',
] as const;

/** 契约的 `layoutAlign` 取值域;同样是 `schemas/shared-props.ts` 枚举的真源 */
export const LAYOUT_ALIGN_VALUES = [
  'MIN',
  'CENTER',
  'MAX',
  'STRETCH',
  'INHERIT',
] as const;

/** 契约的 `primaryAxisAlignItems` 取值域(主轴) */
export const PRIMARY_AXIS_ALIGN_VALUES = [
  'MIN',
  'CENTER',
  'MAX',
  'SPACE_BETWEEN',
] as const;

/** 契约的 `counterAxisAlignItems` 取值域(交叉轴,无 SPACE_BETWEEN) */
export const COUNTER_AXIS_ALIGN_VALUES = ['MIN', 'CENTER', 'MAX'] as const;

/**
 * 节点级 `layoutGrids` **写后无法在一次执行内验证**的平台。
 *
 * 与上面几张表的差别:那些表记的是「值合不合法 / 字段名对不对」,这条记的是
 * **验证手段本身不成立** —— 写入后同一次执行内怎么读都读得到(连按 id 重新取数
 * 也一样),而下一次调用的 `jsd_find` 却又读不到。引擎在当前执行里收下了值(可能
 * 只是未提交状态),提交后文档里没有它 ⇒ 判据在**同一个执行内**不可能成立。
 *
 * 故这些平台上既不能说「已生效」也不能说「写失败」,只能如实点名**不可验证**并给
 * 目检出口(0007:静默失效比报错更糟)。
 *
 * ⚠ 名单**只留 MasterGo**。jsDesign 曾在此列,2026-09-24 复验**撤回**:它当年
 * 「读不到」的根因不是平台不落盘,而是**我们的值不合法** —— 它的 `set_layoutGrids`
 * 按判别式联合逐变体校验(STRETCH 要 offset 且**不能**带 sectionSize、CENTER 反之、
 * MIN/MAX 两者都要),我们少给了 `sectionSize` / `offset`,引擎整条拒绝且此前静默。
 * 归一化补齐后(见 `core/normalize.ts`)五种形态全部落盘并**回读到值** ⇒ 判据成立。
 * 教训:**把可修的参数问题记成「平台不可验证」,会掩盖真正的根因** —— 撤出时把
 * 原因写在这里,免得后人又加回去。
 */
export const LAYOUT_GRID_UNVERIFIABLE_PLATFORMS: readonly PlatformKey[] = [
  // MG:**已用补齐后的参数复验(2026-09-24,MG 客户端)** —— 五种合法形态(ROWS 默认
  // STRETCH / ROWS MIN / ROWS CENTER / COLUMNS MIN / GRID)全部**零落盘**,且与
  // jsDesign 同一套参数、同一条写路径 ⇒ 不是我们的参数问题,是引擎不收节点级网格
  // (此前「8 帧成 1 条」是**旧参数**时期的观测,别再拿它当依据)。
  'mastergo',
];

/**
 * 被平台收窄的属性 → 契约的完整取值域。被拒文案靠它算「本平台接受什么」。
 * 新增被收窄的属性时一并登记,否则文案退化成只说「不支持什么」。
 */
export const GATED_PROP_CANDIDATES: Readonly<
  Record<string, readonly string[]>
> = {
  blendMode: BLEND_MODE_VALUES,
  layoutAlign: LAYOUT_ALIGN_VALUES,
  primaryAxisAlignItems: PRIMARY_AXIS_ALIGN_VALUES,
  counterAxisAlignItems: COUNTER_AXIS_ALIGN_VALUES,
};

/** 一张表的形态:属性名 → 规则 */
type ValueDomainTable = Readonly<Record<string, ValueDomainRule>>;

/** 平台 → 属性 → 本平台没有该字段的节点类型 */
type PropTypeExclusionTable = Readonly<Record<string, readonly NodeTypeKey[]>>;

/**
 * jsDesign 的取值域收窄。
 *
 * `BlendMode` 少 `PASS_THROUGH`(16 值 vs 线格式 17 值)。
 * 证据:`@jsdesigndeveloper/plugin-typings` 的 `BlendMode` 联合;
 * 双向断言见 `ui/src/code/jsdesign/sync-guarantee.ts`(被排除的值必须真缺席、
 * 且在契约枚举里真的存在 —— 否则是登记笔误)。
 */
export const JSDESIGN_VALUE_DOMAIN = {
  blendMode: { deny: ['PASS_THROUGH'] },
} as const satisfies ValueDomainTable;
/**
 * MasterGo 的取值域收窄;两项都来自它的 `AutoLayout`/`LayoutMixin` 子项成员
 * (与 Figma 同名成员取值域不同):
 * - `alignSelf` 只有 `STRETCH | INHERIT`;
 * - `flexGrow` 是 `0 | 1` 的**字面量联合**(Figma / jsDesign 都是 `number`)——
 *   数值域收窄没有"缺了哪几个字面量"的说法,只能列白名单(`allow`)。
 */
export const MASTERGO_VALUE_DOMAIN = {
  layoutAlign: { deny: ['MIN', 'CENTER', 'MAX'] },
  layoutGrow: { allow: [0, 1] },
} as const satisfies ValueDomainTable;

/**
 * 平台 → 属性 → 取值域规则。**只登记收窄项**(见文件头「收录范围」)。
 *
 * 下面的分平台常量都带 `as const satisfies`,故它们**同时**是:
 * ① 运行期可按下标查询的表(导出的是下面这张宽类型);② 编译期可断言的字面量类型
 * (`sync-guarantee.ts` 直接对分平台常量做 `typeof` 断言)。写一份数据,两种用法。
 */
export const PLATFORM_VALUE_DOMAIN: Readonly<
  Partial<Record<PlatformKey, ValueDomainTable>>
> = {
  jsdesign: JSDESIGN_VALUE_DOMAIN,
  mastergo: MASTERGO_VALUE_DOMAIN,
};

/**
 * MasterGo 的适用性收窄:这两条属性的字段来自 `CornerMixin`,而 MG 的
 * `EllipseNode` **不含**该 mixin(对照:同平台的 RectangleNode / PolygonNode /
 * StarNode / PenNode 都显式 `extends CornerMixin`)—— 椭圆上没有 `cornerRadius`
 * 也没有 `cornerSmooth`。反向断言见 `ui/src/code/mastergo/sync-guarantee.ts`:
 * 登记为缺席的必须真缺席,**且**同平台的 Rectangle/Polygon/Star/Pen 必须真的有
 * (`cornerSmooth` 在那些类型上缺席会编译失败)—— 后一条防的是「把整组圆角都误登记成
 * MG 不支持」这种更粗的错误。
 */
export const MASTERGO_PROP_TYPE_EXCLUSION = {
  cornerRadius: ['ELLIPSE'],
  cornerSmoothing: ['ELLIPSE'],
} as const satisfies PropTypeExclusionTable;

export const PLATFORM_PROP_TYPE_EXCLUSION: Readonly<
  Partial<Record<PlatformKey, PropTypeExclusionTable>>
> = {
  mastergo: MASTERGO_PROP_TYPE_EXCLUSION,
};

/**
 * 平台 → 属性 → **运行时**取值域收窄:**typings 里合法、真机静默忽略**。
 *
 * 与 {@link PLATFORM_VALUE_DOMAIN} 的区别只有一条,但足以决定它们必须分表:**断言方向相反**。
 * 那张表登记的是**类型事实**(值不在 typings 的取值域里),断言要求「登记的项必须真缺席」;
 * 这张表登记的是**运行时行为**(类型声明支持、引擎不吃),断言要求「登记的项必须真存在」
 * —— 否则该登记本来就该由那张表表达。混成一张表,断言会自相矛盾。
 * (这一类在 0017 的复核表里已被点名为独立现象:「类型里有、运行时没有」。)
 *
 * **退出条件**:引擎开始接受某个值就删掉对应项并真机复验 —— 这张表是**实测冻结**的,
 * 没有编译期信号会在引擎修好时提醒你(它只会继续把合法值拦下来)。
 */
export const MASTERGO_RUNTIME_VALUE_DOMAIN = {
  // 2026-09-24 真机逐值实测(MG 客户端,FRAME + flexMode=HORIZONTAL + 两个子节点,
  // 每次只写一个值再回读):MIN→MIN、CENTER→CENTER 生效;
  // **MAX→回读仍是上一个生效值**、SPACE_BETWEEN→同。
  // 即引擎对 `mainAxisAlignItems/crossAxisAlignItems` 只吃 FLEX_START/CENTER,
  // 写入被**静默忽略**(不是归一化成 FLEX_START:写 MAX 时旧值是 CENTER 也照样留 CENTER)。
  // 而 MG typings 的取值域明明含 'FLEX_END' / 'SPACING_BETWEEN'(index.d.ts:2594-2595)。
  primaryAxisAlignItems: { deny: ['MAX', 'SPACE_BETWEEN'] },
  counterAxisAlignItems: { deny: ['MAX'] },
} as const satisfies ValueDomainTable;

/**
 * jsDesign 的**运行时**取值域收窄(2026-09-24 真机实测):与 MG **同形** ——
 * 子项侧只认 `STRETCH`/`INHERIT` 与 `0|1`,而 typings 写的是完整 5 值 + `number`
 * (jsDesign `LayoutMixin`:`layoutAlign: "MIN"|"CENTER"|"MAX"|"STRETCH"|"INHERIT"`、
 * `layoutGrow: number`)。故这是运行时事实,不是类型收窄 —— 与 MG 那两条同理。
 *
 * 实测(父 = 纵向 auto-layout,子 40×40;父交叉轴 `counterAxisAlignItems: MAX` 时
 * 子节点默认贴右 `x=150`):
 * - `layoutAlign: 'MIN'` → 无任何变化(`x` 仍 150);`'CENTER'`/`'MAX'` 同;
 * - `layoutAlign: 'STRETCH'` → 立刻生效(`w` 40 → 180),故写入路径本身是通的;
 * - `layoutGrow: 1` → 生效(h 撑满);`0.5`/`2`/`3` → 全部无变化。
 *
 * 误报方向:不登记 ⇒ 这些值**静默 no-op**(回包成功、画布不变、结果零告警),
 * 正是 0007 要根除的形态;登记后由 core 写前拦下并点名。
 */
export const JSDESIGN_RUNTIME_VALUE_DOMAIN = {
  layoutAlign: { deny: ['MIN', 'CENTER', 'MAX'] },
  layoutGrow: { allow: [0, 1] },
} as const satisfies ValueDomainTable;

/**
 * Figma 的**运行时**取值域收窄(2026-09-24 真机实测)。
 *
 * `layoutGrow`:typings 写的是 `number`,但引擎校验只接受 **0 | 1** —— 写 3 直接抛
 * `in set_layoutGrow: Property "layoutGrow" failed validation: … Invalid literal
 * value, expected 0 / expected 1`(Figma 的「Fill container」本身是布尔语义)。
 * 与 MG(类型里就是 `0|1`)、jsDesign(运行时只认 `0|1`)**三平台结果一致**,只是
 * 各自的依据不同:MG 是类型事实、jsDesign/Figma 是运行时事实 —— 故 Figma 收在这里。
 *
 * 依据坐实到 `@figma/plugin-typings` 1.137.0:`layoutGrow` 声明在
 * `AutoLayoutChildrenMixin`(`plugin-api.d.ts:8281`)为 `number`,而**同一段 JSDoc 的
 * `@remarks` 自己写了**「0 and 1 are currently the only supported values」
 * (`:8277`)—— 即收窄活在文档 + 运行时,类型层面不收窄,所以它进的是**这张表**而不是
 * 类型事实表。退出条件由 `ui/src/code/figma/sync-guarantee.ts` 的
 * `FigmaRuntimeGrowStillNumberCheck` 守着:官方哪天把它收成字面量联合 ⇒ `tsc` 失败,
 * 届时挪进 {@link PLATFORM_VALUE_DOMAIN}。
 *
 * 收进表后由 core **写前**拦下并点名允许取值,而不是让引擎抛工具级错误。
 */
export const FIGMA_RUNTIME_VALUE_DOMAIN = {
  layoutGrow: { allow: [0, 1] },
} as const satisfies ValueDomainTable;

export const PLATFORM_RUNTIME_VALUE_DOMAIN: Readonly<
  Partial<Record<PlatformKey, ValueDomainTable>>
> = {
  figma: FIGMA_RUNTIME_VALUE_DOMAIN,
  jsdesign: JSDESIGN_RUNTIME_VALUE_DOMAIN,
  mastergo: MASTERGO_RUNTIME_VALUE_DOMAIN,
};

/** 命中哪张表 —— 决定被拒文案说「类型不支持」还是「运行时实测不接受」 */
type DomainKind = 'typings' | 'runtime';

function findRule(
  platform: PlatformKey | null,
  prop: string,
): { rule: ValueDomainRule; kind: DomainKind } | null {
  if (platform == null) return null;
  const runtime = PLATFORM_RUNTIME_VALUE_DOMAIN[platform]?.[prop];
  if (runtime != null) return { rule: runtime, kind: 'runtime' };
  const typings = PLATFORM_VALUE_DOMAIN[platform]?.[prop];
  if (typings != null) return { rule: typings, kind: 'typings' };
  return null;
}

/** 该平台是否接受这个取值;未登记(或未注入平台)一律放行 */
export function platformValueAllowed(
  platform: PlatformKey | null,
  prop: string,
  value: unknown,
): boolean {
  const hit = findRule(platform, prop);
  if (hit == null) return true;
  const { rule } = hit;
  if (rule.allow != null) {
    return rule.allow.some((v) => v === value);
  }
  const deny = rule.deny ?? [];
  return !deny.some((v) => v === value);
}

/** 该平台在该节点类型上是否有这个字段;未登记(或未注入平台)一律放行 */
export function platformPropAllowedOn(
  platform: PlatformKey | null,
  prop: string,
  type: string,
): boolean {
  if (platform == null) return true;
  const excluded = PLATFORM_PROP_TYPE_EXCLUSION[platform]?.[prop];
  if (excluded == null) return true;
  return !excluded.some((t) => t === type);
}

/**
 * 被拒时的可执行出口文案:说清本平台接受什么。
 * 表里没有该属性时返回 null(调用方据此走通用兜底句)。
 */
export function platformValueRejectionHint(
  platform: PlatformKey | null,
  prop: string,
): string | null {
  const hit = findRule(platform, prop);
  if (hit == null) return null;
  const { rule, kind } = hit;
  // `allow` 规则本身就是白名单;`deny` 规则要用「候选 − 被排除」把接受集算出来
  const accepted =
    rule.allow != null
      ? rule.allow.map(String)
      : (GATED_PROP_CANDIDATES[prop] ?? []).filter((v) =>
          platformValueAllowed(platform, prop, v),
        );
  const parts: string[] = [];
  parts.push(
    kind === 'runtime'
      ? '运行时实测不接受(平台类型虽然声明支持)'
      : '本平台类型不支持',
  );
  if (accepted.length > 0) parts.push(`实测/类型支持 ${accepted.join(' / ')}`);
  return parts.join(';');
}
