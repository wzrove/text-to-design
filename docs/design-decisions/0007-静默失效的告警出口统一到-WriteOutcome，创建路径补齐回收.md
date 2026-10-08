# 0007. 静默失效的告警出口统一到 WriteOutcome，创建路径补齐回收

- **日期：** 2026-09-19
- **状态：** 已采纳
- **影响范围：** `shared/src/core/{execute,buildNode,update,export}.ts`、`shared/src/core/props/{writers,outcome}.ts`、`shared/src/dicts/unapplied-prop.ts`、`mcp-server/src/server.ts`、`mcp-server/src/tools/{batch,manage,prompts,raw,resources,create,props}.ts`
- **相关记录：** 0001（PropWriter 两阶段管线）、0003（工具级钩子 + tags）、0004（WriteOutcome 与固定顺序管线）

## 压力

一次 jsd_* 使用复盘（2026-09-19）的 8 条观察里，4 条是同一类：**回显成功、画布没生效，却没有任何提示**。

| 现象 | 实测证据 | 代码位置 |
|---|---|---|
| 根节点 `x/y` 被 `placement`（缺省 `center`）覆盖 | 传 `(2400,0)` 落在 `(-504,-315)`（视口中心≈`(-304,-215)`），无 warnings | `core/execute.ts` |
| TEXT 给了 `width` 但没声明 `textAutoResize`：宽度生效、文本会换行，**文本框高度却不随内容重算** | 200 宽的长文本：导图目检 4 行（400×120@2x），而 `height` 回读 **15**；原因是引擎 `resize()` 把 `textAutoResize` 置成了 `NONE` | `core/props/writers.ts`、`core/buildNode.ts` |
| 显式声明 `textAutoResize:"HEIGHT"` 在**创建路径**被压回 `NONE` | 传 `width:200 + HEIGHT` 回读 `NONE`、`height=15`；同一节点先 `jsd_set_text` 设 `HEIGHT`（修改路径 → 回读 `HEIGHT`），再单独 `resize(180)` 立刻翻回 `NONE`、`height` 变 93 —— 隔离出「resize 重置」这一根因 | `core/props/writers.ts`（`textStabilizeWriter`） |
| TEXT 完全不给尺寸 → 确实不换行 | 不给 width 的长文本：`textAutoResize` 保持 `WIDTH_AND_HEIGHT`、`width` 撑到内容宽 400、`height` 单行 24 | 同上（保持平台语义，不干预） |
| `fontName` 写了不存在的组合（把 style 写成简称 `"Bold"`）→ 回读照抄请求值、渲染退回默认字面；写对（`SourceHanSansCN-Bold`）则字重真的生效 | 旧产物：style `"Bold"` 与 `"Regular"` 两点导出 PNG **逐字节相同**；新产物改用 `fonts[].styles` 全名后 Bold vs Regular = 3381 / 3406 字节（sha1 不同）—— 不是「平台不支持中文加粗」,是写法错 | `core/props/writers.ts`（`verifyFont`：用「是否被引擎规范化」判定未解析） |
| 创建路径的 P31（方向回读压不住）同样静默 | 0004 定义了 `WriteOutcome`，但**只有修改路径回收**，创建路径把 `readback` / `warnings` 丢掉 | `core/update.ts` vs `core/execute.ts` |

代价：调用方（尤其模型）只能靠肉眼或导出图发现异常，而它的验收依据正是「回显成功」——这类问题会以「样式怪 / 位置错」的形式被误诊，与本仓 P7（回显不等于生效）同一族。

