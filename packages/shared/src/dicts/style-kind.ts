/**
 * 本地样式类别(单一真源):枚举结果 `styles[].type` 的**取值域**。
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
export const STYLE_KINDS = ['PAINT', 'TEXT', 'EFFECT', 'GRID'] as const;

export type StyleKind = (typeof STYLE_KINDS)[number];
