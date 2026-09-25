# 0021 布局字段放开到 COMPONENT / COMPONENT_SET：按平台类型逐项核对后不引入能力位

## 压力

`jsd_set_layout` 对组件集报「layoutMode / itemSpacing / padding* 仅适用于 FRAME，已被忽略」，
MG 上直接表现为变体集内 16 个变体重叠于 (20,20)、集合尺寸只显示单个变体（216×76），
无法用工具把变体排成矩阵。

拦的位置是 `dicts/prop-applicability.ts` 的九个 layout 字段，值一律 `['FRAME']`。
该表是「写路径 gate + 反馈层点名」共用的唯一真源（表头注释），放开必须逐平台核对类型，
不能凭「组件集看起来像个 frame」想当然。

## 结论

**不引入新能力位，直接放开**：九个 layout 字段的适用类型从 `['FRAME']` 扩到
`['FRAME', 'COMPONENT', 'COMPONENT_SET']`。

原提议（0020 末尾）是「新增 `variantSetLayout` 能力位，只给支持的平台放行」。
**严格核对后该前提不成立** —— 三平台的 COMPONENT 与 COMPONENT_SET 都继承 frame 的自动布局 mixin，
没有平台需要被排除；加能力位就是给不存在的差异建抽象，命中 SKILL.md 的停止条件
（「为了消除一个很小很稳定的 if 引入多个接口」「只有一个实现且变化无证据」）。

记录：新建（本文件）。0020 末尾「建议开 0021 加能力位」的那一条，由本记录取代。

## 理由与排除（逐平台类型证据，行号可复核）

| 平台 | COMPONENT | COMPONENT_SET | 自动布局字段来源 |
|---|---|---|---|
| Figma | `interface ComponentNode extends DefaultFrameMixin`（`plugin-api.d.ts:11043`） | `interface ComponentSetNode extends BaseFrameMixin`（`:11018`） | `BaseFrameMixin extends … AutoLayoutMixin …`（`:9165-9185`） |
| jsDesign | `ComponentNode extends DefaultFrameMixin`（`plugin-api.d.ts:1081`） | `ComponentSetNode extends BaseFrameMixin`（`:1074`） | `BaseFrameMixin` 自带 `layoutMode / primaryAxisSizingMode / counterAxisSizingMode / primaryAxisAlignItems / counterAxisAlignItems / padding* / itemSpacing`（`:857-869`） |
| MasterGo | `ComponentNode extends DefaultContainerMixin, FrameContainerMixin`（`index.d.ts:3048`） | `ComponentSetNode extends … FrameContainerMixin`（`:3063`） | `FrameContainerMixin extends AutoLayout`（`:2636`），`AutoLayout` 含 `flexMode / itemSpacing / paddingTop|Right|Bottom|Left / mainAxisSizingMode / crossAxisSizingMode / mainAxisAlignItems / crossAxisAlignItems`（`:2590-2605`） |

九个字段在三平台**逐项对齐**，无一字缺失：
- MG 侧由 `node-facade.ts` 的 `KEY_TO_MG`（`layoutMode→flexMode`、`primaryAxis*→mainAxis*`、
  `counterAxis*→crossAxis*`）与 `VALUE_TO_MG`（`MIN/MAX/SPACE_BETWEEN → FLEX_START/FLEX_END/SPACING_BETWEEN`）
  完成投影 —— 字段名与枚举值都已有映射，放开即可写通，无需新增映射。

- 排除 `variantSetLayout` 能力位：无平台需排除；且能力位是**平台轴**的门控，
  本次差异在**节点类型轴**上，用平台位表达类型事实会串轴（同一组件集在 Figma/MG/jsDesign 都被放行，
  门控恒真，纯噪音）。
- 排除「只给 MG 开」：会让同一节点类型在不同平台行为不同，正是 0020 要避免的分叉。
- 排除「新增 platform op 排布变体集」：布局是通用能力，不该沉到平台通道（违反 0017/0020 的边界纪律）。

## 最小落地

1. `shared/src/dicts/prop-applicability.ts`：九个 layout 字段加 `'COMPONENT'`、`'COMPONENT_SET'`，
   表内注明证据出处与本记录编号。
2. `shared/src/schemas/shared-props.ts`:`layoutMode` 的 describe 从「仅 FRAME 节点生效」改为
   「FRAME / COMPONENT / COMPONENT_SET 生效」。
3. `mcp-server/src/tools/props.ts`:`jsd_set_layout` 描述从「设置 FRAME 的 auto-layout」改为
   「设置容器的 auto-layout」，并点明变体集排布用法。
4. 不变式测试 `packages/shared/src/__tests__/layout-applicability.test.ts`（新建，4 条）。

调用时序不变：`jsd_set_layout` → `set_layout` → `layoutWriter.write`（按表 gate）
→ `settle` 回读 `layoutMode` / 两个 align，不一致就再压一次并点名（0007）。

## 成本与退出条件

- 成本：字典多两个类型字面量，无新增状态 / 异步 / 持久化；工具数量与目录体积不变。
- 兜底：运行时若某平台对 COMPONENT_SET 写不进布局，`layoutWriter.settle` 的
  `readback.ok=false` 会把它点名（0007 的「不允许静默失效」），不会退化成「回显成功实则没生效」。
  padding / itemSpacing / sizingMode 目前无回读，是既有的覆盖面缺口，不因本次扩大。
- 退出条件（任一命中即回退到只放开 COMPONENT、把 COMPONENT_SET 交回平台通道）：
  - 真机证明某平台对 COMPONENT_SET 的布局**写入抛错**（不是静默失效，而是破坏调用）；
  - jsDesign 上组件集布局触发 0018 记录过的引擎缺陷（其 combineAsVariants 本就有已知问题）；
  - 出现「给了 layoutMode 但变体位置不变」且回读报 ok（即回读也骗人）——那只能下沉为平台 op。

## 验证

- `pnpm run typecheck` 三包通过；`pnpm run test` 151 通过（含新增 4 条适用性不变式、
  catalog-budget、skill-doc-budget、i18n）。
- 真机（**需重载插件**加载新产物）：
  1. MG 上对 Button 集合 `20:3420` 调 `jsd_set_layout{layoutMode:HORIZONTAL,itemSpacing:24,padding*:24}`；
     预期不再报「仅适用于 FRAME」，回包里 16 个变体的 x/y 由 (20,20) 变为按行排布。
  2. 同调用在 Figma / jsDesign 各跑一次，确认三平台一致（本次「不引入能力位」的直接验收点）。
  3. 若 MG 回包里 layoutMode 回读仍是 NONE → 命中退出条件第 1/3 条，回退并把排布下沉为
     `mg_layout_component_set`（内部走 flexMode + `resizeToFit()`，见 typings `:3083`）。
