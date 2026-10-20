# 0040. MG 变量读写接入 platformOps：op 形制对齐 Figma，槽位取值以官方文档为据

- **日期：** 2026-10-10
- **状态：** 已采纳（MG 真机已复验，2026-10-15 / 2026-10-19；两条新发现已按真机结论改代码并在真机验收）
- **影响范围：** `ui/`（`code/mastergo/{ops,meta,sync-guarantee}.ts`、`code/figma/ops.ts`）、`shared/`（`dicts/{platform-knowledge,capability}.ts`）、`mcp-server/`（`tools/{platform-facts,prompts}.ts`、`README.md`）
- **相关记录：** 走 0020 的第二档（platformOps 通道，不新造工具族）；op 形制沿 0019/0033；写完回读沿 0018/0007；平台差异只落声明表与投影点沿 0022/0032；变量面双平台并存沿 0039（它先接的 MG 只读枚举）

## 压力

MG 的变量面此前是**半截**的：0039 接了只读枚举（`get_page.assets.variables` 能列出变量），
但没有写入口 —— 而变量的价值全在「建出来、绑到图层、画布跟着变」。

三个具体压力：

1. **建了也用不上**。这正是 0019 记过的教训的另一面：`mg_add_component_property` 存在之前，
   「只 add 属性不绑定，属性不驱动任何东西」。变量同理 —— 只读清单对调用方没有产出。
2. **槽位取值无处可依**。`mg.variables` 的整片 API 在 typings 里**只有签名、没有一句说明**，
   `setVariableReferenceInLayer({strokeProperty: 'all'})` 这类槽位的取值全是裸 `string`。
   照类型猜会写出 `'strokeWidth'` 这种不存在的槽位，而引擎侧要么静默不生效、要么抛一句
   没有上下文的错 —— 属于 0007 要根治的静默失效。
3. **配方会喂错词汇**。`variable-binding` 配方的「批量绑定」那段此前硬写着 Figma 的字段词汇
   （`nodeIds` + `boundProperty` + `variableId`）。MG 一旦有了写入口，`hasWrite` 判定就会
   让同一段文案落到 MG 调用方身上 —— 参数名全错，且不会报错，只会静默绑不上。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 走既有 platformOps 通道，op 形制对齐 Figma（三平台共用一套调用纪律） | 采用 | — |
| 按 MG 的形状新造一族工具（`mg_variable_*` 独立工具） | 排除 | 撞 0020「不按平台重定义工具」；且平台 op 本就由 `jsd_platform_op` 单工具分发，op 多了不涨目录体积 |
| 只接「建变量」，不接绑定（等真机验证绑定语义） | 排除 | 回到压力 1：变量建了不驱动画布，等于又造一个半截能力；绑定入口有官方文档可依，不是猜的 |
| 把槽位做成自由字符串（`Record<string, string>` 透传） | 排除 | 那等于把「猜槽位」的活转嫁给调用方，而 typings 里没有任何线索可猜 —— 文档给了确切取值，就该落表并在入参校验点名（0034） |
| 把 MG 的绑定参数也命名为 `boundProperty`（与 Figma 同词） | 排除 | 两套取值域**不对应**（Figma 是节点字段词 fills/strokes/width，MG 是槽位词 opacity/all/width/…），同词不同义比异词更容易错用 |
| 让配方继续按 `hasWrite` 拼接 Figma 文案 | 排除 | 就是压力 3；平台句子挪进 `platform-facts.ts`（0022/0032 的投影点） |

## 结论

**不引入模式**，走既有的 platformOps 通道加三个 op，并把「平台句子」从配方挪进投影点：

| op | 作用 | 参数形状 |
|---|---|---|
| `mg_list_variables` | 摸底 / 回读：集合（含模式）+ 变量（类型 / 集合 / 描述 / 各模式的值） | `{ collectionId?, type?, limit? }` |
| `mg_variables_create` | 批量建变量（同名集合复用、同名同类型就地更新值、失败回滚本次新建集合） | `{ collectionName?, variables: [{ name, type, value?, description? }] }`（**刻意对齐 Figma 的 `figma_variables_create`**） |
| `mg_variables_apply` | 绑定 / 解绑变量到图层属性 | `{ nodeIds, variableId, property, value, index?, unbind? }` |

