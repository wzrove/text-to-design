---
title: "HTML 转设计稿"
when: "用户提供 HTML 并要求转成设计稿时读取；静态 SVG 转换与可编辑原生图层按需求分流，不保证完整 CSS 还原。"
args: "必填 html(完整 HTML 片段)；可选 name(生成节点名，默认 html-design)"
---
# HTML 转设计稿

默认精简档把本配方的绘制与编辑操作放入 `jsd_batch`，工具名填 `calls[].tool`；用 `jsd_describe_tools` 的 names 查步骤参数。

输入为用户提供的 HTML，输出为设计节点。转换器不执行页面脚本，也不具备浏览器完整 CSS 布局能力。通用失败处置与视觉验收按主技能「执行闭环」。

## 默认路径

用户仅需静态转换、无需逐元素编辑时，用 `jsd_html_to_design({html:用户HTML, name:语义名称})`。当前实现解析 HTML 与有限的内联样式，生成 SVG 后导入；不会使用外部样式表或 style 标签，复杂 CSS 不能保证还原。

不要把它描述为浏览器截图或像素级保真。需要准确复刻复杂页面时，先依据用户已有参考和布局需求确定可表达结构。

## 需要可编辑图层时

按 [设计策略](design-strategy.md) 与 [自动布局](auto-layout.md) 映射原生结构：

| HTML 内容 | 节点 |
| --- | --- |
| section、卡片、布局容器 | FRAME |
| 标题、正文、按钮文案 | TEXT |
| 图标、SVG 几何 | `jsd_search_icons` → `jsd_create_icon`;手绘才用 `jsd_create_svg` |
| 图片 | 对应形状节点 + `jsd_fill_image` |

保留语义名称与分区层级，尺寸按设计 px 映射；行列改用布局字段，不能把 CSS auto 原样交给画布。已有组件或样式命中时复用。批量建节点后逐层 `jsd_reparent_nodes` 归组，避免所有元素落在页面顶层。

## 装配、错误与验收

- 从 `created.id` 取得转换结果；需放进已有画板时显式 `jsd_reparent_nodes`，落位再用 `jsd_move_node` / `jsd_resize_node`。不给 SVG 转换入口附加不支持的 x/y/placement。
- 外部样式表、style 标签、脚本或复杂 CSS 未还原时，明确报告差异并改走可编辑原生图层路径；不声称已完整复刻，也不原样重放转换。
- 需要可编辑时，独立回读层级和 TEXT；用 `jsd_export` 检查文字、尺寸、裁切、间距与未还原样式，向用户说明保留为矢量或未还原的部分。
