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
  layoutMode: ['FRAME'],
  itemSpacing: ['FRAME'],
  paddingTop: ['FRAME'],
  paddingRight: ['FRAME'],
  paddingBottom: ['FRAME'],
  paddingLeft: ['FRAME'],
  primaryAxisSizingMode: ['FRAME'],
  counterAxisSizingMode: ['FRAME'],
  primaryAxisAlignItems: ['FRAME'],
  counterAxisAlignItems: ['FRAME'],
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
