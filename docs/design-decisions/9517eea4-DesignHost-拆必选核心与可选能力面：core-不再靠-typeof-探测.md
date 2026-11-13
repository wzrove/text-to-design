# 9517eea4. DesignHost 拆必选核心与可选能力面：core 不再靠 typeof 探测

- **日期：** 2026-11-13
- **状态：** 已采纳（一步实施，见下「本次不做」）
- **影响范围：** `shared/core`（host 契约）、`shared/core/access`、三侧 `ui/code/*`
- **相关记录：** 0010（异步优先）、0011（Access 层收口）、0017（MG 门面投影）、0022（平台事实声明表）、0042/0043（样式枚举按声明选路）、e1e66f0a；本记录取代 `架构评审 2026-11-14 §7` 的提议，不取代上述任何记录。

## 压力

`shared/core/host.ts` 的 `DesignHost` 把「三平台都有」的成员与「有的平台没有」的成员混在一个接口里，后者共 15 个可选成员（`ungroup?`、`getNodeByIdAsync?`、`loadAllPagesAsync?`、`setCurrentPageAsync?`、8 个 `getLocal*Styles(Async)?`、`getLocalVariablesAsync?`、`clientStorage?`、`ui.resize?`、`ui.chromeHeight?`）。

后果是一条已经付过两次代价的链，且有真机取证：

1. 契约允许成员缺席 ⇒ core 只能 `typeof host.xxx === 'function'` 探测（`access.ts:36/105/154/258`）。
2. 探测在某平台**答错**：jsDesign 的 host 是 `Object.create(native)`，typings 未声明的成员运行时照样透出来，且 `getMainComponentAsync` / `loadAllPagesAsync` **永不 settle**（`access.ts:89-98`、`:120-136`，实测 25008/25109ms 撞满转发上限）。
3. 于是补了 `mainComponentSync` / `styleEnumerationSync` / `documentScopeRead` 三个能力位去**覆盖探测结果**（dec 0042/0043、e1e66f0a）。
4. 能力位需要 `RuntimeContext` 一路透传 ⇒ `access.ts:100-118`、`:190-243` 变成「先查能力、再决定问哪个入口」。

即：**符号存在性 ≠ 可用性**这条事实，被迫在 4 个地方各惩罚一次。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 拆出 `DesignHostOptionalCapabilities`，`DesignHost` 继承它 | 采用 | 可选成员有唯一归属处；现有 15 个调用点一行不改（继承后形状不变） |
| 全量拆成 `DesignHostCore` + `DesignHostAsync` 两个不相交接口，core 只依赖 Core | 本次不做 | core 的 `access.ts` 本身就是**唯一**该碰可选面的层（0011 已把异步边界收在这里），拆成不相交会把同一层劈成两个类型参数、波及 15 处签名与三侧 adapter，收益集中在源码可读性而非运行时 |
| 删掉所有探测，只认能力位 | 排除 | 能力位未注入时（`ctx.capabilities == null`）必须 fail-open，否则测试装配与 legacy 路径全废（dec 0002） |
| 把 figma/jsdesign 的 `as unknown as DesignHost` 改 `satisfies` | **排除** | 见下「为什么不断言三平台形状」 |
| 保持简单：只加注释说明哪些成员是缺口 | 不足 | 注释不改变「可选成员混在公有面」这一事实，新成员继续往 `DesignHost` 里加 |

## 结论

不引入新模式。把 15 个平台缺口成员收进独立接口 `DesignHostOptionalCapabilities`，`DesignHost` 继承它。这是**声明层的归类**，不是运行时改造。

### 为什么不断言三平台形状（`as unknown as` 保留）

评审原提议是「把 `figma/host.ts:34` / `jsdesign/host.ts:31` 的 `as unknown as` 退成 `satisfies`」。读代码后判定**不能这么做**：

- 运行时全局 `figma` / `jsDesign` 的类型来自各自 typings，**结构上确实不满足** `DesignHost`（成员是 `*Async` 改名后的契约形态，原生是同步名），`satisfies` 会直接编译失败。
- 真要满足它只能写对象字面量逐成员投影，而那正是 `Object.create` 注释所拒绝的（`figma/host.ts:25-29`）：**对象展开/字面量投影会把 `currentPage`、`viewport` 这类 getter 在插件启动早期立即读出并抛**。
- MG 之所以能显式投影，是因为它的原生形状与契约差距大、且额外有 `node-facade.ts` 承担节点层投影（dec 0017）；figma/jsDesign 结构本就接近，硬投影反而引入启动期读取。

⇒ 「三平台保证强度不可比」这条**保留**，但它不是本记录要解决的问题；正确做法是各平台继续用 `sync-guarantee.ts` 的类型级断言（已在 `ui/code/shared-guarantee.ts` 收敛了通用机制）。

## 实施方案

- **目标形状（全量）**：`DesignHost` = `DesignHostOptionalCapabilities`（平台缺口面，全部可选）+ 三平台必选成员（创建 / 文档根 / 布尔 / 字体 / UI 外壳）。
- **本次不做**：
  - 不把 `ui.resize` / `ui.chromeHeight` 从 `ui` 子对象里提出（它们在 `ui` 内部已是可选，且语义属于外壳而非宿主能力）。
  - 不删 `access.ts` 的 `typeof` 兜底（fail-open 契约，dec 0002）。
  - 不改三侧 adapter 的装配方式（`Object.create` / 显式投影各自保留，理由见上）。
  - `NodeSkeleton` 里的平台特有超集字段（`textTruncation` / `boundVariables` 等）不动：那是节点形状不是宿主能力。

## 成本与退出条件

- 成本：几乎为零（纯声明层，调用点零改动；typecheck 已全绿）。
- 退出条件：若将来某平台新增一个「三平台都有」的能力，它进 `DesignHost` 本体；只有当可选成员开始**直接**出现在 `DesignHost` 里（不经可选面）时，本归类失效、需重开。

## 验证

- 不变量测试：沿用 `ui/code/*/sync-guarantee.ts` 的契约断言（改 `shared-guarantee.ts` 后三平台导出名集合与 HEAD 逐一比对无变化）。
- 边界/并发/重试用例：N/A（无运行时变更）。
- 指标与日志：无新增。
- 实际执行：`pnpm run typecheck` 全绿（shared / mcp-server / ui / figma / mastergo / website / telemetry + 根 tests）。
- 未做：build、三平台客户端真机重载、测试套件（按仓规由用户执行）。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-11-13 | 落实架构评审 2026-11-14 §7 | 采用「可选能力面」归类；明确**拒绝**把 adapter 断言改成 `satisfies`，并把理由写进记录 |