槽位取值表（`baseProperty` / `strokeProperty` / `radiusProperty` / `paddingProperty` /
`dimensionProperty` / `effectProperty` / `gridProperty` / `textProperty`）逐值取自
**官方文档** https://developers.mastergo.com/apis/variables 的「属性参数一览」，
落进 `ops.ts` 的 `VARIABLE_SLOTS`，由 zod `superRefine` 在入参校验就点名（0034 的越界字段点名）。

## 实施方案

- **目标形状（全量）**
  - **依赖方向**：op 只碰宿主全局 `mg.variables.*`（MasterGo adapter 的地盘），
    core 与 MCP 侧完全不感知；MCP 侧只从 ping 的 `platformOps` 名单认 op。
  - **调用时序**：建 → 绑 → 回读；三段可合进 `jsd_batch`，中间 id 用占位符。
  - **回读纪律（0018/0007）**：`create` 回读 `getVariables({collectionId})` 确认每个变量都在，
    缺一个就抛；`apply` 回读 `getLayerVariableModes` 拿「该图层用到了哪些集合」，
    拿不到变量所属集合时在结果里点名 `unverified` + `warning`。
- **本批做**：上述三个 op；`platform-knowledge.ts` 的 MG `variables.write` 与 `nativeUnwired`；
  `meta.ts` 声明 `variables` 能力位；`variable-binding` 配方的三段平台句子挪进 `platform-facts.ts`
  （`variableBindShapeText` / `variableBindBulkText` / `variableBindVerifyText`）；
  `variableFaceText(platform=null)` 那半句改成按表逐平台派生（原来硬写 figma 的读路径）。
- **本批不做**：模式管理（addMode / renameMode / deleteMode / set变量模式）、分组管理、
  变量引用变量（`setVariableReference` / `unlinkVariable`）/ 作用域 / 代码语法 /
  `addVariableValue`（复合变量补子项）/ `createVariableInLayer`（一步建绑，与 create+apply 重叠）
  —— 逐条登记进 `nativeUnwired`，不是遗忘。这也是 0033 那两个别名 op 仍在等的东西
  （它们绑的是变量别名，本批只做到「变量 ↔ 图层属性」）。

## 成本与退出条件

- **成本**：MG 侧多三个 op（约 300 行，含回读与槽位表）；`platform-facts.ts` 多三个纯函数
  （配方句子按平台分叉的代价）；`platformOps` 名单 11 → 14（目录体积不受影响：平台 op 由
  单一 `jsd_platform_op` 工具承载，不进工具目录 —— 0006 的门禁因此不被动到）。
- **退出条件**：
  - 若真机证明 `setVariableReferenceInLayer` 的槽位语义与文档不符（文档滞后），回退到
    「只留 `mg_variables_create` + `mg_list_variables`，绑定按 0019 的 `sub layer` 思路另开」；
  - 若官方把 `mg.variables` 的写入口重做（如合并成一次事务型调用），三个 op 收敛成一个，
    配方句子随之删一段即可 —— 平台句子与 op 都只在一处。
  - **`DomainFact.read` 已装不下「多条读出口」**（Figma 现在是节点字段 + 清单 op 并列）。
    第三家平台再挂读 op 时，把读 op 名单拆成独立字段（`readOps: readonly string[]`），
    同时改 `tests/platform-knowledge.test.ts` 的 `FACT_KEYS` 与两个渲染点 —— 别继续往
    这个字符串里塞分隔符。

## 验证

- 不变量测试：`pnpm run typecheck`。新增两组编译期断言（`sync-guarantee.ts` 第 8 节）：
  ① op 里调的 11 个 `mg.variables.*` 方法必须真在 `PluginAPI['variables']` 上；
  ② op 的变量类型 enum 与 typings 的 `VariableType` **双向同宽**（`MgVariableTypeInTypingsCheck`
  + `MgVariableTypeCompletenessCheck`）。
- 边界用例：槽位取值传错必须在入参校验就被点名（zod `superRefine`），不许落到引擎；
  `create` 的回滚只覆盖本次新建的集合，复用既有集合时不删。
- 指标与日志：daemon 日志里三个 op 的 `耗时=`；`platformOps` 名单从 11 变 14 后，
  `jsd_ping` 与面板能力区块应同时更新。