同批复盘还发现一处**事实漂移**：返回键形状（`clone`/`outline_stroke` 为数组，`group`/`flatten` 为单对象）在 `jsd_batch` 描述、`jsd_manage_nodes` 描述、README、`server.ts` INSTRUCTIONS 四处各写一遍，前两处写成「group/flatten→created[]」——按它写占位符会报「无法解析占位符引用」并掐断整批。成因与 0003/0004 要消灭的「同一事实手写多份」完全一致。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| **回读为证的回收出口**（补齐 `WriteOutcome` 回收面 + 静态「字段→修法」字典） | 采用 | 只在**回读证据成立**时才点名：引擎真吃下了值就一个字都不报，不靠「我猜它会丢」 |
| 写前静态规则（例：见 `width` 且无 `textAutoResize` 就告警） | 排除 | 平台语义未定论（`resize` 在被 auto-resize 接管时是否改尺寸，无法从源码判定），静态规则会误报；同一份知识应以「回读不一致 + 修法」表达 |
| 每个字段各写一段告警（`update.ts` 现状形态） | 排除 | 同一个平台缺陷会在创建/修改两条路径各写一句措辞不同的话，或一条干脆漏掉——本记录的 4 条现象里有 3 条就是这样漏的 |
| Observer / 事件总线 | 排除 | 命中其反面信号：这里只有**单一出口 + 固定顺序判定**，没有多订阅者；0005 已排除事件类架构，引入只会增加「谁吞了告警」的排查成本 |
| 保持简单（只补 in-line `if` + `console`） | 排除 | 0004 的 `WriteOutcome` 出口已经存在却没接，再开旁路等于第三份事实 |

## 结论

**不引入新模式。** 把 0004 的 `WriteOutcome` 回收面补全到两条路径，并新增一份静态字典承载修法文案：

- `WriteOutcome.readback(ok:false)` 与 `WriteOutcome.warnings` 是「没生效」的**唯一事实源**；
- `dicts/unapplied-prop.ts` 是字段级修法文案的**唯一真源**（`layoutMode` / `fontName` / `width` / `height` / `textAutoResize` + 兜底）；
- `core/props/outcome.ts` 只做搬运与组装（`harvestOutcome` / `unappliedWarning` / `nodeLabel`），不判定；
- 创建路径用 `CreateNotes`（`skipped` 门控 / `unapplied` 回读不一致 / `messages` 自述）一次调用共用一份，由 `executeOps` 汇总；修改路径直接读 `outcome`，调用同一个组装函数。

writer 的职责边界保持 0004 的口径：**`write()`/`settle()` 生产事实，`outcome.ts` 只组装文案**（回压仍只属于 `PropWriter.settle()`）。

引擎实测（2026-09-19）额外暴露一个**产品缺陷**（记作 P34，变更历史见 0001）：`resize()` 会把 TEXT 的 `textAutoResize` 重置为 `NONE`，而创建路径的尺寸回压跑在文本字段之后 → 调用方显式声明的 `HEIGHT` 被吃掉。修法沿用 0001 的同一条判据——**声明过的值在写尺寸之后再压一遍**——新增 `textStabilizeWriter`（`id: 'text-stabilize'`，只在 settle 动作），接进创建路径的 settle 顺序（尺寸 → 文本自适应 → sizingMode → 方向）与 `UPDATE_WRITERS`。

## 最小落地

- 角色与职责：`textWriter.verifyFont()`（写后回读字体）、`textStabilizeWriter.settle()`（回压声明的 `textAutoResize`）、`buildNode`（settle 后 harvest + TEXT 尺寸/自适应模式回读）、`executeOps`（汇总 warnings，含 placement 覆盖）、`updateSelection`（回收非 `layoutMode` 项 + `outcome.warnings`）。
- 接口所在层与依赖方向：`core/props/outcome.ts` 只依赖 `WriteOutcome` 与 `dicts/unapplied-prop.ts`；dicts 不反向依赖 core（AGENTS.md 的静态字典归口）。
- 创建与装配位置：无新增容器/注册点——挂在既有 `buildNode` / `executeOps` 与既有两个 writer 数组上。
- 一次调用时序：`write()` → `settle()`（尺寸 → 文本自适应 → sizingMode → 方向）→ `harvestOutcome`（回读 + 自述）→ 汇总 `warnings` → 结果。

