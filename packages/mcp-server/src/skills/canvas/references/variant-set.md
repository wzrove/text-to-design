---
title: "变体集构建"
when: "当需要复用重复结构、抽组件或构建同族状态与变体集时读取；先查现有资源与原位合并能力。"
args: "参数 family(组件族名)"
role: assistant
---
# 组件与变体集

用于抽组件、复用重复结构、建立同族状态。实例属性见 [组件属性](component-property.md)。

## 选复用方式

- get_page 先查现有 components 与 variants；命中就创建实例，避免同用途主件重复。
- 同一结构重复出现时先做 COMPONENT，再用 `jsd_create_instance` 铺开。一次性装饰不抽组件。
- 固定颜色或字号差异优先样式；确实需要同族状态或尺寸切换时再建变体。

## 先查能力

以 jsd_ping 或 jsd://platform/state 的 capabilities 与 platformOps 为准。

- 有 inPlaceVariants：可用 `jsd_combine_as_variants` 原位合并。
- 无此能力：不尝试合并。即时设计当前写路径会拒绝，以免引擎损坏组件；保留各状态独立 COMPONENT，按“族名 / 状态”命名，或报告需在设计器手工合并。
- 集合已存在且只加状态：若有集合级管理 op，用该入口；不要重复合并新集合。
- 即时设计真实变体实例的 setProperties 有运行期不可用记录；不要以 typings 或已有取值推定能切换。明确不可用时停止重试，使用独立状态组件或报告手工切换。

## 支持原位合并时

1. 准备至少两个 COMPONENT，实例不能直接参与；先完成各主件内部结构、尺寸与布局。
2. 确认主件在同一真实父容器中，必要时 reparent 后复核位置。
3. 有集合级 op 时按其 schema 建维度与取值；无此入口时用主件名表达，例如 `状态=默认, 尺寸=中`，再合并。
4. 从 created.id 取得集合；回读 variantGroupProperties 或平台专用读取结果，核对维度、可选值与成员 variantProperties。
5. 从具体 COMPONENT 成员创建 INSTANCE。支持实例设值时，用读到的属性名和值切换。

合并失败时先查原主件与集合是否已变化，不直接重放，也不改结构碰碰运气。

完成条件：成员与维度齐全、实例指向预期主件；导出集合和代表实例，检查尺寸、布局与状态视觉。
