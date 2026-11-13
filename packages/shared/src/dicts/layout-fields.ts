/**
 * auto-layout 字段的静态登记。
 *
 * 只放**字段集合**这类静态字典;每个字段的根因/修法文案仍在
 * `unapplied-prop`(它是那类文案的唯一真源)。
 */

/**
 * 临时关掉 auto-layout 时会被引擎连带重置的布局属性。
 *
 * 实测:只恢复 layoutMode 是不够的 —— 引擎在 layoutMode → NONE 时会把
 * primaryAxisSizingMode / counterAxisSizingMode 重置成另一组默认(AUTO↔FIXED 对调),
 * 结果「调个层序把容器尺寸模式改了」。下面这些一并快照、恢复。
 * 顺序即快照/恢复顺序(先轴模式、再对齐、最后间距与四边 padding)。
 */
export const LAYOUT_PRESERVE_KEYS = [
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'itemSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
] as const;

/** 轴尺寸模式一对:对账与回读只看这两个字段 */
export const AXIS_SIZING_MODES = [
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
] as const;

/**
 * 内层容器高度默认自动、只有最外层容器钉死时,「尺寸按内容撑开」的那句提示。
 * 创建对账(execute)与修改路径回读(writers)共用同一句 —— 同一个事实不写两遍措辞。
 */
export function autoHeightOpenNotice(args: {
  label: string;
  dim: 'width' | 'height';
  got: unknown;
  want: unknown;
}): string {
  return `${args.label} 的 ${args.dim} 按内容撑开成 ${args.got}(请求 ${args.want})——内层容器高度默认自动(不随内容裁切),只有最外层节点容器钉死;要固定就显式传该轴 sizingMode=FIXED 再用 jsd_resize_node 传 height`;
}
