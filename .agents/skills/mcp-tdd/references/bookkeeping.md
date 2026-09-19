# 记账：台账是唯一通道

> 何时读：要决定「这条结论写哪儿」、要查归属判定（verdict）的完整判据、
> 要归档台账，或要接手历史遗留（未闭环项）时。

| 通道 | 位置 | 谁写 | 状态 |
|---|---|---|---|
| **台账（唯一真相）** | `docs/mcp-errors/` | 只由 `scripts/mcp-tdd.mjs` 写 | **活跃**；**整目录不入库**（本机数据，见仓库根 `.gitignore`） |
| **平台限制清单** | `references/platform-limits.md` | 判定一条补一行 | 活跃；回答「这现象怎么处理」 |
| **设计决策** | `docs/design-decisions/` | 走 `.agents/skills/software-design-patterns`（**独立技能**，见下节「转投设计决策」） | 活跃；回答「为什么这么修、什么时候回退」 |

分工一句话：**台账**记「这条报错死没死」，**平台限制清单**记「这现象照哪个口径处理」，
**决策**记「为什么这么修」。三处都不需要人工编号 —— 见下。

## 现象不用编号

历史上有一套编号（`references/timeline.md`，按发现顺序给每个已知现象起号，`P` + 数字），
用来在注释里互相引用。2026-09-19 连同源码注释、报错文案、changeset 里的全部引用一起删除了，
原因是它同时坏在三处：

- **编号不表达任何东西**。一个号码说不出「这条什么时候该回退」，而决策记录要的正是这个。
- **它逼人维护两份真相**。同一现象要在编号字典、`platform-limits.md`、决策记录里各写一遍，
  必然漂移（那本字典里就长期躺着「已过时 / 未复现 / 已被取代」三种状态）。
- **它经不起改名**。字典编号与代码里的编号还差一位，读代码的人先要搞清自己在哪套编号里。

现在各有各的身份：

| 要回答的问题 | 看哪里 |
|---|---|
| 「这条报错是什么？修没修掉？」 | 台账：`list` 的**骨架**行 + **指纹**（`tool + 归一化文案` 的 sha1 前 12 位） |
| 「这现象怎么处理？代码兜还是落提示词？」 | `references/platform-limits.md` 的现象描述与处理口径 |
| 「为什么当初这么修？什么时候该回退？」 | `docs/design-decisions/NNNN-*.md` |

**别再起 `P编号`**，也别在注释里互相引用 —— 要引用就写文件名 + 函数名，或者决策记录编号 `NNNN`。
`tests/skill-doc-budget.test.ts` 会拦住回潮。

## 新报错：只进台账

任何 `jsd_*` 报错 → `record`（见 `SKILL.md` 的闭环第 1 步），修复后用原用例回归、`handle` 闭环。
不要手写 md 记录。

## 台账的三个区

| 区 | 内容 | 谁动它 |
|---|---|---|
| **主库** | `errors.jsonl`（事件流）+ `handled.json`（闭环库）+ `runs/` + `cases/` | `record` / `scan-log` / `handle` / `unhandle` |
| **归档** | `archive/handled.json` + `archive/events/<YYYY-MM>.jsonl` + `archive/INDEX.json` | 只由 `archive` 命令 |
| **派生物** | `REPORT.md`（`report` 生成）、`.log-cursor.json`（采集位点） | 会被覆盖，别当真相 |

**归档**解决的问题：事件流只追加是刻意的（证据链完整），但主库会无限增长。`archive` 把
已终结的部分搬走 ——

```bash
S=.agents/skills/mcp-tdd/scripts/mcp-tdd.mjs
node $S archive --dry-run          # 先看要搬什么，不写盘
node $S archive --older-than 30d   # 默认 30d
node $S list --archived            # 查归档内容
```

判据是三条同时满足：在 `handled.json` 里 · `handledAt` 早于阈值 · 此后无任何事件。
→ **`regressed` 的指纹永不归档**。

**归档 ≠ 注销**，这是它必须走 CLI 而不能手删文件的原因：去重闸门同时查归档库 ——

- 归档过的指纹再出现（`--stage record`）仍然 `suppressed`，只是多带 `archived: true`；
- **在回归阶段复发**（`--stage regress`）则连同历史事件**整块**搬回主库并置 `regressed`，
  与从未归档过的指纹行为完全一致。归档是搬运，不是把这笔账注销。

## 归属判定（verdict）

`handle` 时必须给一个判定，决定这条错误「算谁的问题」：

| verdict | 判据 | 闭环方式 |
|---|---|---|
| `product-bug`（默认） | 合法入参报错、文案含糊、本该支持的组合不支持 | 改代码 → 回归 → `handle` |
| `usage-error` | 参数类型 / 枚举写错、前置条件没满足、用了已删除的旧工具名 | 修正用例步骤 → `handle`，`--note` 写明错在哪 |
| `environment` | 插件离线、端口 47812 / 47820 被占、daemon 未起 | **不改代码**，闭环一次并转告用户手动处理 |

拿不准按 `product-bug`：宁可多查一轮，别把真 bug 判成用法问题。

只有 `product-bug` 需要回归证据：`handle` 拿 `--verified-by <runId>` 去 `runs/<runId>.json` 与
事件流核对，run 不存在或该指纹在回归 run 里复发就**直接拒收**；回归 run 里夹带别的报错则告警放行。
无法回归时用 `--force --note "原因"`，条目带 `forced: true` 供日后 review。

## 字段对照（旧手写 md 条目 ↔ 台账）

合并前手写 md 记录的那些字段，现在落在哪：

