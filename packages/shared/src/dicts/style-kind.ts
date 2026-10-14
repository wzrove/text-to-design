/**
 * 本地样式类别(单一真源):枚举结果 `styles[].type` 的**取值域**。
 *
 * 八项是三家引擎 `StyleType` 的**并集**:Figma 与 jsDesign 各四类(PAINT / TEXT / EFFECT /
 * GRID,`@figma/plugin-typings` `plugin-api.d.ts:12372` / `@jsdesigndeveloper/plugin-typings`
 * `plugin-api.d.ts:1137`),MasterGo 八类(后者四类 STROKE_WIDTH / CORNER_RADIUS / PADDING /
 * SPACING 只此一家,`@mastergo/plugin-typings` `dist/index.d.ts:1810`,工厂 `:1459-1468`)。
 * 名字一律取 MG 的原词,不另造(0024:按引擎词汇原样,不引入归一化层)。
 *
 * 并集进契约 ≠ 三家都能建:某类样式在某个平台有没有对应工厂,是**分平台事实**,登记在
 * `dicts/platform-value-domain.ts` 的样式类别表,由 core 写路径判(0022)—— 别在这里按
 * 平台删项,那等于把「另外两家没有」说成「样式没有这一类」。
 *
 * 四类各自对应一个引擎 getter(`getLocalPaintStyles` / `TextStyles` / `EffectStyles` /
 * `GridStyles`)—— 它们**不是一次批量查询的四个选项**,而是四次互不相干的调用
 * (0042):任一类失败/缺失不该连坐其余三类。
 *
 * 曾经这里还兼作 `list_styles` 的筛选入参域(`kinds` + 单类资源 `jsd://styles/{kind}`),
 * 那是给「哪一类挂死」取证的探针;0043 把判据换成平台能力声明(`styleEnumeration`)后
 * 探针已摘 —— 不该问的平台一个 getter 都不调,「按类少问」不再承载任何判断。
 * dict 留下是因为 `styles[].type` 的取值域还需要它一处。
 */
export const STYLE_KINDS = [
  'PAINT',
  'TEXT',
  'EFFECT',
  'GRID',
  'STROKE_WIDTH',
  'CORNER_RADIUS',
  'PADDING',
  'SPACING',
] as const;

export type StyleKind = (typeof STYLE_KINDS)[number];

/** MG 独有的那四类(另两家的 `StyleType` 里没有);判据见上面的行号 */
export const MG_ONLY_STYLE_KINDS = [
  'STROKE_WIDTH',
  'CORNER_RADIUS',
  'PADDING',
  'SPACING',
] as const satisfies readonly StyleKind[];

/** 三家共有的四类:样式的四个 getter 与灌值逻辑(`core/styles.ts` 的 `writeToStyle`)都按这四类写 */
export const COMMON_STYLE_KINDS = [
  'PAINT',
  'TEXT',
  'EFFECT',
  'GRID',
] as const satisfies readonly StyleKind[];
