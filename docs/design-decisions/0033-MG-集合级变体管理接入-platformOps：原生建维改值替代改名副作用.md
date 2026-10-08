# 0033. MG 集合级变体管理接入 platformOps：原生建维改值替代改名副作用

- **日期：** 2026-09-29
- **状态：** 已采纳
- **影响范围：** `ui/src/code/mastergo/`（`ops.ts` 6 个 op、新增 `variant-set.ts` 纯判定 + `variant-set.test.ts`、`meta.ts` 注释、`sync-guarantee.ts` 断言）、`shared/src/dicts/platform-knowledge.ts`（`setLevelOps` 字段与 MG variants 登记）、`mcp-server/`（`tools/platform-facts.ts`、`tools/prompts.ts` 变体集配方、`README.md`）、`tests/platform-knowledge.test.ts`
- **相关记录：** 补 [0018](0018-实例变体写入：MG上改为集合内换绑加回读校验.md) 的「未决」项（它把这条明确留成「属新能力，需要时另开决策」）；沿用 [0019](0019-MasterGo平台特有操作：组件属性管理.md) 的 platformOps 做法与 [0020](0020-平台差异不重定义工具：三档机制继续承载，建组件改由core统一带子节点.md) 的边界；三方事实登记见 [0032](0032-平台事实三域收敛为声明表：prompts-与工具描述共用单一投影点.md)

## 压力

**换绑只能「切」，不能「造」。** 0018 把 MG 的变体写入落成「集合内换绑 + 回读校验」，真机验证能切到集合里**已有**的成分。但「集合里有没有第二个值」它管不了：

- 真机上造第二个变体值的**唯一手段**是 `jsd_rename_node` 把成分改名成 `属性 1=备选`，靠 MG 自己归一成 `属性 1[a1]=备选`（0018 真机记录，当时的原话是「工具面没有 createVariantProperties / editVariantPropertyValues 的入口」）。**这是把引擎的内部归一行为当 API 用** —— 名字格式、归一规则都不在我们的契约里，MG 哪天不这么归一，这条就静默失效（0007 明令根除的形态）。
- 而 MG typings 里恰好有整套**集合级管理入口**（7 个，`dist/index.d.ts:3072-3085`），本仓一个没接 —— 0032 的表里它们全躺在 `nativeUnwired`。这是三平台里**唯一**有原生「增维 / 改值 / 删维」能力的平台，能力闲置。

**失败后果**：① 调用方按提示词做变体集时只能靠改名绕路，且绕错了不报错；② 反过来，不知道有原生入口的人会以为 MG 造不出变体集，退化成「多主件」（那是 jsDesign 的兜底，MG 不需要）。

**当前成本**：三平台里 MG 的变体面最强却用不上；每次联调都要重新发现「改名能造值」这条口口相传的用法。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 走既有 platformOps 通道加一组 op（0020 的「三档机制」第二档） | 采用 | 与 0019（组件属性 op 组）、0025（Figma 组件属性定义）同构；能力是**流程级**的，不是节点属性，正好落 platformOps 这一档 |
| 把集合级能力做成新的 MCP 工具族（`jsd_create_variant_property` …） | 排除 | 撞 0020 立的边界：按平台出工具族会把平台分叉搬进对外目录、撞 0006 的体积门禁，且这些 op 只有 MG 有名字 |
| 扩 `jsd_combine_as_variants` 的入参以覆盖增维 | 排除 | 会把「只有某平台认得」的参数塞进跨平台工具（Figma/jsDesign 无对应语义），等于在 core 里造平台分叉 —— 0020 明确否过这条路 |
| 保持简单：不接，继续靠改名 | 排除 | 改名是**未经声明的副作用**，不是 API；且能力已在 typings 里，成本只是接线 |

## 结论

**不引入模式**。走 platformOps 通道加一组 op，每个 op **写完回读校验**（沿用 0018 的理由：本平台有「回包成功、值没变」的前科），读面用 `componentPropertyValues` 的 VARIANT 项。

## 实施方案

**目标形状（全量）**

- **角色与职责**：`ui/src/code/mastergo/ops.ts` 的 `mastergoOps` 增加 6 个 op（与既有组件属性 op 同文件、同形制）：
  | op | 宿主入口 | 语义 |
  |---|---|---|
  | `mg_list_variant_properties` | 读 | 列出集合的**变体维度与可选值**、成员及各自取值（也是另几个 op 的回读面） |
  | `mg_create_variant_property` | `createVariantProperties(names)` | 建新维度（随带一个默认值） |
  | `mg_create_variant_component` | `createVariantComponent()` ×N | 往集合里加新成分（新值组合） |
  | `mg_edit_variant_property` | `editVariantProperties({旧:新})` | 维度改名 |
  | `mg_edit_variant_property_value` | `editVariantPropertyValues({属性:{oldValue,newValue}})` | 改某个维度下的值名 |
  | `mg_delete_variant_property` | `deleteVariantProperty(属性)` | 删维 |
