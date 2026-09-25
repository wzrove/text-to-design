import type { NodeTypeKey } from './node-type';

/**
 * 属性适用性字典(唯一真源):节点属性 → 该属性在哪些节点类型上有意义。
 *
 * 为什么收进 shared:这张表描述的是「属性 × 节点类型」的领域事实,写路径与
 * 反馈层必须看到同一份取值 ——
 *   ① 写路径(shared/core/update.ts)按节点类型 gate 字段:类型不匹配就跳过赋值;
 *   ② 反馈层(mcp-server 的属性类工具)用它把「请求了但被静默跳过」的属性
 *      点名给调用方,否则调用方会以为改成功了。
 * 此前 ② 是手抄的一份,注释里只能写「与 core/update.ts 的显式类型 gate 保持
 * 同步」—— 靠人同步的事实迟早漂移。现在 ① 的 per-prop gate 直接引用本表,
 * 两侧共用一份数据。
 *
 * 收录范围:只收「按节点类型 gate」的字段。各类型普遍存在的字段(fills / strokes
 * / effects 等,写路径靠 `'x' in node` 守卫)不收录 —— 收进来会把「该平台不支持」
 * 误报成「与目标节点类型不匹配」。几何字段(x / y / width / height)永远生效,
 * 同样不收录。
 */
export const PROP_APPLICABILITY: Readonly<
  Record<string, readonly NodeTypeKey[]>
> = {
  pointCount: ['POLYGON', 'STAR'],
  innerRadius: ['STAR'],
  arcData: ['ELLIPSE'],
  characters: ['TEXT'],
  fontSize: ['TEXT'],
  fontName: ['TEXT'],
  textAlignHorizontal: ['TEXT'],
  textAlignVertical: ['TEXT'],
  textAutoResize: ['TEXT'],
  textCase: ['TEXT'],
  textDecoration: ['TEXT'],
  lineHeight: ['TEXT'],
  letterSpacing: ['TEXT'],
  textTruncation: ['TEXT'],
  maxLines: ['TEXT'],
  // 布局字段:FRAME 之外,COMPONENT / COMPONENT_SET 同样继承 frame 的自动布局 mixin ——
  // 三平台 typings 一致(Figma `ComponentNode/ComponentSetNode extends (Base)FrameMixin`、
  // jsDesign 同形、MasterGo `… extends FrameContainerMixin extends AutoLayout`),见 0021。
  // 此前只写 FRAME,导致组件集的变体重叠时无法用 jsd_set_layout 排布。
  // 运行时若某平台不认(写不进去),由 layoutWriter.settle 的回读点名兜住(0007),不静默失效。
  layoutMode: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  itemSpacing: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  paddingTop: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  paddingRight: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  paddingBottom: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  paddingLeft: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  primaryAxisSizingMode: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  counterAxisSizingMode: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  primaryAxisAlignItems: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  counterAxisAlignItems: ['FRAME', 'COMPONENT', 'COMPONENT_SET'],
  cornerRadius: [
    'FRAME',
    'RECTANGLE',
    'ELLIPSE',
    'POLYGON',
    'STAR',
    'VECTOR',
    'BOOLEAN_OPERATION',
  ],
  cornerSmoothing: [
    'FRAME',
    'RECTANGLE',
    'ELLIPSE',
    'POLYGON',
    'STAR',
    'VECTOR',
    'BOOLEAN_OPERATION',
  ],
  // 布局网格与裁剪只在 frame 族混入上声明,三平台一致(2026-09-24 逐平台核对):
  // - Figma:`BaseFrameMixin.layoutGrids / .clipsContent`(plugin-api.d.ts:9193 / 9207),
  //   而 `RectangleNode`(10728)不含该 mixin;
  // - jsDesign:同形,`BaseFrameMixin`(plugin-api.d.ts:874 / 876);
  // - MasterGo:`FrameContainerMixin.layoutGrids / .clipsContent`(index.d.ts:2638 / 2637),
  //   `RectangleNode`(2776)extends DefaultShapeMixin + ConstraintMixin + CornerMixin +
  //   RectangleStrokeWeightMixin —— 不含 FrameContainerMixin。
  // 三平台一致 ⇒ 是**领域事实**,不是平台收窄,故写在这里而不是 platform-value-domain。
  // 真机症状(0022 复验踩到):给矩形写 layoutGrids 回包「已更新 1 个节点」,回读无该字段 ——
  // 写路径此前对这两个字段完全没有适用性判定(paintWriter / passthroughWriter 直写)。
  layoutGrids: ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'],
  clipsContent: ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'],
  topLeftRadius: ['FRAME', 'RECTANGLE'],
  topRightRadius: ['FRAME', 'RECTANGLE'],
  bottomLeftRadius: ['FRAME', 'RECTANGLE'],
  bottomRightRadius: ['FRAME', 'RECTANGLE'],
};

/**
 * 属性是否适用于该节点类型。
 *
 * 未收录的属性一律视为「不按类型 gate」→ 适用(调用方按 fail-open 处理:
 * 拿不准就别拦,交给写路径的 `'in'` 守卫和结果 warnings 兜底)。
 */
export function propAppliesTo(prop: string, type: string): boolean {
  const types = PROP_APPLICABILITY[prop];
  return types == null || types.some((t) => t === type);
}

/**
 * 一次请求里「属性 × 目标节点类型」不匹配的字段 → 一句点名。
 *
 * 放在字典里而不是各层各写一遍:创建路径(`core/execute.ts`)与修改路径
 * (`mcp-server/tools/update-common.ts`)说的是**同一个事实**,此前只有修改路径
 * 有这句话,创建路径遇到同样情形是静默丢弃(给矩形写 `layoutGrids` 就属这一类)。
 * 文案与允许类型都由本表派生,加字段不必再改文案。
 */
export function applicabilityMissNotice(
  keys: readonly string[],
): string | null {
  const missed = keys.filter((k) => PROP_APPLICABILITY[k] != null);
  if (missed.length === 0) return null;
  return `以下属性与目标节点类型不匹配,已被忽略:${missed
    .map((k) => `${k}(仅适用于 ${PROP_APPLICABILITY[k].join('/')})`)
    .join('、')}`;
}
