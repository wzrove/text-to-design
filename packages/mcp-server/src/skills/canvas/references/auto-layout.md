---
title: "自动布局"
when: "当需要调整容器的行列排布、间距、对齐、伸缩或自适应尺寸时读取；覆盖布局选型、按轴尺寸模式与引擎回读。"
args: "参数 target(要上布局的容器 / 分区描述,如「标签栏」)"
role: assistant
---
# 自动布局

用于行列排布、分区间距、对齐与容器自适应。按每个容器的直属子项判断方向。

## 选择布局

| 内容 | 设置 |
| --- | --- |
| 横向排列的标签、筛选项、图标行 | `layoutMode:"HORIZONTAL"` + itemSpacing |
| 纵向排列的列表行、表单行、页面分区 | `layoutMode:"VERTICAL"` + itemSpacing |
| 卡片头左右两端 | 主轴 `primaryAxisAlignItems:"SPACE_BETWEEN"`；此时 itemSpacing 不控制两端距离 |
| 行内垂直居中 | HORIZONTAL + `counterAxisAlignItems:"CENTER"` |
| 等分标签或填剩余主轴空间 | 子项 `layoutGrow:1` |
| 撑满交叉轴 | 子项 `layoutAlign:"STRETCH"` |

列表先为每行建独立 FRAME，再让行进入列表容器。不要把图标、标题、值、箭头直接铺进外层列表。父级方向不决定子级方向。

叠放装饰、浮层或无间距语义的绘图区保留自由定位；不要为套布局改变用户需要的视觉结构。换行、布局内绝对定位等字段只在当前工具 schema 与平台支持时使用。

## 尺寸按轴声明

主轴由 layoutMode 决定：HORIZONTAL 的主轴是宽，VERTICAL 的主轴是高。

| 目标 | 尺寸模式 |
| --- | --- |
| 固定宽、内容决定高的纵向卡片 | primaryAxisSizingMode=AUTO、counterAxisSizingMode=FIXED + width |
| 固定宽、内容决定高的横向行 | primaryAxisSizingMode=FIXED、counterAxisSizingMode=AUTO + width |
| 屏根、固定栅格或明确尺寸的容器 | 两轴 FIXED + width/height |
| 内容决定宽的单行标签组 | 主轴 AUTO，交叉轴按目标高度选择 |

按内容增长的内层容器不硬写高度；确实需要固定高度时显式声明对应轴 FIXED。不要把 AUTO 改成 FIXED 仅为消除 hug 后的尺寸变化。

## 执行顺序

1. 读取现有容器的方向、尺寸、直属子项与顺序。已有布局仅调所需间距或对齐字段。
2. 新建结构先建容器与子项，逐层 reparent；复杂结构统一在归组后开布局。小型直属子树可在创建时一次声明完整布局与 sizingMode。
3. `jsd_set_layout` 设置方向、间距、padding、两轴 sizingMode 与对齐。工具不接收 width/height，改尺寸用 `jsd_resize_node`。
4. 独立 `jsd_find({ids:[容器id], depth:1})` 核对最终尺寸、方向、子项顺序与间距。
5. 导出关键分区，检查裁切、文字可见性与对齐；修复后再次检查受影响分区。

## 引擎边界

- 开布局会触发重排。当前写路径会恢复回读为 FIXED 的轴，并在 warnings 中说明；AUTO 轴保留 hug。不要无条件再 resize 钉回全部尺寸，只有固定轴仍不符目标时才修复。
- reparent 写路径会尝试恢复被引擎改写的布局属性；仅在回读或 warnings 发现未恢复时补写，不必每次移父都重发布局。
- 布局中的子项 move 可能回显成功却不动。调 itemSpacing、padding、对齐或 grow；确定需要自由定位时再把对应容器设为 NONE。
- 固定宽文本用 `textAutoResize:"HEIGHT"`。文字内容仍在却不可见时先查 width/height；即时设计绑定 TEXT 样式后的零宽修复见 [设计策略](design-strategy.md)。
- layoutGrids 是参考网格，不替代 auto-layout。当前引擎仅在非自动布局容器收网格；MasterGo 节点级网格写入不落盘时，停止重试，报告需在设计器设置。

完成条件：固定轴尺寸符合目标，AUTO 轴容纳内容，间距由布局字段控制；没有新增错位、溢出或裁切。仅加布局语义的任务还须保持原有视觉位置。
