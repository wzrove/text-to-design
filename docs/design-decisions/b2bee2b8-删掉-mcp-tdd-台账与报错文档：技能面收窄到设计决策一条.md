# b2bee2b8. 删掉 mcp-tdd 台账与报错文档：技能面收窄到设计决策一条

- **日期：** 2026-10-15
- **状态：** 已采纳
- **影响范围：** `.agents/skills/mcp-tdd/`（删除）、`docs/mcp-errors/`（删除）、`docs/{i18n-plan-2026-09-21,design-review-2026-09-18,optimization-plan-2026-09-18}.md`（同批删除）、`AGENTS.md`（39 行改动）、`software-design-patterns/references/decision-log.md`（3 行改动）、`tests/skill-doc-budget.test.ts`
- **相关记录：** 取代 0008（台账生命周期阶段 —— 主题被整体移除，不是命中它的退出条件）；0009（技能依赖单向化）**正命中**自己的退出条件「不再用台账闭环」，故标「已废弃」；知识分流口径沿 0022（类型系统事实收进声明表）、0029（能力规格表）、0032（平台事实三域声明表）、0007（静默失效统一到 `WriteOutcome`）；引用门禁沿 cec4a120

> ⚠ **补登**：事实发生在 `9039a4a`（2026-09-27），当时未落记录。本记录 2026-10-15 按仓库现状回填理由与回退方案 —— 不是事后补理由，是补上当时就该有的那张纸（`decision-log.md`：禁止只改结论不写理由）。

## 压力

- **技能面背了项目专属的追踪设施。** `mcp-tdd` 是「报错指纹 + 回归 runId + 台账 CLI」三件套（共 17 个文件：`scripts/mcp-tdd.mjs` 1616 行、11 个 references、3 个 shell 脚本、2 个 assets），服务的是本仓的缺陷闭环；而 0009 刚把通用技能的可移植性定为纪律 —— 两个方向互相抵消。
- **证据长了两份，且台账那份先腐化。** 真机结论的载体一直是决策记录的「验证」段（0011 的 run 证据、0017/0018/0019/0021/0022 的联调表都写在那儿），台账只多存一份 run id。而它自己的体积治理先崩：`references/platform-limits.md` 出现 3 组重复行、19.1 / 20 KB 触顶（0022 已把它记成压力）。
- **真相源会撒谎。** A 类事实（typings 看得出来）在 0022/0029/0032 已有机器守的落点，B 类（运行时行为）已有 `WriteOutcome` 的 warnings（0007）；台账那份只能靠人同步，同步不上时它指的还是旧结论。
- 失败后果：删掉之后若指针不改，8 份以上记录会把读者指到不存在的文件（本次已就地标注）。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 整体删除 `mcp-tdd` 与 `docs/mcp-errors/`，知识按 A/B 类分流 | 采用 | — |
| 只删 `platform-limits.md`，保留指纹台账与 `buglog.sh` | 排除 | 留下的正是「项目专属追踪设施」那一半，与 0009 的可移植性冲突不减；而指纹库的价值在跨轮聚合，本仓没有出现这个需求 |
| 保留技能、砍到「指纹 + 现象描述」一页 | 排除 | 砍完仍是一份要人同步的第二真相源；A 类已有 `sync-guarantee.ts` 编译期断言，B 类已有 `WriteOutcome` warnings，留一页只增加漂移面 |
| 把台账 CLI 降级迁进 `scripts/` | 排除 | 依赖它的 5 处文档/脚本要同批改；而「跨轮失败聚合」这个真需求没有出现 —— 证据形态始终是决策记录 + 回读 |

## 结论

**整体删除**，技能面只剩 `software-design-patterns` 一条。知识按 A/B 类分流：

| 类 | 判据 | 现落点 | 谁守 |
|---|---|---|---|
| A 类型系统事实 | typings 里看得出来 | `packages/shared/src/dicts/platform-value-domain.ts` | 三侧 `sync-guarantee.ts` 编译期断言（0022） |
| 域事实（变量 / 组件 / 变体三域） | 三平台不同且可枚举 | `packages/shared/src/dicts/platform-knowledge.ts` | `tests/platform-knowledge.test.ts` + 两侧成对断言（0032） |
| B 运行时引擎行为 | typings 看不出来 | `WriteOutcome` 的 `warnings` + 工具描述 / 配方 | 回读证据 + 真机复验（0007） |

「证据可追溯」由决策记录 + `dec` 引用门禁（cec4a120，`scripts/decision-refs.mjs`）承接：标识不悬空、记录都进索引，都由机器判。

## 实施方案

- **目标形状（全量）**：
  - 删除 `.agents/skills/mcp-tdd/**`（SKILL.md、11 个 references、3 个 scripts、2 个 assets，共 17 个文件）与 `docs/mcp-errors/**`；同批删 `docs/i18n-plan-2026-09-21.md`、`docs/design-review-2026-09-18.md`、`docs/optimization-plan-2026-09-18.md`。
  - `AGENTS.md`：去掉台账闭环与技能加载段，保留「决策记录引用」与验证命令。
  - `software-design-patterns/references/decision-log.md`：去掉指向台账的回填约定，只留记录格式与索引体积口径。
  - `tests/skill-doc-budget.test.ts`：`SKILL_DIRS` 收成一条；断言只剩 SKILL.md 体积、`INDEX.md` 体积 / 行数 / 行宽、依赖图行宽、references 孤儿检查。
- **本次不做**：不新做跨轮失败聚合工具；不把历史台账数据迁进决策记录 —— 原始叙述留在 git 里，按「历史只增不改」保留。

## 成本与退出条件

- 成本：失去跨轮次的失败指纹聚合 —— 同一现象重复出现时没有自动「复发」告警，只能靠人读决策记录；`docs/mcp-errors/` 的历史事件流不再有在线入口（`git show 9039a4a^:docs/mcp-errors/...` 可取）。
- 退出条件：若日后真需要跨轮失败聚合（同一现象在几轮无关联的工作里各踩一次、没人记账），从 `9039a4a^` 取回 `.agents/skills/mcp-tdd/` 即可，或另做轻量 issue 台账 —— 那属新功能，另开记录，不在本记录上加补丁。

## 验证

- 引用面：`node scripts/decision-refs.mjs check` → `problems: []`、`unresolved: 0`、`missingFromIndex: []`、裸标识 420 < 棘轮基线 435。
- 死指针：`grep -rn "mcp-tdd\|mcp-errors\|platform-limits" packages/ tests/` = **0 命中**（本次把 `ui/src/code/mastergo/node-facade.ts`、`shared/src/__tests__/list-fonts.test.ts` 两处注释改指现行文件）；`docs/` 侧保留历史叙述的记录就地标注「已随 9039a4a 删除」。
- 类型面：`pnpm run typecheck`（三包 + figma / mastergo 两套 typings 断言）全绿。
- 文档预算：`INDEX.md` 12.3 KB < 15 KB；`tests/skill-doc-budget.test.ts` 断言需用户 `pnpm run test` 复跑。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-15 | 补登（事实发生在 9039a4a，2026-09-27） | 采用「整体删除 + 知识按 A/B 类分流」；排除「只删 platform-limits」「砍到一页」「CLI 降级进 scripts/」。同时把 0008 标「已被取代」（主题被移除，非命中其退出条件）、0009 标「已废弃」（正命中其退出条件「不再用台账闭环」） |