- **真机（MasterGo，2026-10-15 已跑）** —— 五项逐条：
  ① **建单值变量并回读**：BOOLEAN `{bool:true}` ✓、NUMBER `{floatData:[42]}` ✓、COLOR `{floatData:[0.1,0.6,0.3,1]}` ✓；⚠️ **STRING 回读不到值** —— 写 `"你好"` 不报错，`mg_list_variables`（按集合 / 按 `type:"STRING"` 两种筛法）回的仍是 `{modeId}`，没有值字段（`values: v.modes` 是原样透传，不是我们的投影丢的）。**待处理**。
  ② **复合样式变量不带 value**：`{name:"TDD40-样式变量", type:"PAINT"}` 建成，读回是**默认空样式**（`type:0` / `color` 白 / `alpha:1`）—— 与「不传就是空样式」的口径一致 ✓
  ③ **槽位绑定真改画布**：`baseProperty/fillColor` 绑 COLOR 变量 → 矩形回读 `fills` 变成变量色 `0.1/0.6/0.3`；`strokeProperty/color` 再绑一次 → `strokes` 同样变 ✓；回包带 `applied:["10:06"]` + `linkedCollections:[{layerId,collectionIds:["10:6"]}]`
  ④ **unbind 能解开**：`{property:"baseProperty", value:"fillColor", unbind:true}` 回 `applied`。⚠ 直接回读**看不出**是否解开（填充仍是当时的值），故用**判别实验**：把变量值改成蓝 —— 解绑过的 `fills` **不动**（保持绿），仍绑着的 `strokes` 跟着变蓝 ⇒ 解绑真的生效 ✓（这也是「解绑保留当时取值」的正确语义）
  ⑤ **错槽位点名可选项**：`baseProperty` 传 `"nope"` → `baseProperty 不接受「nope」,可选:opacity / fillColor / visible` ✓；顺带取到另两张表：`strokeProperty` = `top / right / bottom / left / all / color`，`textProperty` = `fontFamily / fontWeight / fontSize / lineHeight / letterSpacing / paragraphSpacing`
  ⑥ **额外发现**：`mg_variables_remove` 删后报 `failed`（5 条，理由「deleteVariable 调用后该 id 仍读得到」）—— 判成**回读滞后**，10-19 重载后复验证实（见下节）。

**定位（2026-10-15，按 typings）**：`getVariableById(id): Variable | null`(:1176)、`deleteVariable(variableId): void`(:1218) —— 签名与用法一致，两个读面及时性不同。

### 真机复验（MasterGo，2026-10-19，重载插件后两轮）

第一轮结论有一半是错的，第二轮（重载后重跑）才把「跨执行生效」这条钉死：

| 探针 | 真机结果 | 判据 |
|---|---|---|
| 单值变量删除 | **跨执行才生效**：同一执行内删两遍（id 95:525）仍读得到、报 failed；**下一次执行**再删立刻 `removed`（95:515 / 95:522）。10-15 那 5 条 `failed` 正是这个形态 ⇒ 「回读太早」的诊断是对的 | 本执行内读得到 ≠ 失败，归 `pending` |
| 复合样式变量（PAINT）删除 | `deleteVariable` 是 **no-op**：跨多次执行仍在（`mg_list_variables`、`assets.variables`、拿它绑图层三面都证明它活着）；同 id 走 `jsd_delete_style` 一次删掉（95:474 / 95:492 / 95:518 同） | 引擎没收这个动作，**动手前就拒** |
| STRING 变量值 | 三个读面（列表 / `getVariableById` / `setVariableValue` 的返回）都只有 `{modeId}`，`values` 也不带值；绑 `textProperty/fontFamily` 回 `applied` 但节点 `fontName` 不变，绑 `fontSize` 直接 `failed`（类型不合） | **值不可验证**，`values` 不作判据 |

改法（最终版）：

