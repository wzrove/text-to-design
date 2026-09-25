# 0024. 变量绑定进入读路径：boundVariables 按引擎词汇原样透传，不引入归一化层

- **日期：** 2026-09-25
- **状态：** 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**Figma 真机复验待插件重载**）
- **影响范围：** `shared/src/schemas/platform.ts`、`shared/src/schemas/serialized-node.ts`、`shared/src/core/host.ts`、`shared/src/core/serialize.ts`、`ui/src/code/figma/sync-guarantee.ts`、`shared/src/__tests__/write-path.test.ts`
- **相关记录：** 0007（不许「回显成功实则没生效」）、0010（契约新增成员异步优先 —— 本文说明为何本字段不适用）、0011（读路径收口 / 异步边界）、0021（平台差异逐项核对后不引入能力位）、0023（读形态 ≠ 写形态）

## 压力

2026-09-25 排查本地样式读路径时顺带证实：三个平台的读路径**都没有变量绑定信息** —— `boundVariables` 在全仓 0 命中（`core/host.ts`、`core/serialize.ts`、`schemas/serialized-node.ts` 三处逐字搜过）。

而写侧早就有了：`ui/src/code/figma/ops.ts:29-33` 的 `variablesApplySchema` 收 `{nodeIds, boundProperty, variableId}`（`boundProperty` 文档写的是 `fills/strokes/effects/backgrounds` 这类**引擎字段名**），run 里直接 `n.setBoundVariable(p.boundProperty, variable)`（同文件 158 行）。加 `figma_variables_create` 一共两个写 op，**读回执为零**。

后果分两档：

1. **写后无法回读**：应用了一个变量绑定，回包里看不到任何痕迹 —— 正是 0007 要根除的「回显成功实则没生效」形状。`jsd_find` / `jsd_get_selection` / `jsd://node/{id}` 三个读出口都拿不到。
2. **更隐蔽的一档**：变量值恰好等于节点原值时，「绑定了变量」与「写死了同一个数」在回包里**完全同形**，调用方无论如何推断都分不出来。这不是写路径的 bug，是读路径缺失。

平台事实（2026-09-25 逐条对 typings）：

| 平台 | `boundVariables` | 依据 |
|---|---|---|
| Figma 1.137.0 | **有**，节点级、**同步只读**，无 `*Async` 变体（全文件 0 处 `getBoundVariablesAsync`） | `@figma/plugin-typings` `plugin-api.d.ts:6444` |
| MasterGo 2.19.2 | 无；只有 `VariableAPI.getLayerVariableModes(layerId)` —— 「图层→变量模式」是另一套语义，不是字段绑定 | `@mastergo/plugin-typings` `dist/index.d.ts:1132` |
| jsDesign 1.0.12 | 无任何变量 API（`Variable` 0 命中） | 两侧 typings 全文 |

所以这是一条 **Figma 独有的平台超集读字段**，与 `textTruncation`/`maxLines`/`componentProperties` 同档。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 新建归一化层：把引擎三态拍平成 `[{field, variableId}]` | 排除 | 引擎的键**就是**写侧 `boundProperty` 的词汇（`setBoundVariable(p.boundProperty, …)`）。拍平必须为嵌套的 `componentProperties` 自造 `componentProperties.PropName` 这类新键，凭空多出一套词汇、还要调用方反向映射。0023 的教训是「读写字形不一致」才出事；这里读写**本来就同词汇**，归一化是把一致的搞成不一致 |
| 新开一个 `figma_variables_list` 平台 op | 排除 | 绑定是**节点属性**、不是文档级列表，按节点读天然属于序列化面。另开 op 要调用方多一次往返，且仍是三个读出口之外的新出口 |
| 并进既有的 `componentProperties` 读字段 | 排除 | 两者不是一回事：`componentPropertyValueSchema`（`schemas/platform.ts:51`）的 `type` 枚举是 `BOOLEAN\|VARIANT\|TEXT\|INSTANCE_SWAP`，**不含** `VARIABLE_ALIAS`；且 `boundVariables.componentProperties` 说的是「这个属性值绑到哪个变量」，与属性值本身是两件事 |
| **采用**：契约加平台特有可选成员，值按引擎 `VariableAlias` 逐字透传 | 采用 | 复用既有超集字段机制（第 7 个同形字段），零新抽象；`variableId` 可直接回喂写 op，读写闭合成环 |

## 结论

**不引入模式**，保持「平台特有超集可选字段 + serialize 投影 + 线格式声明」这套既有机制 —— `host.ts:140` 的超集块已经承载了 `textTruncation`/`maxLines`/`fillStyleId`/`strokeStyleId`/`textStyleId`/`effectStyleId`/`componentProperties` 七个同形成员，再提一层抽象是给稳定结构加跳转成本（命中 SKILL.md 停止条件「分支少、稳定、可读」）。

值的形状**原样透传引擎三态**：`VariableAliasRef = {type:'VARIABLE_ALIAS', id}`。三态由引擎决定 —— 标量绑定字段（`cornerRadius`/`width`…）是单个别名；`fills`/`strokes`/`effects`/`layoutGrids`/`textRangeFills` 是别名数组；`componentProperties` 是 `{属性名: 别名}` 表。**不新增词汇、不拍平、不改名**。

三条纪律：