- **读面的真相**：MG **没有** `variantGroupProperties`（typings 零命中，与 Figma/jsDesign 不同）—— 集合的维度与可选值只能从 `componentPropertyValues` 里 `type === 'VARIANT'` 的项读（`name` / `variantOptions` / `variantOptionsAlias`，`index.d.ts:3011-3026`）。这条必须写进实现注释，否则下一个人会去找 Figma 那个字段。成员枚举走 `findChildren`（组件/实例读不到 `children`，0019 实测），复用 `ops.ts` 已有的 `listSublayers`。
- **依赖方向**：不新增层。`PlatformOp.run(host, params)`（`shared/core/host.ts:388`）签名不变；MCP 侧 `jsd_platform_op` 与 `platformOpParamsSchema` 不动 —— op 名与参数形状由 `ping` 的 `platformOps` 下发（这正是走这一档的收益：**MCP 侧零改动**）。
- **创建与装配位置**：op 数组在 `mastergoOps` 里静态声明，经 `meta.platformOps` → `registerPlugin` 第三参 → `ping` 上报 → daemon 缓存 → 调用方读 `platformOps` 拿名单。
- **调用时序**：`mg_list_variant_properties`（摸底）→ `createVariantProperties` / `createVariantComponent` / `editVariantPropertyValues`（写）→ 同一 op 内**回读**比对（不一致即抛错）→ 调用方再 `jsd_find` 复核实例侧取值。
- **扩展点**：新 op 直接往数组里加一条；回读校验的写法抽成模块内小函数（`readVariantTable`）复用。

**本次不做**

- **不接两个别名 op**（`editVariantPropertiesAlias` / `editVariantPropertyValuesAlias`）：它们绑的是**变量别名**，而 MG 变量面（`mg.variables`）整体未接（属独立决策）。留着当缺口，不在这次顺手接一半。
- **不改实例写入路径**：`InstanceNode.setVariantPropertyValues` 真机实测静默无效（0018 复验通过），继续只作门面内部回退，**不**因为「typings 里有」就再试一遍。
- **不claim 新能力位**：`inPlaceVariants` 已声明；集合级 op 的存在由 `platformOps` 数组本身表达（0029 的口径：不再挂一个「本平台有 op 通道」的能力位）。
- **不做真机复验**（本次环境无 MG 客户端）：记录为**待验**，逐条写在「验证」里，不写「已生效」。

## 成本与退出条件

- **成本**：`ops.ts` 约 +300 行；`platformOps` 名单从 5 个增到 11 个（目录体积：op 名单只在 `ping` 的 `platformOps` 里下发，不进工具目录，0006 门禁不受影响 —— 但 `jsd_platform_op` 的描述长度要复核）。新增无状态、无网络跳数（都是当前文档操作，`openWorldHint` 仍为 false）。
- **退出条件**：
  1. MG 哪天把 `variantGroupProperties` 补进 typings → 改读面（`mg_list_variant_properties` 的实现换字段，结果形状不变）；
  2. MG 变量面接上（另开决策）→ 顺手把两个别名 op 接掉，本记录的状态改为「已被 00xx 取代」或追加变更历史；
  3. 宿主哪天把集合级 op 删了/改名 → `sync-guarantee.ts` 的存在性断言编译失败，先红在类型层（不靠人记）。

## 验证

- **不变量测试**（新增 `ui/src/code/mastergo/variant-set.test.ts`，18 例；判定落纯函数 `variant-set.ts`，宿主调用留 `ops.ts` 胶水 —— 与 0018 的 `variant-swap.ts` 同做法）：
  - **回读比对必须真拦**：宿主「回包成功但值没变」时，建维度会缺名、改名会「旧名仍在」、改值会「新值没出现/旧值仍在」、删维度会「仍在」—— 四类失败各有断言；
  - **前置校验**：重名、旧名不存在、旧取值不在可选值里，都报错并列出当前维度；
  - **void 返回的认领**：`createVariantComponent()` 不返回值，靠前后比 id 认领新成分；什么都没加时返回空数组（调用方据此抛错），有断言。
