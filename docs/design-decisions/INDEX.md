# 设计决策索引

历史只增不改。结论变了就新建记录并取代旧编号，旧记录保留原文。

读法：每条决策**先读本索引**定位受影响的既有记录（含下面的依赖关系），再打开单条。
需求变更时另查一遍 MCP 报错台账有没有 `regressed` 落在本表的「影响范围」内：
`node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs list --json`。

维护阈值（超限按 `.agents/skills/software-design-patterns/references/decision-log.md` 处理，
由 `tests/skill-doc-budget.test.ts` 守着）：本表 ≤ 15 KB 或 ≤ 40 条；单条记录「变更历史」> 10 行
时压成一行摘要 + 指向被取代的记录；下面的依赖关系图**只画现行有效**的记录。

| 编号 | 标题 | 状态 | 影响范围 | 最后更新 |
|---|---|---|---|---|
| [0001](0001-属性写入改为-PropWriter-表驱动两阶段管线.md) | 属性写入改为 PropWriter 表驱动两阶段管线 | 已采纳 | `shared/core`（update / buildNode）、`ui/code/plugin.ts`、`tools/props.ts` | 2026-09-18 |
| [0002](0002-RuntimeContext-显式注入替代模块级可变单例.md) | RuntimeContext 显式注入替代模块级可变单例 | 已采纳 | `core/registry.ts`、`server.ts`、`shared/core/capabilities.ts` | 2026-09-18 |
| [0003](0003-工具级-after-钩子加-tags-取代-batch-内嵌-DriftWatch.md) | 工具级 after 钩子加 tags 取代 batch 内嵌 DriftWatch | 已采纳 | `tools/drift-watch.ts`、`tools/batch.ts`、`tools/nodes.ts` | 2026-09-18 |
| [0004](0004-写后校验用固定顺序-Pipeline-而非责任链.md) | 写后校验用固定顺序 Pipeline 而非责任链 | 已采纳 | `shared/core/update.ts`、`tools/props.ts`、`dicts/capability.ts` | 2026-09-18 |
| [0005](0005-事实一致性用-Vitest-不变式测试加-CI-门禁，不引入事件类架构.md) | 事实一致性用 Vitest 不变式测试加 CI 门禁，不引入事件类架构 | 已采纳 | 根 `package.json`、`.github/workflows/`、全仓 | 2026-09-18 |
| [0006](0006-工具目录体积用单点投影收敛，不引入模式.md) | 工具目录体积用单点投影收敛，不引入模式 | 已采纳 | `daemon/proxy.ts`、`daemon/compact-schema.ts`、`server.ts`、`__tests__/catalog-budget.test.ts` | 2026-09-18 |
| [0007](0007-静默失效的告警出口统一到-WriteOutcome，创建路径补齐回收.md) | 静默失效的告警出口统一到 WriteOutcome，创建路径补齐回收 | 已采纳 | `shared/core`（execute / buildNode / update / export / props）、`dicts/unapplied-prop.ts`、`tools/*` 与 `server.ts` 的纪律文案 | 2026-09-19 |
| [0008](0008-归档从人维护的历史文档改为台账自管的生命周期阶段.md) | 归档从人维护的历史文档改为台账自管的生命周期阶段 | 已采纳 | `.agents/skills/mcp-tdd/`（SKILL.md、references、scripts）、`docs/mcp-errors/`、`tests/`、`AGENTS.md` | 2026-09-19 |
| [0009](0009-技能依赖单向化：通用技能不感知项目的缺陷跟踪工具.md) | 技能依赖单向化：通用技能不感知项目的缺陷跟踪工具 | 已采纳 | `.agents/skills/software-design-patterns/`、`.agents/skills/mcp-tdd/`（SKILL.md、references/bookkeeping.md）、`AGENTS.md`、`tests/skill-doc-budget.test.ts` | 2026-09-19 |

## 依赖关系

```text
0005 (Vitest + CI)  ── 全部前置：没有它，其余结论无法验收
0002 (RuntimeContext) ── 0001 的可测性地基
0003 (tags + after)  ── 独立，可与任意批次并行
0006 (目录投影)      ── 独立；原则取自 0003（不手抄清单）
0001 (PropWriter)    ── 依赖 0002
0004 (Pipeline)      ── 与 0001 同批；纠正早前评审的「责任链」说法
0007 (回读回收)      ── 把 0004 的回收面补到创建路径；覆盖面口径取自 0003
0008 (归档阶段)      ── 独立于代码层；「能被机器守的约束不靠文档纪律」取自 0005
0009 (依赖单向)      ── 独立于代码层；「同一事实不手写多份」与 0008 同源，都取自 0005
```

## 汇总

- [`../optimization-plan-2026-09-18.md`](../optimization-plan-2026-09-18.md) —— 本轮分析与落地顺序（含对既有评审的 3 处修正、2 处遗漏）
- [`../design-review-2026-09-18.md`](../design-review-2026-09-18.md) —— 上一轮评审原文，仍有效，除本索引记录里明确纠正的部分