## 成本与退出条件

- 成本：每次创建多一次 `node.width/height` 与一次 `node.fontName` 读取（纯内存，无插件往返）；每次创建多跑一个只做回压的 writer；字典 5 条 + 1 条兜底；`listFonts` 输出多一份按 family 归并的 `fonts[{family,styles}]`（可选字段）。
- 退出条件：平台若修好某类覆盖（例如真正支持任意字重），对应字段的回读不再产生 `ok:false`，字典条目与其提示自然失效——确认长期不命中后删该条，不留空槽（与 0004 的退出条件同口径）。

## 验证

- 不变量测试（`packages/shared/src/__tests__/write-path.test.ts`，29 例全绿）：
  - P34：把实测到的引擎行为（`resize()` 把 `textAutoResize` 翻成 `NONE`）编码进 fixture —— 声明 `HEIGHT` 时 settle 后仍是 `HEIGHT` 且不告警；只给 `width` 不声明时点名 `textAutoResize` 并给出 `HEIGHT` 写法；
  - TEXT 的 `width` 被改写 → 点名 `width` 且给出 `textAutoResize:"HEIGHT"` 修法；
  - `fontName` 回读不一致（创建、修改两条路径各一例）→ 点名 `fontName`；回读带命名装饰（实测的 `_family` 形态）→ **不误报**；
  - 引擎真吃下值 → `warnings` 为 `undefined`（**不误报**，这是选「回读为证」的关键断言）；
  - 根节点 `x/y` 被 placement 覆盖 → 点名并给出两种正确姿势；`mode:"manual"` 下不告警且坐标生效（`x=2400`）。
  - `jsd_list_fonts` 按 family 归并出 `styles`。
- 边界：`0.5px` 尺寸容差（亚像素取整不算被改写）；`MIXED` 字体跳过；插件版本错位时 `listFontsResult.fonts` 为可选字段，不让一次只读调用整体失败。
- 指标与日志：回读不一致随结果 warnings 回给调用方（与 0004「用户说没生效」的唯一证据同源）。
- 引擎侧实测（2026-09-19，三轮推进：旧产物基线 → 0007 回归 → 字体判定定案）：
  - **基线（改动前的旧产物）**：根节点 `x/y` 覆盖无告警（传 `(2400,0)` 落 `(-504,-315)`）；创建 TEXT 传 `width + textAutoResize:"HEIGHT"` 回读 `NONE`、`height=15`；`fontName` 请求 `SourceHanSansCN_family + Bold` 回读一致但两点导出 PNG **逐字节相同**（渲染等同 `Regular`）；`jsd_manage_nodes{op:'group'}` 返回 `created` 单对象，按旧描述的 `{{g.created[0].id}}` 引用 → 「无法解析占位符引用」掐断整批（台账指纹 `024cc63974dd`），改 `{{g.created.id}}` 全链通过；`jsd_list_fonts` 确认返回 `xxx_family` 原始名（93 族）。
  - **回归（重载插件后同一用例重放，全部通过）**：根节点 `x/y` 覆盖 → 结果带 warnings 并给出 `manual`/`absolute` 两种姿势；只给 `width` → warnings 点名 `textAutoResize`（并解释"宽度生效、高度不重算"）；`width + textAutoResize:"HEIGHT"` → 回读**保持 `HEIGHT`**且无 warnings（P34 修复生效，此前会被压回 `NONE`）；`jsd_batch` 用 `{{g3.created.id}}`（修正后的写法）→ `ok:true` 4/4；`jsd_list_fonts` 回显 `fonts:[{family,styles}]`（93 族）。台账：基线指纹 `024cc63974dd` 已按 `product-bug` 闭环（`--verified-by run-20260919T054535Z`）。
  - **字体写法（定案）**：`fonts[].styles` 里给的是**全名**（`SourceHanSansCN-Bold`）而不是简称；用简称会被静默忽略（回读照抄、渲染退回默认字面），改用全名后 Bold 与 Regular 导出 PNG 的 sha1 不同（3381 / 3406 字节）→ 字重**确实生效**，「中文加粗不生效」是写法错，不是平台限制。
  - **判定的时机与判据（上一版在真机误报，改正后五条全绿）**：引擎的规范化**只在结果序列化时可见** —— 判在写入/结算期会把合法写法误报成「没生效」（重载后实测命中）。移到结果装配期、用序列化值判之后，真实引擎上的表现：
    - 简称 `{SourceHanSansCN_family, "Bold"}` → **点名**，detail「回读仍是清单形态…」；
    - 全名 `{SourceHanSansCN_family, SourceHanSansCN-Bold}`（回读 `{SourceHanSansCN, Bold}`）→ **不点名**；
    - 不存在的族 → **点名**，detail「回读的字型是哨兵值「@@Regular」…」；
    - 短名对 `{SourceHanSansCN, Bold}`（实测被引擎接受）→ **不点名**；
    - 修改路径 `jsd_set_text` 传简称 → 同样点名（两条路径共用同一份判定）。
    台账：`run-20260919T060059Z` 收口「无报错」——即这轮回归通过。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-19 | 初次决策：把「回显成功却没生效」的回收面补到创建路径 | 采用「回读为证的回收出口」；排除静态规则、逐字段文案、事件总线 |
