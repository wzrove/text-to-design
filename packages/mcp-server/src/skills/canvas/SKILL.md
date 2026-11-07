---
name: canvas
description: "当用户要求在即时设计、Figma 或 MasterGo 中创建或改造设计稿时使用：界面与整页、图表与看板、自动布局、组件与变体、批量改文案或样式、HTML 转设计稿、图标网格。也适用于“照这页配色画一张”“这些卡片改一处全部生效”等未点名工具的画布任务。仅检查连接、读取选中、导出现有节点或单节点改名无需加载；开发 MCP 服务代码、制作网页或独立图片不在此范围。"
---
# 画布设计与改造

使用 text-to-design MCP 的 `jsd_*` 工具操作设计客户端。插件须在目标文档中运行；平台未知或连接失败时调用 `jsd_ping`，已知平台能力可读 `jsd://platform/state`。能力未声明时，不照搬其他平台入口。

精简档只公开常用工具。下文提及的工具若不在当前工具目录，先 `jsd_describe_tools` 按 group/query 找名称，再用 names 读取完整 schema，最后通过 `jsd_batch` 执行。兼容档可直接调用全部原有工具。查询不会改变目录；不要直接调用精简档未公开的名字。

## 先定位任务

只读匹配任务的附录。组合任务按涉及的操作补读，不加载全部附录。

| 用户目标 | 读取 |
| --- | --- |
| 新建界面、整页或重做结构 | [设计策略](references/design-strategy.md) + [自动布局](references/auto-layout.md) |
| 调整行列、间距、对齐、容器尺寸 | [自动布局](references/auto-layout.md) |
| 从数据画图表、看板中的绘图区 | [代码画图表](references/chart-by-code.md) |
| 抽组件、构建状态或变体集 | [变体集](references/variant-set.md) |
| 定义组件属性、修改实例属性 | [组件属性](references/component-property.md) |
| 统一同类实例的样式或文案 | [实例同步](references/variant-sync.md) |
| 绑定变量、统一主题 token | [变量绑定](references/variable-binding.md) |
| 多步流程、整页或多块批量改造 | [批量编排](references/script-ops.md) |
| 批量改文案 | [文本替换](references/text-replace-strategy.md)；多步时再读批量编排 |
| HTML 转设计稿 | [HTML 转换](references/html-to-design.md) |
| 插入一组图标并排布 | [图标网格](references/icon-grid.md) |

## 执行闭环

1. **读现状。** 创作先 `jsd_get_page` 查看顶层节点与 assets。已有组件、变体、样式、变量命中用途就复用；清单范围以返回的 note 为准。修改已有内容时，用 `jsd_get_selection` 或按 id 的 `jsd_find` 确认目标、父级与相关属性。
2. **定结构与复用。** 屏 → 语义分区 → 卡片或行 → 图元；命名说明用途。同级重复结构先查组件，再决定抽主件、铺实例。同轴等距内容用 auto-layout，叠放装饰保留自由定位。
3. **按块执行。** 建节点用 per-type 工具，小型直属子树可用 children；复杂树分批建、逐层归组。`jsd_reparent_nodes` 显式传 parentId。MCP 画布请求串行；同值批改优先 ids，多工具依赖用 `jsd_batch`。
4. **核对结果。** 读取 warnings，区分自动修复与未生效项。批量摘要不含完整属性或子树，需要核实的字段单独 `jsd_find`。关键视觉变更用 `jsd_export({ids:[目标id], scale:0.5})` 导出并目视检查。
5. **修正再交付。** 修复本次引入的裁切、错位、未生效字段；报告完成范围与尚未验证的部分。工具回显成功不等于视觉验收通过。

## 通用边界

- 根节点按坐标落位时用 `placement:{mode:"manual"}`；默认 center 会覆盖根的 x/y。子节点坐标相对父级，auto-layout 子项坐标由布局接管。
- `jsd_create_svg` 只收 svg 或 svgPath 二选一及 name；导入后再归入目标容器、定位。几何改动回源重算；需要布局、组件复用或绑定的结构用原生节点。
- 字体取 `jsd_list_fonts` 的 family 与同项 style 原值。固定宽、自动换行的文本给 width + `textAutoResize:"HEIGHT"`。
- 画布写入超时可能已生效。先回读目标；创建、复制等操作未核实前不重放。字段不支持、名字歧义、无效引用须改策略，原样重试无效。