- **只读且同步**：Figma 没有异步变体，本字段是**值成员**不是能力签名 —— 0010 管的是「新增能力签名一律 Promise」，此处与既有 `fillStyleId`/`componentProperties` 成员同档，故不冲突。
- **取不到就省略，绝不掀翻整份序列化**：`boundVariables` 的 getter 一旦抛，只丢该字段（与 `variantProperties`/`mainComponent` 同纪律，`serialize.ts:331-352` 先例）。理由同 0011 的 `findNodes` 教训：一个坏节点不能掀翻整次查找。
- **`cornerRadius` 的引擎怪癖原样保留**，由字段描述点名：有独立圆角的节点上，`cornerRadius` 绑定会表现为四条半径键而非 `cornerRadius`（typings `plugin-api.d.ts:6441` 明写）。归一化掉它反而会让「写 `cornerRadius`、读回四条」看起来像我们的 bug。

## 最小落地

1. `shared/src/schemas/platform.ts`：新增 `variableAliasRefSchema` + `boundVariablesSchema` 及配套类型，与 `componentPropertyValueSchema` 同处（平台特有读形态集中放）。
2. `shared/src/schemas/serialized-node.ts`：`SerializedNode` 加 `boundVariables?`（并入 `:109` 的「平台特有字段」注释块）+ zod 声明。
3. `shared/src/core/host.ts`：`NodeSkeleton` 加 `boundVariables?: shared.BoundVariableAliases;`（贴 `:147` 的 `componentProperties`）。
4. `shared/src/core/serialize.ts`：在 try/catch 内把整对象**浅拷贝**进 `base`（与 `:368` 的 `componentProperties` 同形；不深拷 —— 紧接着就被 JSON 序列化）。
5. `ui/src/code/figma/sync-guarantee.ts`：`SupersetPresenceCheck` 名单加 `'boundVariables'`（Figma 侧必须有据）。
   ⚠ **不加「值类型一致」断言**：线格式刻意是**自描述的三态联合**，不是引擎 mapped type 的子类型（`Record<string, A | A[] | Record<string,A>>` 在 `fills` 键上与目标要求的 `VariableAlias[]` 不可分配）。这里的漂移守护是「存在性断言 + 运行时逐字拷贝」，不是类型子集。
6. 单测（`shared/src/__tests__/write-path.test.ts`）：三态各投影一次；getter 抛时整份序列化不崩且该字段省略；无该字段的节点（jsDesign/MG 形状）结果里不出现该键。

## 成本与退出条件

- 成本：线格式多一个三态联合（zod + 两份类型声明）；每节点多一次 `in` 判断。**无新模块、无新间接层、无新增网络跳数**。
- 退出条件：
  - 若 Figma 把 `boundVariables` 改成异步入口（或 `dynamic-page` 下开始抛），本字段须从「投影时同步读」改为经 Access 层异步取（0011 的形状，补 `*Async` 分支）。判据：typings 出现 `*Async` 变体，或真机抛 `Cannot call with documentAccess: dynamic-page`。
  - 若三平台都提供字段级变量绑定读，本字段应从「平台特有超集」升格为通用字段，并在 `references/platform-limits.md` 注销这条差异。

## 验证

- 静态（2026-09-25 已跑，全绿）：`pnpm run typecheck`、`pnpm run test`（201 passed）、`pnpm build`（三平台产物）。
- 单测（`shared/src/__tests__/write-path.test.ts` 的 `变量绑定的读出口(0024)`，5 例）：三态原样透传 + 出参 schema 收得下；别名 `type` 不是 `VARIABLE_ALIAS` 时线格式**拒收**；空绑定整个键省略；无该字段的平台形状结果里不出现该键；getter 抛错时序列化不崩且该字段省略。
- 编译期两侧成对断言（本次新加，`boundVariables` 同时进入三张名单）：
  - `ui/src/code/figma/sync-guarantee.ts` 的 `SupersetPresenceCheck` —— Figma 必须有据；
  - `ui/src/code/jsdesign/sync-guarantee.ts` 的 `JsDesignAbsent` 与 `ui/src/code/mastergo/sync-guarantee.ts` 的 `NodeAbsentGap` —— 这两个平台必须**没有**。
  这三条是「平台差异」而非「我们少写了一个类型」的机器证明（同 0021/0022 的口径）。
- 真机（Figma，**插件重载后**）：建 COLOR 变量 → 选一个填充=该变量值的节点 → `jsd_find` 回包应出现 `boundVariables.fills[*].id`；把变量值改成与原值**相同**再回读，字段仍在（这正是「分不出绑定与写死」的反例）；`jsd_get_selection` 与 `jsd://node/{id}` 两个出口同样带该字段。
- 回退路径：MasterGo / jsDesign 的同节点序列化**不得**出现 `boundVariables` 键。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-25 | 初次决策（由读路径盲区触发：绑定在回包中完全不可见） | 采用「原样透传 + 既有超集字段机制」，不引入归一化层 |

> 副作用（非本决策内容）：本记录入索引后 `INDEX.md` 越过 15 KB 硬上限，按
> `.agents/skills/software-design-patterns/references/decision-log.md` 的治理动作精简了历史行的
> 「影响范围」列（文件清单本就写在各自记录头部，索引只留指路），索引回到 13.7 KB。结论未变，故不另立记录。