- `removeVariables` 回三档：`removed`（本执行内已不见）/ `pending`（已下发、本执行内仍见 —— 单值类型正常形态，下次调用复核）/ `failed`（找不到该 id；或复合样式类型，**动手前就拒**并点名走 `jsd_delete_style`）。分流依据是**删前读到的 `type`**。
- `createVariables`：`setVariableValue` 的返回**只原样透传**（`values`）—— 它时有时无：同批里有的带 `bool`/`floatData`、有的只有 `{modeId}`、默认双模式集合回空对象（空则省键）。
- 代码：`mastergo/ops.ts` 的 `removeVariables` / `createVariables` 与两条 op 描述；changeset `auto-mg-variable-readback.md`。`pnpm run typecheck` 通过。
- ⚠ 第一版曾想「删后等两拍再回读」，用了 `window.setTimeout` → 真机上 `'window' is not defined`（**MG 插件沙箱没有 `window`**，仓内 `code/plugin.ts` 用的是裸 `setTimeout`）。既然同执行内等也等不到，索性不白等：直接按回读结果分 `removed` / `pending`。

**顺带澄清一条早前的误判**：第一轮曾把「`TDD-RB`(95:466) 的 4 个单值变量怎么都删不动」记成引擎拒删 —— 重载后再删 95:468 一次成功 ⇒ 那只是**删除延迟**在连续同会话里的累积表现（同集合、同执行内反复报 failed），不是不可删。结论：判据永远别用「本执行内还读得到」。

测试现场：矩形/文本节点、`TDD-RB2`~`TDD-RB6` 的探针变量、默认集合里的两个 STRING 变量、三个 PAINT 变量（走样式入口）均已删；`assets.variables` 会滞后一屏，隔次调用才对得上。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-10 | 初次决策：用户要求「MG 变量的读写也给加上」 | 采用：走 platformOps 加三个 op，形制对齐 Figma；槽位取值以官方文档为据落表 |
| 2026-10-15 | 真机复验（MG）：变量建/读、槽位绑定、解绑、错槽位点名 | 结论不变。①②③⑤ 通过；④ 用「改变量值」判别确认解绑生效（直接回读看不出）。**两条新发现**：STRING 变量值回读不到值字段；`mg_variables_remove` 删成功后仍报 `failed` |
| 2026-10-15 | 按 typings 定位并改代码（`mastergo/ops.ts`） | 结论不变、实现变了：`removeVariables` 按类型分流判成败（单值看列表、复合样式看 id）；`createVariables` 回包补 `values`（`setVariableValue` 的返回）。`pnpm typecheck` 通过，changeset `auto-mg-variable-readback.md`；**真机复验待重载插件** |
| 2026-10-19 | 真机验收（重载第三版插件） | 通过：删单值回 `pending:[id]` + `failed:[]`，隔次调用已不在清单；PAINT 走 pre-reject 并点名 `jsd_delete_style`，样式入口一次删掉；按 id 查滞后这条也复现（95:528 已不在清单，`getVariableById` 仍解析得到，没误报「没有找到变量」） |
| 2026-10-19 | 真机复验（重载插件后，两轮探针） | 两条定死：① **单值类型的删除跨执行才生效**（同执行内双删仍报 failed，下一次执行立刻 removed）⇒ 10-15 的「回读太早」诊断成立，回包加 `pending` 档；② **复合样式变量的 `deleteVariable` 是真 no-op**（跨多次执行仍在），改为动手前就拒、点名走 `jsd_delete_style`。另 STRING 值的三个读面都没有值 ⇒ `values` 降级为原样透传。第一轮记的「含 PAINT 批量后变量删不动」已澄清为删除延迟，不是不可删 |
| 2026-10-10 | 用户追问「mg 增加这么多 op，figma 呢」→ 对账后发现 Figma 变量面缺**清单**与**解绑**（MG 有、它没有），补 `figma_variables_list`（与 `mg_list_variables` 同形）+ `figma_variables_apply` 的 `unbind` | 结论不变（同一机制应用到另一半）。顺带把两个平台的 `variableId` 都改成**可选**：解绑不需要变量（Figma 的入口收 `null`、MG 的 `unlinkVariableReferenceInLayer` 不收 id），此前两个 schema 都把它写成必填 —— 那会让「解绑」这个动作凭白要求一个用不上的 id。绑定方向由 `superRefine` 守（缺 `variableId` 就点名）。另:这轮确认「读 op 名单」在 `DomainFact.read` 里是**第二个**用例(Figma 的 `boundVariables` + 清单 op 并列),字段已显粗粒度 —— 第三家再挂读 op 时应拆成独立字段(记进「退出条件」) |
