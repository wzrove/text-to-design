# text-to-design 结构分析与优化方案

日期：2026-09-18 · 范围：`packages/{shared,mcp-server,ui}`（约 17.6k 行 TS/TSX）
前置文档：[`docs/design-review-2026-09-18.md`](design-review-2026-09-18.md)
决策记录：[`docs/design-decisions/INDEX.md`](design-decisions/INDEX.md)

本文对既有评审做了**逐条代码复核**，标注了 3 处需要修正的说法、2 处被遗漏的压力，并把结论落成决策记录 0001–0005。

> **状态（2026-09-18 更新）**：0001–0005 已全部落地并采纳。`pnpm typecheck` 绿、
> `pnpm test` 41 条绿、`pnpm lint` 无错误。各记录末尾的「变更历史」记了落地时按实情
> 做的调整（如 0002 范围收窄、0003 钩子改为 before/after 一对、0004 能力门控尚未并入）。

---

## 0. 复核结论：既有评审哪些是对的

| 评审主张 | 代码证据 | 结论 |
|---|---|---|
| `update.ts` / `buildNode.ts` 两份约 200 行属性赋值 | `update.ts:22-231`、`buildNode.ts:121-333` | ✅ 属实 |
| P18 / P31 是同一处缺陷要改两遍 | P18 在 `buildNode.ts` 改 3 处；P31 同时改 `update.ts:430` + `buildNode.ts:309` | ✅ 属实 |
| 「样式类字段」概念有 3 份事实 | `INSTANCE_RISKY_PROPS`（27 项）、`CONTAINER_SELF_VISIBLE_PROPS`（20 项，前 16 项重复）、`props.ts:25` 文案 | ✅ 属实 |
| `isDriftRisky` 手抄工具名 | `drift-watch.ts:26-46`：6 工具名 + 6 op 名 | ✅ 属实 |
| 平台抽象已是 Port/Adapter + 编译期契约断言 | `figma/host.ts` / `jsdesign/host.ts` 各 8 行 + `sync-guarantee.ts` | ✅ 别动 |
| `bridgeTool` 是良性 Template Method 管道 | `core/registry.ts`，`method`/`payload`/`run` 三选一 | ✅ 别动 |

**不要引入**：CQRS / Event Sourcing / Saga / Outbox —— 读写同源走同一条 WS 请求-响应通道，日志与状态推送是 UI 装饰不是事实存储。见 0005。

---

## 1. 修正 1：最大的问题不是 IF 多，是「无法验证」

既有评审假定存在单元测试。实际：

| 检查项 | 结果 |
|---|---|
| vitest / jest / node:test | **三个包都没有** |
| `smoke-split.ts`（652 行，唯一自动化测试） | **未接入任何 npm script**，只能手工 `tsx` 运行 |
| `mcp-server` 的 `check:schema` script | 指向 `scripts/check-schema-draft07.mjs` —— **该文件不存在**，`scripts/` 下只有 `gen-aliases.ts`。死脚本 |
| CI | `.github/workflows/` 只有 `release.yml`；typecheck 只在 lefthook `pre-commit`，而 CI 里 `LEFTHOOK: "0"` |

这直接改变优先级：评审的第 1 优先级（抽 `PropWriter`）在零测试下无法验收 ——「加属性从 5 处降到 1 处」这条收益，**没有任何东西能证明它成立**。且 `smoke-split.ts:37` 用 `bridge.request = async ...` 猴子补丁生产对象，迁移为单测时必须配合 0002 改成构造注入。

→ **决策 0005**：先落 Vitest + 4 条不变式 + CI 门禁，是 0001–0004 的共同前置。

## 2. 修正 2：超时常量已在 shared，缺的只有断言

评审第 4.3 条建议「把三层超时提到 shared」。实际已经在那了：

```
shared/src/connection.ts:64  UI_FORWARD_TIMEOUT_MS = 25_000
shared/src/connection.ts:65  PLUGIN_TIMEOUT_MS     = 30_000
mcp-server/src/config.ts:42  BATCH_TIMEOUT_MS      = 120_000
```

单源已经有了，只是 `UI < PLUGIN < BATCH` 这个顺序**目前仅靠注释保证**（`pending.ts:28`）。要做的不是搬，是加一条断言测试。

## 3. 修正 3：写后校验不是 Interceptor Chain，是固定顺序 Pipeline

评审把三个补偿合并称作「Interceptor Chain（责任链）」。对照责任链的反面信号 ——「**必须保证每一步都执行且顺序固定**时，pipeline/template 更明确」—— 这里恰好命中：能力门控、回读、告警三条**都不短路且必须全跑**，缺任一就漏一类诊断。用责任链只会引入「谁吞掉了检查」的排查成本。

