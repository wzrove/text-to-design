# 0004. 写后校验用固定顺序 Pipeline 而非责任链

- **日期：** 2026-09-18
- **状态：** 已采纳
- **影响范围：** `packages/shared/src/core/update.ts`、`mcp-server/src/tools/props.ts`、`dicts/capability.ts`
- **相关记录：** 与 0001 同批落地；纠正早前评审把它称作「Interceptor Chain」的说法

## 压力

「样式类字段」这一个概念存在 3 份事实：

| 事实 | 位置 | 规模 |
|---|---|---|
| `INSTANCE_RISKY_PROPS` | `shared/src/core/update.ts:249` | 27 项手写 Set |
| `CONTAINER_SELF_VISIBLE_PROPS` | `shared/src/core/update.ts:287` | 20 项，其中前 16 项与上者重复 |
| `INSTANCE_STYLE_WARN` | `mcp-server/src/tools/props.ts:25` | 文案里第三次描述同一集合 |

外加三类写后补偿各自为政：

- 能力门控：`update.ts:406` 与 `buildNode.ts:314`（注释承诺同源，靠人守）
- layoutMode 回读重试：`update.ts:430` 与 `buildNode.ts:309`
- 实例的「改不动 → 告诉你主组件里那个节点的 id」兜底：`instanceStyleFixHint`（`update.ts:325`），只挂在 props 工具描述上

失败后果：集合改一处漏一处 → 用户拿到「写成功了但没渲染」的结果而没有任何提示。这正是 P7 / P26 的实测形态。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 固定顺序 Pipeline（`WriteCheck[]` 全部执行、无短路） | 采用 | 每条检查都必须跑且不短路：能力门控要记 `ignored`、回读要记 `readback`、告警要累积，缺任一条就漏一类诊断 |
| Chain of Responsibility | **排除** | 命中它的反面信号：「必须保证每一步都执行且顺序固定」。CoR 的价值在**可短路**与**调用方不知道谁处理**，这里两条都不成立 —— 用 CoR 只会带来「谁吞掉了检查」的排查成本 |
| Template Method | 排除 | 差异在**数据**（字段集合）而非**步骤**，套模板会产生一堆除集合外完全相同的钩子实现 |
| 保持简单（合并两个 Set 为一个常量） | 部分采用 | 合并 Set 是本记录的一部分，但不够 —— 只要门控/回读/告警仍散在三处，下一次加字段还是会漏 |

## 结论

**固定顺序 Pipeline**（不是责任链），产物统一为一份 `WriteOutcome`。

```ts
export interface WriteOutcome {
  ignored: Set<string>;                          // 能力门控 / 类型不匹配
  readback: { key: string; ok: boolean }[];      // 回读不一致但已自动压回
  warnings: string[];
}

export interface WriteCheck {
  readonly id: 'capability-gate' | 'P7-instance' | 'P26-self' | 'P31-layout';
  match(ctx: WriteCtx): boolean;                 // 命中才跑
  run(ctx: WriteCtx): void;
}
```

三条 check 取代三个 Set；`CapabilityGate` 直接消费 `dicts/capability.ts` 已有的 `CAPABILITY_OF_GATED_PROP` 反查表，不再手写 Set。P7 / P26 的风险字段集合合并一份，由它生成 MCP 侧 `description` 文案 —— **文案从集合生成，而不是集合与文案各写各的**。

## 最小落地

- 角色与职责：4 个 `WriteCheck` + `WriteOutcome` 收集器
- 接口所在层与依赖方向：`shared/src/core/props/checks.ts`；只依赖 `WriteCtx` 与 dicts
- 创建与装配位置：`core/props/checks.ts` 导出 `CHECKS` 常量数组；由 0001 的 `runWriters` 在 phase 2 之后统一驱动
- 一次调用时序：`write()` → `settle()` → **`checks.forEach(match && run)`**（顺序固定、无短路）→ 返回 `WriteOutcome`

## 成本与退出条件

- 成本：每次写入多跑 ≤4 个检查，每个先过 `match()` 谓词（纯内存）
- 退出条件：若某条 check 的 `match()` 长期恒 false（对应平台缺陷修复），删该 check 并把 `WriteOutcome` 对应字段一并删掉，不留空槽
- 禁止：不要让 `WriteCheck.run()` 修改节点 —— 回压只属于 `PropWriter.settle()`；混淆这两者是本设计最容易腐化的地方

## 验证

- 不变量测试：三份旧集合的并集与差集快照 —— P7 与 P26 的重叠 16 项必须是**显式共享子集**，而非两处巧合重复
- 边界用例：INSTANCE 子节点改 `fills`（应告警且给出主组件子节点 id）；容器 `includeSelf=true` 改 `strokeWeight`（应告警）；改 `x`（不应告警）
- 回归：`WriteOutcome.warnings` 必须能一路传到 MCP 工具结果 —— 现有 `structured()` 已支持，加断言防回归
- 指标与日志：`readback` 中 `ok:false` 的项记 debug；这是一类「用户说没生效」工单的唯一证据

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-18 | 初次决策 | 采用 固定顺序 Pipeline；明确排除责任链 |
| 2026-09-18 | 落地后复核 | 结论不变。两份风险集合已收进 `core/props/risk.ts`，MCP 工具描述文案由 `instanceStyleRiskNotice()` 从集合生成（第三份事实消失）；P31 方向回读移入 `layoutWriter.settle`，两条路径共用。能力门控（capability gate）尚未并入 `WriteCheck` 链，仍留在 `updateSelection` 循环里 |
| 2026-09-19 | 回收面复核（见 0007） | 结论不变，**补一处落地缺口**：`WriteOutcome` 当时只有修改路径回收 —— 创建路径只把能力门控记进 warnings，`readback.ok === false`（P31 方向、P33 字体）与 `outcome.warnings` 被静默丢弃，同一个平台缺陷「建的时候」不点名。现由 `core/props/outcome.ts` 统一搬运/组装、`buildNode` 与 `executeOps` 补齐回收，字段级修法文案收进 `dicts/unapplied-prop.ts`；`WriteCheck` 链仍未引入（当前只有「回读不一致」一类事实，谓词简单，按 0004 的停止条件保持简单） |
