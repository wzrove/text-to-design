/**
 * 「写了但回读不一致」的字段 → 根因 + 可执行出口。
 *
 * 这是该类文案的**唯一真源**:创建路径(buildNode/execute)与修改路径(updateSelection)
 * 共用同一份 —— 此前同一个平台缺陷会在两条路径上各写一句措辞不同的话(或干脆不写),
 * 症状是「回显成功、画布没变,却没有任何提示」。
 *
 * 只在**回读证据成立**时才被引用(readback.ok === false):引擎若真的吃下了值,
 * 这里一个字都不会出现,不靠"我猜它会丢"来报警。
 */
/**
 * 四边 padding 共用一条修法(四个键一个事实,不抄四遍)。
 */
const PADDING_HINT =
  '容器没有生效的 auto-layout 时(layoutMode 为 NONE)padding 不参与布局,引擎可能根本不落值。处理:先 jsd_find 回读该容器的 layoutMode,把 layoutMode 与四边 padding **放在同一次 jsd_set_layout 里**重传;已是布局容器则以 jsd_find 回读到的值为准(它才是渲染用的真源)';

/**
 * sizingMode 的根因只有一句:引擎在开布局/算布局时把轴翻成 AUTO(按内容 hug),
 * 于是调用方给的固定宽高被吃掉。两条路径同一份文案。
 */
const SIZING_MODE_HINT =
  '引擎把该轴翻成了 AUTO(按内容撑开),显式给的对应边尺寸被吃掉 —— 主轴/交叉轴落在哪条边由 layoutMode 决定(HORIZONTAL:主轴=宽、交叉轴=高;VERTICAL 相反)。处理:用 jsd_resize_node 传 width/height 把尺寸钉回去(此时别再重发 set_layout,否则又被翻回),或接受 hug 并把该轴的 sizingMode 显式写成 AUTO 让意图与结果一致';

export const UNAPPLIED_PROP_HINT: Readonly<Record<string, string>> = {
  layoutMode:
    '引擎在布局重算后会回写容器方向(已重试写入一次仍不一致):子节点会按**回读到的**方向排布,方向错了会全叠在同一点(渲染上只看得见一个)。处理:用 jsd_find 复核该容器的 layoutMode,再单独调一次 jsd_set_layout(只传 layoutMode)重设',
  itemSpacing:
    '容器没有生效的 auto-layout 时(layoutMode 为 NONE)itemSpacing 不参与布局,引擎可能根本不落值。处理:先 jsd_find 回读该容器的 layoutMode,不是 HORIZONTAL/VERTICAL 就把 layoutMode 与 itemSpacing **放在同一次 jsd_set_layout 里**重传;已是布局容器则用 jsd_find 取实际值,它才是子项间距的真源',
  paddingTop: PADDING_HINT,
  paddingRight: PADDING_HINT,
  paddingBottom: PADDING_HINT,
  paddingLeft: PADDING_HINT,
  primaryAxisSizingMode: SIZING_MODE_HINT,
  counterAxisSizingMode: SIZING_MODE_HINT,
  fontName:
    '引擎没解析这个 family/style(渲染退回默认字面,而回显看起来是成功的)。**写法约定(实测 2026-09-19)**:`family` 取 `jsd_list_fonts` 的 `fonts[].family`(形如 `SourceHanSansCN_family`),`style` 取同一项 `styles` 里的**全名**(形如 `SourceHanSansCN-Bold`)—— 解析成功引擎会规范化成短名(回读 `{family:"SourceHanSansCN", style:"Bold"}` 属正常,不报警);把 `style` 写成简称 `"Bold"` 或写一个不存在的族时,引擎**原样保留请求值**且渲染用默认字面。处理:照 `fonts[]` 原样取 family + style 重写一次,关键文字另配一次 jsd_export 目检(字重/字面的差异只在小图上看得出)',
  width:
    'TEXT 的 width 被引擎改写:缺省 textAutoResize=WIDTH_AND_HEIGHT 会按内容撑开。要「固定宽 + 自动换行」传 width + textAutoResize:"HEIGHT";要「固定框尺寸、不换行」传 textAutoResize:"NONE"',
  height:
    'TEXT 的 height 被引擎改写:固定高要传 textAutoResize:"NONE";只想固定宽、高度随内容走传 "HEIGHT"(缺省 WIDTH_AND_HEIGHT 与两者都不兼容)',
  textAutoResize:
    'TEXT 的 textAutoResize 未声明却被引擎改成 NONE:给了 width/height 时,引擎的 resize 会把缺省的 WIDTH_AND_HEIGHT 置为 NONE —— 文本仍会换行,但文本框高度不再随内容重算(实测 200 宽的长文本渲染 4 行、height 回读仍是 15),父容器与 auto-layout 会按这个旧高度算,表现为文字被裁切/错位。修法:要「固定宽 + 自动撑高」显式传 width + textAutoResize:"HEIGHT";要「固定框尺寸」显式传 "NONE"(至少让意图与结果一致)。⚠ 更狠的一档是**宽度被钉在最小值**(真机 2026-10-15):建 TEXT 时 characters 为空、又给了一维尺寸,引擎按那次 resize 把宽度钉到 1px(实测只给 height:60 → 宽度 1),之后填 characters 不重算宽度 —— 内容完整写进去了、零告警、画面空白。修法:jsd_resize_node 传 width 钉回去,或建时一次给全 characters 与 width/height',
};

/** 字段不在上表时的兜底说明(仍以回读为证据,只是没有专门的修法提示) */
export const UNAPPLIED_PROP_FALLBACK =
  '该字段回读与本请求不一致(平台改写或忽略)。处理:用 jsd_find 复核它的实际值,再决定重写或改道';