| 旧 md 条目字段 | 台账等价物 |
|---|---|
| 现象（触发方式 + 原始报错） | `record --error "<原文>"` + `--args '<那份入参原样>'` |
| 证据 | `--source-ref "…"`，或写进 `handle --note` |
| 根因 | `handle --fix "…"` 里写明（根因在上游还是报错点） |
| 修（文件 + 改动要点） | `handle --file <path>`（可重复）+ `--fix` |
| 验证 | `handle --verified-by <回归runId>`（脚本会核对该 run 里同指纹未复发） |
| 状态（待修/待确认/平台限制） | `verdict`：`product-bug` / `usage-error` / `environment`；未闭环 = `open` |
| 决策关联（旧 md 无此字段） | `--decision <NNNN>` ↔ `docs/design-decisions/NNNN-*.md` |
| 编号 `P<n>` | **已废止**：身份改用指纹，`list` 输出的「骨架」行就是归一化结果 |

所以**不再需要人工维护任何编号**。要长期留存的结论写进台账（闭环时 `--fix` / `--file`）、
平台限制清单、或决策记录 —— 三处都是可检索的，且各有明确的责任边界。

## 平台限制写哪儿

- **清单**：`references/platform-limits.md` 的表（判定后**必须补一行**，否则下次还要重查）。
- **台账**：按 `handle` 的 `product-bug`（代码兜住）或 `environment`（平台既定行为）闭环，
  `--fix` 里写清「代码兜 / 提示词 / 不修」三档结论。
- 只有当调用方**必须自己决策**时才写进工具描述，且工具描述 + `prompts.ts` 总纲 +
  `server.ts` 的 `INSTRUCTIONS` **三处一致**（见 `references/constraints.md` 第 8 条）。

## 转投设计决策（`software-design-patterns`）

报错闭环回答「这条修没修掉」，设计决策回答「为什么这么修、什么时候该回退」——
一个指纹「修一次又复发」时，只答前者的修法必然是单点补丁。所以结构型问题要转一道。

**方向单向**：`software-design-patterns` 是**独立可移植**的通用技能，不引用台账、也不知道
本仓用什么跟踪缺陷。什么时候转过去、编号怎么用、结论怎么接回来 —— 这套交接口径由**本技能
单方面持有**，就是下面这几条。

### 什么时候转

| 命任一条 → 先出设计决策 | 命中 → 直接改 |
|---|---|
| 已闭环过又在回归阶段复发（`handle` **拒收**，强制要求） | 参数校验、文案点名、normalize 兜底 |
| 修法要新增分支 / 抽象，或跨 ≥3 个文件 | 单文件、少量行的改动 |
| 落在 `docs/design-decisions/INDEX.md` 某条记录的「影响范围」内 | 与既有决策无交集 |

### 怎么走

```bash
S=.agents/skills/mcp-tdd/scripts/mcp-tdd.mjs
D=.agents/skills/software-design-patterns

# ① 出结论：读 $D/SKILL.md，按它的「压力 → 候选 → 排除」走；它判定「保持简单」就别硬套模式
python3 $D/scripts/new_decision.py "<标题>"     # → docs/design-decisions/NNNN-*.md + 更新 INDEX.md
# ② 改代码：按记录的「最小落地」，走闭环第 5–7 步（typecheck / 引擎实测 / 原用例重放）
# ③ 接回来：挂到指纹上
node $S handle --fingerprint <fp> --decision NNNN --verified-by <回归runId> --fix "…"
node $S list --decision NNNN                    # 反查：这条决策关联的报错死没死
```

### 交接契约（四个点）

| 点 | 约定 |
|---|---|
| 编号 | `NNNN` 四位、**永不复用**；结论变了就新建记录并 `--supersedes <原编号>`，旧记录保留原文 |
| 证据 | 记录的「验证」段填**本台账的真东西**：用例 id + 指纹 + 回归 runId，不写原则复述 |
| 回退 | 记录的「退出条件」命中 → 按同一条链回退，验收仍是 `typecheck → 引擎实测 → 原用例重放`，不是「看起来简化了」 |
| 核对 | `handle` 会找 `--decision NNNN` 对应的记录文件（依次查 `docs/design-decisions` / `docs/adr` / `docs/decisions` / `ADR`），找不到只**告警不阻断** |

**别给单点 bug 开决策记录**：`INDEX.md` 是设计决策工作流第 1 步的必读文件，被琐碎条目灌满就成
噪音源，整条链路失效。反过来，本技能的复发闸门会**拒绝**缺少决策的二次闭环 —— 两边一起兜住。

## 历史遗留（兜住但未复现）

两条现象**代码侧已按「写后校验」兜住，但真实触发条件始终没复现**，因此没有闭环指纹：

- **同层几何漂移的「真漂移检出」**：`reparent` 批次结束后自动复核同层漂移的开关路径已实测，
  但**正向触发样本没构造出来** —— 复核逻辑本身没在真机上报警过一次。
- **`layoutMode` 被引擎回写**：真实触发条件 5 组复现 + 8 步忠实复刻均未复现，
  已改为「写 → 回读 → 不一致再压一次」并进 `warnings`。

两条的现行口径在 `references/platform-limits.md`。再遇到时**按闭环走一次 `record`**（会得到新指纹），
不要去补什么编号 —— 编号已经不存在了。

## 防膨胀

| 通道 | 判据 |
|---|---|
| 台账主库 | `report` 的未决数每轮应**单调下降**；某指纹反复出现却没 `handle`，说明排查被跳过 |
| 台账体积 | `list --all` 要翻页、或 `report` 里已闭环行压过未决行 → 跑一次 `archive` |
| 平台限制清单 | 超 20 KB 时把「代码已兜住且长期未复发」的行滚进 `platform-limits-history.md`，别删行、别调阈值 |
| 技能文档 | 体积上限由 `tests/skill-doc-budget.test.ts` 守着，超限把内容移进 `references/`，别调高阈值 |
