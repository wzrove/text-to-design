/**
 * 线格式枚举取值的第二处归属:节点字段类枚举(描边 / 文本 / 布局 / 网格 / 矢量)。
 *
 * 为什么与 `platform-value-domain.ts` 分家:那张表只登记**被平台收窄**的属性
 * (登记即进入「按平台算接受集」的判定链);这里的枚举三平台同形、从不参与门控。
 * 混进那张表会让 `GATED_PROP_CANDIDATES` 凭空多出条目,把「三家一样」误报成门控项。
 *
 * 收录判据只有一条:**同一个枚举在 `schemas/` 里出现在 2 处及以上**。只出现一次的
 * 枚举仍留在原地(单写一份不会漂移,挪走只增加跳转)。
 */

/** 描边对齐 */
export const STROKE_ALIGN_VALUES = ['CENTER', 'INSIDE', 'OUTSIDE'] as const;

/** 描边端点;ARROW_* 仅 Figma */
export const STROKE_CAP_VALUES = [
  'NONE',
  'ROUND',
  'SQUARE',
  'ARROW_LINES',
  'ARROW_EQUILATERAL',
] as const;

/** 描边拐角连接 */
export const STROKE_JOIN_VALUES = ['MITER', 'BEVEL', 'ROUND'] as const;

/** 文本水平对齐 */
export const TEXT_ALIGN_HORIZONTAL_VALUES = [
  'LEFT',
  'CENTER',
  'RIGHT',
  'JUSTIFIED',
] as const;

/** 文本垂直对齐 */
export const TEXT_ALIGN_VERTICAL_VALUES = ['TOP', 'CENTER', 'BOTTOM'] as const;

/** 文本自适应;缺省 WIDTH_AND_HEIGHT */
export const TEXT_AUTO_RESIZE_VALUES = [
  'NONE',
  'WIDTH_AND_HEIGHT',
  'HEIGHT',
  'TRUNCATE',
] as const;

/** 大小写变换;缺省 ORIGINAL */
export const TEXT_CASE_VALUES = [
  'ORIGINAL',
  'UPPER',
  'LOWER',
  'TITLE',
] as const;

/** 装饰线;缺省 NONE */
export const TEXT_DECORATION_VALUES = [
  'NONE',
  'UNDERLINE',
  'STRIKETHROUGH',
] as const;

/** 文本截断(仅 Figma;顺序即玩法的两端) */
export const TEXT_TRUNCATION_VALUES = ['DISABLED', 'ENDING'] as const;

/** 自动布局方向 */
export const LAYOUT_MODE_VALUES = ['NONE', 'HORIZONTAL', 'VERTICAL'] as const;

/** 主轴/交叉轴尺寸模式(两个字段同域) */
export const SIZING_MODE_VALUES = ['FIXED', 'AUTO'] as const;

/** 布局网格形态 */
export const LAYOUT_GRID_PATTERN_VALUES = ['ROWS', 'COLUMNS', 'GRID'] as const;

/** 布局网格对齐(网格线位置) */
export const LAYOUT_GRID_ALIGN_VALUES = [
  'MIN',
  'MAX',
  'CENTER',
  'STRETCH',
] as const;

/** 矢量填充规则;缺省 NONZERO */
export const VECTOR_WINDING_RULE_VALUES = [
  'NONZERO',
  'EVENODD',
  'NONE',
] as const;

/** 图片填充缩放方式 */
export const IMAGE_SCALE_MODE_VALUES = ['FILL', 'FIT', 'CROP', 'TILE'] as const;
