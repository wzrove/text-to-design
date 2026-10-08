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

| 平台       | COMPONENT                                                                             | COMPONENT_SET                                                 | 自动布局字段来源                                                                                                                                                              |       |        |                                                                                                            |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Figma    | `interface ComponentNode extends DefaultFrameMixin`（`plugin-api.d.ts:11043`）          | `interface ComponentSetNode extends BaseFrameMixin`（`:11018`） | `BaseFrameMixin extends … AutoLayoutMixin …`（`:9165-9185`）                                                                                                            |       |        |                                                                                                            |
| jsDesign | `ComponentNode extends DefaultFrameMixin`（`plugin-api.d.ts:1081`）                     | `ComponentSetNode extends BaseFrameMixin`（`:1074`）            | `BaseFrameMixin` 自带 `layoutMode / primaryAxisSizingMode / counterAxisSizingMode / primaryAxisAlignItems / counterAxisAlignItems / padding* / itemSpacing`（`:857-869`） |       |        |                                                                                                            |
| MasterGo | `ComponentNode extends DefaultContainerMixin, FrameContainerMixin`（`index.d.ts:3048`） | `ComponentSetNode extends … FrameContainerMixin`（`:3063`）     | `FrameContainerMixin extends AutoLayout`（`:2636`），`AutoLayout` 含 \`flexMode / itemSpacing / paddingTop                                                                | Right | Bottom | Left / mainAxisSizingMode / crossAxisSizingMode / mainAxisAlignItems / crossAxisAlignItems`（`:2590-2605\`） |

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
- **真机复验（2026-09-29，MasterGo 客户端 + 插件重载；MG 侧全通）**：
  1. 两个带内容 COMPONENT（各 120×48，0020 同轮产物）→ `jsd_combine_as_variants` 得 COMPONENT_SET  
     `55:598`（原位合并，160×88，两成分坐标重叠）；
  2. `jsd_set_layout{layoutMode:'HORIZONTAL',itemSpacing:24,padding*:24}` → **不再报「仅适用于 FRAME」**，  
     集合尺寸 160×88 → **312×96**（24+120+24+120+24 / 48+48）；
  3. `jsd_find` 回读：`layoutMode:'HORIZONTAL'`、`itemSpacing:24`、四个 padding 均 24，  
     两成分 x 由重叠变为 **24 / 168** ⇒ **退出条件第 1、3 条都未命中**（没抛错、回读也不骗人），  
     COMPONENT_SET **不用**下沉成平台 op；
  4. 同轮补测 COMPONENT（非集合）：`jsd_set_layout{layoutMode:'VERTICAL',itemSpacing:16,padding*:12}`  
     → 200×100 → **104×120**，`layoutMode:'VERTICAL'` 回读一致，两个子矩形 y 变 **12 / 68**  
     ⇒ COMPONENT 同样放通（0021 放开的两个类型都验到）；
  5. 覆盖面缺口**当时未修**(2026-10-08 已修，见文末「遗留已清」)：`settle` 只回读 `layoutMode` + 两轴对齐，
     本轮的 `itemSpacing` / `padding*` 是调 `jsd_find` 人工读回的 —— 结论只是「MG 侧这些值确实落库」。
  6. 收尾：按 id 删净，`jsd_find name:'TDD验'` 回 0 条。
- **真机复验（2026-09-29，Figma 客户端 + 插件重载；集合与组件两类都通过）**：
  1. 两个 COMPONENT(空壳与带 RECTANGLE 子节点各一组)→ `jsd_combine_as_variants` 得  
     COMPONENT_SET；`jsd_set_layout{layoutMode:'HORIZONTAL',itemSpacing:24,padding*:24}`  
     → 集合 120×48 → **272×48**，`jsd_find` 回读 `layoutMode:'HORIZONTAL'`、`itemSpacing:24`、  
     四个 padding 均 24、两成分 x 变 **24 / 128** ⇒ 退出条件第 1、3 条**未命中**。  
     (附带事实：Figma 有 `variantGroupProperties`，MG 没有 —— 与 0032/0033 登记一致；  
     Figma 的 `counterAxisSizingMode` 回读 `FIXED`、MG 回读 `AUTO`，属平台差异，不影响本次结论。)
  2. COMPONENT(非集合)：`jsd_set_layout{layoutMode:'VERTICAL',itemSpacing:16,padding*:12}`  
     → 200×100 → **200×120**(Figma 交叉轴 FIXED，故宽度不收)，子矩形 y 变 **12 / 68**，  
     `layoutMode:'VERTICAL'` 回读一致 ⇒ COMPONENT 同样放通。
  3. 同 0021 在 MG 的注(2026-10-08 已修，见文末「遗留已清」)：`settle` 当时只回读 `layoutMode` + 两轴对齐，
     `itemSpacing` / `padding*` 是人工 `jsd_find` 读回的 —— 覆盖面缺口没修。
  4. **新发现(2026-09-29 记)→ 2026-10-08 已修**：对 TEXT 节点调 `jsd_set_layout` → 回包 `ok`、  
     **没有 warnings** —— 适用性不匹配在 `updateSelection` 这条路径上是**静默忽略**(0007 明令  
     根除的形态)。点名文案 `applicabilityMissNotice` 当时只接在 `core/execute.ts`(创建)与  
     `tools/update-common.ts`，`jsd_set_layout` 走的 `updateSelection` 没接。
- **修复(2026-10-08，单点、不开新记录)**：
  - `shared/core/update.ts`：写前对每个目标节点跑 `propAppliesTo(key, node.type)`，不匹配的键收进  
    `applicabilityMisses`，收尾用同一张 `PROP_APPLICABILITY` 派生的文案 push 进 `warnings`  
    —— 与创建路径说的是**同一句话**，判定下沉到 core，改成 per-node(原来只能按批次反推)。
  - `mcp-server/tools/update-common.ts`：删掉它自己按 `updated` 反推的那一遍点名。core 已报，  
    留着就是同一句文案印两遍(实测回包里 ⚠ 行 + 无 ⚠ 行各一条)。一个事实一份：此处只保留  
    「真的什么都没改」那一格。
  - 机器守：`write-path.test.ts` 增 1 例(给 TEXT 写布局字段 → `updateSelection` 回包带点名告警)。
- **真机复验(2026-10-08，Figma 客户端 + 插件重载 + daemon 重启)**：  
  `jsd_set_layout{ids:[TEXT],layoutMode,itemSpacing}` → 回包  
  `warnings:['以下属性与目标节点类型不匹配，已被忽略:layoutMode(仅适用于 FRAME/COMPONENT/COMPONENT_SET)、itemSpacing(…)']`，  
  文本块只有一条 ⚠(去重生效)。静默失效口子在该路径上封住。  
  ⚠ 复验期间发现常驻 daemon 从 2026-09-29 起就没重启过 —— **改 mcp-server 后必须重启 daemon  
  才测得出来**，只重载插件不够(插件侧改动看得到，mcp-server 侧看不到)。
- **真机复验(2026-10-08，即时设计客户端 + 插件重载 + daemon 重启)**：
  1. **COMPONENT(非集合)放通**：`jsd_set_layout{layoutMode:'VERTICAL',itemSpacing:16,padding*:12}`
     → 不再报「仅适用于 FRAME」，`layoutMode` / `itemSpacing` / 四边 `padding` 回读全中、**无 warnings**
     （这是本轮新加的 spacing/padding 回读第一次在 jsDesign 上跑），子节点 y 由 6 变 **12**；
     另一例 `HORIZONTAL,itemSpacing:24,padding*:24` 同样全中，子节点落到 **24/24**。
  2. **COMPONENT_SET：本平台不可达** —— 引擎做不出变体集(`jsd_combine_as_variants` 三种姿势全败，
     报 `in get_name: Value is not a string` / `in get_booleanOperation: Value is not a string`，
     附带 1 条可执行出口的文案)，页面上也没有可复用的既有集合。故「集合布局」在 jsDesign
     **没有可测路径**，不是门控拦的。
  ⇒ 「三平台一致」的准确说法：**COMPONENT 三平台一致**；**COMPONENT_SET 只在 Figma / MG 可验**
  (jsDesign 受引擎限制)。本记录结论(不引入能力位)不因此回退 —— 退回「只放开 COMPONENT」在 jsDesign
  上放不放都一样(没有集合可写)，而 Figma/MG 两平台已实测放通，按平台分叉反而制造 0020 反对的差异。
  收尾：按 id 删净测试节点，`jsd_find name:'TDD'` 回 0 条。
- **真机复验(2026-10-08，MasterGo 客户端 + 插件重载)** —— 本轮新回读在这个**有「回包成功、值没变」前科**的平台上跑通：
  1. COMPONENT：带 RECTANGLE + TEXT 子节点建组件 `67:464`（子层经 `mg_list_sublayers` 回读，MG 读不到 `children`）
     → `jsd_set_layout{layoutMode:'VERTICAL',itemSpacing:16,padding*:12}` → **无 warnings**，
     `jsd_find` 回读 `VERTICAL / 16 / 四边 12` 全中，尺寸 120×48 → **144×112**
     （= 120+12+12 / 48+16+24+12+12，说明子项确实按新布局重排）。
  2. COMPONENT_SET（0021 的**原始症状**）：两个 COMPONENT → `combine_as_variants` 得集合 `67:490`(184×152，变体重叠)
     → `jsd_set_layout{HORIZONTAL,itemSpacing:24,padding*:24}` → 集合 184×152 → **336×160**
     （= 24+144+24+120+24），`jsd_find` 回读 `HORIZONTAL / itemSpacing 24 / 四边 padding 24`，
     两个变体 x 落 **24 / 192** ⇒ 已排成一行。**新回读无 warnings** ⇒ 人工 `jsd_find` 那一步在 MG 上同样不需要了。
  3. `platformOps` 回 11 个（0033 的 5→11 在当前构建上仍成立）。
  收尾：按 id 删净，`jsd_find name:'TDD'` 回 0 条。
- **同轮记一条平台缺陷的现场形态(即时设计)**：`jsd_combine_as_variants` 失败**不是 no-op，会污染画布** ——
  本轮把入参组件留成 3 个**损坏节点**(`8:2` / `8:10` / `8:15`)：对它们读 `name` 直接抛
  `in get_name: Value is not a string`，于是**按名查找整体失败**(`jsd_find name:'TDD20C'` 只回这句错)，
  按 id / 按类型仍可用；`jsd_manage_nodes op=repair` 一次清干净(回 `cleaned:[3 个 id]`)。
  这是 0018「jsDesign 的 combineAsVariants 有已知问题」这条的具体形态，也给出失败后的清理动作。
- **遗留已清(2026-10-08，单点、不开新记录)**：`settle` 的回读面从「`layoutMode` + 两轴对齐」扩到
  含 `itemSpacing` / 四边 `padding*` —— 人工 `jsd_find` 那一步不再需要。
  - `shared/core/props/writers.ts`：`layoutWriter.settle` 增一个键表回读循环，**期望值口径与
    `write()` 同源** —— 创建路径只有开了 auto-layout 才写布局字段(未声明的 spacing/padding
    显式归零)、修改路径只写显式给的键，没请求过的键**不对账**(否则会拿一个根本没往下写的值
    去比，自造「回读不一致」)。回压前仍过 `propAppliesTo` + `platformRejectsProp` 两道守卫，
    与对齐同口径(被平台拒过的值不许在回压里复活)。
  - `shared/dicts/unapplied-prop.ts`：补 `itemSpacing` 与四边 padding 的修法文案(四键共用一条
    `PADDING_HINT`)。补上之前这四个键落到 `UNAPPLIED_PROP_FALLBACK`，而那句只说「用 jsd_find 复核」
    —— 正是本轮要消掉的人工步。
  - 机器守：`write-path.test.ts` 增 5 例(引擎吞值→点名 / 真落库→不报 / 修改路径没请求→不对账 /
    创建路径未声明归零→不误报 / 创建路径没开布局→不对账)。
- **真机复验(2026-10-08，Figma 客户端 + 插件重载 + daemon 重启)**：5 项全通，收尾删净
  (`jsd_find name:'TDD'` 回 0 条)。
  1. 创建路径：`jsd_create_frame{layoutMode:HORIZONTAL,itemSpacing:12,padding*:8,children:[×2]}`
     → 回包**无 warnings**，回读 `itemSpacing:12` / 四边 `8` 与请求一致；
  2. 修改路径(不传 layoutMode)：`jsd_set_layout{ids,itemSpacing:24,padding*:24}` → 无 warnings，
     四边 padding 全 24；
  3. 增量口径：只传 `layoutMode:VERTICAL,itemSpacing:30,paddingTop:6` → 未请求的三边保持 24，
     只有 `paddingTop` 变 6 —— 未请求的键不参与对账，无自造告警；
  4. 0021 场景(COMPONENT_SET)：两个 COMPONENT → `combine_as_variants` 得集合(80×40、变体重叠)
     → `set_layout{HORIZONTAL,itemSpacing:24,padding*:24}` → **232×48**、无 warnings、回读全中
     —— 0021 当时靠人工 `jsd_find` 复核的那一步被自动回读取代；
  5. 回归：对 TEXT 调同一工具 → 仍是**单条**适用性点名(`layoutMode(仅适用于 …)`…)，无回读噪音。
- **真机上造不出的分支(如实记)**：Figma 侧「引擎吃掉 spacing/padding」这一支造不出来 —— 值都落库
  (连 `primaryAxisAlignItems:SPACE_BETWEEN` 下的 `itemSpacing` 也照存 40)；负 padding 是**引擎自己
  抛校验错**(`Property "paddingTop" failed validation: Number must be greater than or equal to 0`)，
  属「破坏调用」而非静默失效。**该分支由单测覆盖**(假节点冻结 setter)+ 文案由 `unapplied-prop` 保证。
- **顺带记一个读出口事实**：`serialize.ts:424` 只在 `layoutMode !== 'NONE'` 时序列化布局字段 ——
  NONE 容器上即便引擎存了 padding/itemSpacing，`jsd_find` 也**看不到**。这正是「人工 `jsd_find` 兜」
  不可靠的原因(也是把回读做进写路径的理由)。
