---
title: "设计策略总纲"
when: "从零创建界面、整页或重做结构前读取；覆盖现有资源复用、语义分层、SVG 与原生节点分工、样式和文本验收。"
args: "参数 screen(要设计的界面名称,如「登录页」,可省)"
role: assistant
---
# 界面设计与复用

用于新建界面、整页或结构改造。布局细节见 [自动布局](auto-layout.md)，多步操作见 [批量编排](script-ops.md)。

## 1. 从文档现状选件

先 `jsd_get_page` 读 assets.summary 与各类清单，再按需 `jsd_find` 读参照节点。取现有颜色、字号、间距与组件名称；保留用户指定的风格和尺寸。

| 要复用的内容 | 入口与判据 |
| --- | --- |
| 按钮、卡片、列表项的结构 | 已有 COMPONENT 用 `jsd_create_instance`；同级重复单元先抽主件再铺实例 |
| 同一结构的状态或尺寸 | 查 assets.variants[].properties；构建和切值先读 [变体集](variant-set.md) 的平台边界 |
| 固定颜色、排版、效果、网格 | 复用样式 id，通过 fillStyleId / strokeStyleId / textStyleId / effectStyleId 引用 |
| 随模式或主题变化的语义值 | 有变量能力才走 [变量绑定](variable-binding.md)；无变量入口时改用支持的样式或节点字段 |

清单为空不证明资源不存在：先读 note 与 capabilities。组件清单在即时设计、MasterGo 可能仅覆盖当前页；未声明 styleEnumeration 的平台，从节点 *StyleId 获取已有样式。不要为了枚举调用未知 async 接口。

## 2. 先分层，再建节点

- 按用途分容器，例如：登录页 → 页头、输入区、操作区；输入区 → 邮箱行、密码行；每行再含标签与输入框。
- 复杂树按分区拆批，保持最终层级完整；不要把所有图元直挂屏根，也不要把整屏塞进一次 children。
- `jsd_reparent_nodes` 显式给目标 parentId，跨父级保持绝对位置并换算相对坐标；进入布局容器后由布局接管。
- 结构就位后统一设置布局。同轴等距内容用 itemSpacing；叠放装饰、图表绘图区按坐标定位。
- z 是父级 children 下标，越大越靠上；需要调层序用 reparent 的 index，并核对结果。不要新建重复图层遮盖旧内容。

## 3. 图形与文字分工

| 后续编辑需求 | 表达 |
| --- | --- |
| 换数据、调柱高、改折线点或圆弧 | [代码生成 SVG](chart-by-code.md)，保留源脚本与数据 |
| 进入布局、绑变量或样式、作为组件复用 | 原生 FRAME / RECTANGLE / TEXT 等 |
| 标题、图例、数值需单独改文案 | 原生 TEXT；绘图区可保留 SVG |

常见卡片：FRAME 骨架 + 原生标题、数值、图例 + SVG 绘图区。SVG 的分组保留与路径回读依平台而异，不能作为跨平台保证。

## 4. 样式与文本

1. 先把同用途的近似色收敛成同值，避免创建多条重复样式。
2. 无现成样式时，用样板节点 `jsd_create_style({kind:"PAINT", name:"色板/主色", fromNodeId:样板id})`，记录返回 id；类别须在当前平台支持范围内。
3. 创建节点可直接带支持的 *StyleId；修改走对应 `jsd_set_*`。文字填充也可与排版一起传给 `jsd_set_text`。
4. 字体 family/style 从 `jsd_list_fonts` 成对取原值，不把完整 style 改成简写 Bold。固定宽自动高用 width + `textAutoResize:"HEIGHT"`；固定文本框用 NONE 并给尺寸。

fills/strokes 必须是数组；纯描边图形显式用 `fills:[]`，不要用透明白底代替无填充。给后代批量刷样式时 recursive 不包含容器自身，确需包含才传 includeSelf。

即时设计注意：TEXT 样式只承载排版，颜色另走 PAINT。绑定 textStyleId 后可能延迟把宽度变为 0；独立回读，命中时用 `jsd_set_text` 同传 width 与 `textAutoResize:"HEIGHT"` 修复。`jsd_set_stroke` 绑定 strokeStyleId 若超时，先回读确认，避免重复写入。

实例内部样式覆盖未必渲染生效。warnings 给出主组件子节点 id 时，先判断用户要全局还是局部：全局改主件；仅个别实例不同，使用支持的属性或局部覆盖。detach 会失去继承关系，仅在任务需要且覆盖无法满足时采用。

## 5. 验收与恢复

- 独立回读关键样式、字体、容器尺寸及层级；批量摘要不能证明这些字段已落库。
- 导出目标屏或关键分区，检查阅读顺序、文字换行、裁切、对齐、层序。
- 缺失节点先 find 确认；修复损坏节点前确认清理范围。不要删除无关内容来重做。
- 结构操作若 warnings 报未操作兄弟节点漂移，按返回的原坐标恢复并复核。