→ **决策 0004**：固定顺序 Pipeline + 统一 `WriteOutcome`。

## 4. 遗漏 1：11 项 PropMethod 名单有 4 份手抄（评审只数了 3 处）

| # | 位置 | 形态 |
|---|---|---|
| 1 | `schemas/split-ops.ts:323` | `PropMethod` 联合类型 |
| 2 | `shared/src/index.ts:74-86` | `PropParamsByMethod` 的 11 个 key |
| 3 | `shared/src/index.ts:133-166` | `PluginRequest` 联合的 11 个成员 |
| 4 | `ui/src/code/plugin.ts:164-175` | switch 的 11 个 `case` |

`RequestParams<M>` 的条件分支最后落在 `ListFontsParams` 兜底，**未知 method 不会报错**，所以这份漂移是静默的。已有一条「从数据源派生」的好例子在旁边：`PROP_METHOD_FIELDS` 由 `Object.keys(setXxxProps)` 派生。照抄这个 idiom 即可。

## 5. 遗漏 2：二进制编码是一对互逆码，分居两包且无 roundtrip 保护

`mcp-server/src/pending.ts` 的帧合并逻辑 与 `ui/src/bridge/binary.ts` 的 `stripBytes` / `extractBytes` 互逆，但两侧无人验证一致。失效形态是「导出图是空的」—— 极难定位。归入 0005 的第 4 条必写不变式。

---

## 6. 优化方案（按落地顺序）

| # | 事项 | 决策 | 收益 | 成本 | 验收 |
|---|---|---|---|---|---|
| 0 | Vitest + 4 条不变式 + CI门禁；修/删死脚本 `check:schema` | [0005](design-decisions/0005-事实一致性用-Vitest-不变式测试加-CI-门禁，不引入事件类架构.md) | 让其余 4 项可验收 | 小 | 故意改坏一个源，测试必须红 |
| 1 | `RuntimeContext` 显式注入，替 3 处模块级可变单例 | [0002](design-decisions/0002-RuntimeContext-显式注入替代模块级可变单例.md) | 可并行构造不同平台实例；0001/0003 的地基 | 小，3 文件 | 两个 ctx 实例互不影响 |
| 2 | 工具 `tags` + `after` 钩子，DriftWatch 降级为钩子 | [0003](design-decisions/0003-工具级-after-钩子加-tags-取代-batch-内嵌-DriftWatch.md) | 补上**单工具调用**的漂移复核；删掉工具名手抄 | 小 | 直接调 `jsd_delete_node` 也告警 |
| 3 | `PropWriter` 表 + `runWriters` 两阶段（先 text / layout） | [0001](design-decisions/0001-属性写入改为-PropWriter-表驱动两阶段管线.md) | 加属性从 5 处降到 1–2 处 | 中，`shared/core` | CREATE/UPDATE 行为差异显式声明 |
| 4 | `WriteOutcome` + 固定顺序 Pipeline 合并 P7/P26/P31/P-gating | [0004](design-decisions/0004-写后校验用固定顺序-Pipeline-而非责任链.md) | 缺陷事实 3 份 → 1 份，文案可生成 | 中，与 3 同批 | P7 与 P26 重叠的 16 项是显式共享子集 |
| 5 | 顺手清理：`sync-guarantee.ts` 两个文件的 4 个类型工具提到 `shared`；`useBridge.tsx:107` 的派生状态移进 `ConnectionManager` | — | 消隐性耦合 | 极小 | typecheck + lint 绿 |

**依赖**：0 是全部前置；1 需在 3 之前；2 与其余独立可并行。

**每批合入门禁**：`pnpm typecheck` 绿 + `pnpm test` 绿。第 3、4 批额外要求「同一 property key 在 CREATE / UPDATE 下的行为差异」有断言覆盖，**不允许退化为隐式的执行顺序依赖**。

---

## 7. 明确不要动（含推翻条件）

| 现状 | 保留理由 | 何时推翻 |
|---|---|---|
| `bridgeTool` 的 `method`/`payload`/`run` 三选一 | 三种形状互斥且稳定，加接口只是同义反复 | 出现第 4 种稳定执行形状（如 streaming） |
| batch 回显裁剪两档 + 常量预算 | 只有两档、全是常量 | 出现 `if (tool === 'xxx')` 的第三档 |
| `Bridge` / `BridgeSocket` Facade | 职责清晰 | 别再往里塞能力（已塞了离线日志环 + 平台状态） |
| 单例 Transport（新连接顶替旧连接） | 注释论证充分：一个 daemon 只服务一个面板 | 真的要多面板并行 |
| `NodeSkeleton` 鸭子类型收窄 | 换 Visitor 的成本远大于收益 | 无 |