| 2026-09-19 | 同批复盘发现聚合入口漏挂漂移钩子、返回键文案两处写错 | 结论不变：钩子覆盖面的修正追加进 0003 的变更历史；文案漂移按「四处手写同一事实」收敛（`jsd_batch` / `jsd_manage_nodes` / README / INSTRUCTIONS 同步改） |
| 2026-09-19 | 引擎实测（旧产物基线）后修订 | 结论不变，两处按实情修正：① 原假设「TEXT 显式 width 被吃掉」不成立——实测宽度生效、文本会换行，被吃掉的是 `textAutoResize`（被 `resize()` 置成 `NONE`）导致**高度不重算**，检测项随之从「宽度差异」改为「未声明却被置 `NONE`」，并新增 P34 的 `textStabilizeWriter`；② `fontName` 一行的结论同日再更正——真正的坑不是「中文字重不生效」（那是把 style 写成简称导致的静默忽略），而是**写法约定**：family 用 `fonts[].family` 原样、style 用 `fonts[].styles` 全名；`verifyFont` 改为容忍引擎规范化 + 以「是否被规范化」判定未解析 |
| 2026-09-19 | 重载后实测到**判定时机**错误，`fontName` 的检测位点再次迁移 | 结论不变（仍是「回读为证的回收出口」），但**判定的时机与判据都换了**：① 时机上轮判在写入/结算期，而引擎的规范化要等到后续读取才可见——同一次调用里 `write` 阶段读到 `{SourceHanSansCN_family, SourceHanSansCN-Bold}`、序列化时已是 `{SourceHanSansCN, Bold}`，于是**会把合法写法误报**（重载后实测命中）；判定移到**结果装配期**，用 `serializeNode` 后的值做（`core/execute.ts` / `core/update.ts`）。② 判据由「回读既非请求也非其规范化」（过保守，实测连不存在的族都放过）换成两条可证的形态：请求带 `_family` **而结果仍带** `_family` ⇒ 未解析；结果里的族与请求不同 / style 落成 `@@` 哨兵 ⇒ 整族回退。③ 代价与边界：family 不带 `_family` 的少数族、以及「短名对已被引擎接受」这类形态不判（**宁可漏报不误报**，实测短名对 `{SourceHanSansCN, Bold}` 确实被接受）。④ 副产物：`UnappliedProp.detail` 让告警带上**本次实测到的形态**，不必让调用方去猜是哪一种 |