- **类型级断言**（`mastergo/sync-guarantee.ts` 第 7 节）：7 个集合级 API 必须真在 `ComponentSetNode` 上；**并且反向断言 `variantGroupProperties` 在 MG typings 里确实不存在**（否则实现里「别去读那个字段」的注释就是没根据的）。判别力已实测：把 `deleteVariantProperty` 改名成 `deleteVariantPropertyX` → `tsc` 报 `Type '"deleteVariantPropertyX"' does not satisfy the constraint 'never'`。
- **回归**：`pnpm run typecheck` 通过；`tests/platform-knowledge.test.ts`（13 例，含新增的「集合级入口只出现在 variants 域、且不与 write 重复」）、`packages/ui/src/code/mastergo/{variant-set,variant-swap,property-values}.test.ts`（40 例）通过；`tests/i18n.test.ts`、`packages/mcp-server/src/__tests__/catalog-budget.test.ts` 通过；`pnpm build` 三平台 + mcp 产物构建通过。
- **真机复验（2026-09-29，MasterGo 客户端 + 插件重载；7 项全通，画布已清干净）**：
  1. 接线：`jsd_ping` 的 `platformOps` 由 5 个变 **11 个**（原 5 个组件属性 op + 新 6 个），`capabilities: ['styles','inPlaceVariants']` 不变 —— 插件重载后新 op 才出现（进程内常量，不重载不更新）。
  2. `mg_create_variant_property(['尺寸'])` → `created: ["尺寸"]`，回读 `尺寸=[默认]` ⇒ **建维随带一个名为「默认」的值**（实现注释里那句「随带一个默认值」得到确认）。
  3. `mg_create_variant_component(1)` → 新成分 `属性 1[a2]=状态3, 尺寸[a0]=默认` ⇒ **加成分会顺带给第一个维度造一个新取值**（值名由引擎生成，如「状态3」），其余维度取默认值。这是本轮最有价值的一条：想精确控制组合，得「先加成分，再用 `mg_edit_variant_property_value` 把自动值改成目标值」。
  4. `mg_edit_variant_property_value {property:'属性 1', oldValue:'MG变体验证-A', newValue:'小'}` → 回读 `属性 1=[小, MG变体验证-B, 状态3]`，且**携带该取值的成分名字同步改名**（`属性 1[a0]=小`）⇒ 这是**重命名**语义，不是新建。
  5. `mg_edit_variant_property {rename:{尺寸:大小}}` → `renamed: {尺寸:大小}`，回读出现 `大小`、`尺寸` 消失。
  6. `mg_delete_variant_property {property:'属性 1'}` → `removed: '属性 1'`，回读只剩 `大小`，3 个成分同步变成 `大小[a0]=默认` ⇒ **入口按名字收**（原「可能收 id」的悬念解除）。
  7. 与 0018 联走：`jsd_create_instance` 建实例 → `jsd_set_instance_properties {属性 1:'MG变体验证-B'}` → `jsd_find` 回读 `variantProperties: {属性 1:'MG变体验证-B', 大小:'默认'}` ⇒ **改造没有破坏换绑路径**，造值 + 切值两条链现在都通。
  8. 读面确认：`mg_list_variant_properties` 从 `componentPropertyValues` 的 VARIANT 项读出维度、`variantOptions`、`optionAlias`（空串数组，别名未绑 = 与「变量面未接」一致）与每个成分的取值，`source: findChildren(直接子层)` ⇒ 「MG 没有 `variantGroupProperties`」这条读法成立。
  9. 收尾：脚本按记录 id 删除 + 按名字兜底清理，最终页面只剩用户原有的 1 个顶层节点。
- **指标与日志**：无新增；op 经 `platform_op` 通道，沿用既有日志。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-29 | 初次决策 | 采用 platformOps 加 op 组；排除「新工具族」「扩 combine 入参」「继续靠改名」；别名 op 与实例写入路径本次不做 |
| 2026-09-29 | 落地实现 | 判定抽成纯函数 `variant-set.ts`（可单测），op 只剩宿主调用与回读；`setLevelOps` 字段进 0032 的事实表（与 `write` 分开：一个管集合自身、一个管实例），提示词据此分流 |
| 2026-09-29 | **真机复验通过**（MG 客户端，7 项全通） | 结论不变，且两处**实现假设被实测改写**：① `deleteVariantProperty` **按名字收**（原「可能收 id」的悬念解除）；② `createVariantComponent` **会给第一个维度自动造一个新取值**、`editVariantPropertyValue` 是**重命名**（成分名字同步改）—— 两条已写进各自 op 的描述（措辞不入事实表：表只装标识符、句子在渲染点，避免第二份事实）。「原「属新能力、行为未知，故实施时把不确定项都做成回读校验」的做法被证明是对的：没有任何一步静默失效 |
