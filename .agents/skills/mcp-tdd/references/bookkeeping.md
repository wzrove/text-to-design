# 记账：一个台账 + 一份冻结归档

> 何时读：要决定「这条结论写哪儿」、要查旧 md 条目对应台账哪个字段，
> 或要接手历史遗留（未闭环项）时。

合并前的两套记账（`docs/mcp-errors/` 台账 与 技能目录内两份 md）已收敛为：

| 通道 | 位置 | 谁写 | 状态 |
|---|---|---|---|
| **台账（唯一真相）** | `docs/mcp-errors/` | 只由 `scripts/mcp-tdd.mjs` 写 | **活跃**；**整目录不入库**（本机数据，见仓库根 `.gitignore`） |
| **历史归档** | `archive/text-to-design-mcp-BUG记录.md`、`archive/text-to-design-mcp-已修复归档.md` | 人（合并前） | **冻结只读**，不再新增 |

台账不入库的理由与影响：

- 理由：`errors.jsonl` 是追加式事件流，随任务无限增长；`handled.json` / `cases/` / `runs/`
  只对**跑过它的那台机器**有意义。新克隆的仓库不需要它——`init`（或任何命令）自动重建
  目录与 README。
- 影响：换机器看不到历史事件与用例，**同一台机器上**去重（`handled.json`）与回归证据
  （`runs/`）照常工作。
- 因此：**要长留的结论不能只写台账**——凡是想让全队看到的（平台限制、约束、坑），
  写进 `references/` 或提交信息；台账只记「本机这一轮发生了什么」。

台账的字段、状态语义、verdict 判据见 `docs/mcp-errors/README.md`（由 CLI 生成与维护，
**不要手改 jsonl**）。本文件只讲「什么时候写哪儿」。

## 新报错：只进台账

任何 `jsd_*` 报错 → `record`（见 `SKILL.md` 的闭环第 1 步），修复后用原用例回归、
`handle` 闭环。不要再去手写 md。

## 冻结归档怎么用

- **查历史根因、避免重复踩坑**时才读：P1–P32 的根因、代码落点、是否需重载插件都在里面。
- 症状对得上就先读它，**命中就照结论走，别重新发明**；对完仍要落一次台账
  （哪怕结论是 `usage-error`），否则下次不会自动去重。
- 定位命令：

```bash
bash .agents/skills/mcp-tdd/scripts/buglog.sh          # 列归档条目 + 台账未决数
ls .agents/skills/mcp-tdd/archive/
```

`buglog.sh` 已改为**只读查看器**：给归档条目清单（含行数、疑似重复编号）与台账
`list --json` 的计数，不做任何写入。

## 字段对照（旧 md 条目 ↔ 台账）

| 旧 md 条目字段 | 台账等价物 |
|---|---|
| 现象（触发方式 + 原始报错） | `record --error "<原文>"` + `--args '<那份入参原样>'` |
| 证据 | `--source-ref "…"`，或写进 `handle --note` |
| 根因 | `handle --fix "…"` 里写明（根因在上游还是报错点） |
| 修（文件 + 改动要点） | `handle --file <path>`（可重复）+ `--fix` |
| 验证 | `handle --verified-by <回归runId>`（脚本会核对该 run 里同指纹未复发） |
| 状态（待修/待确认/平台限制） | `verdict`：`product-bug` / `usage-error` / `environment`；未闭环 = `open` |
| 编号 P<n> | 指纹（`tool + 归一化文案` 的 sha1 前 12 位），无需人工编号 |

所以**不再需要人工维护编号**：指纹就是身份，`list` 输出的「骨架」行就是归一化结果。

## 平台限制写哪儿

- **清单**：`references/platform-limits.md` 的表（判定后**必须补一行**，否则下次还要重查）。
- **台账**：按 `handle` 的 `product-bug`（代码兜住）或 `environment`（平台既定行为）闭环，
  `--fix` 里写清「代码兜 / 提示词 / 不修」三档结论。
- 只有当调用方**必须自己决策**时才写进工具描述，且工具描述 + `prompts.ts` 总纲 +
  `server.ts` 的 `INSTRUCTIONS` **三处一致**（见 `references/constraints.md` 第 8 条）。

## 历史遗留（未闭环）

- **P25-B「真漂移检出」**：reparent 批次几何漂移自动复核的**触发样本未复现**，
  开关路径已实测。再遇到漂移现象时按闭环走一次 `record`，别去改归档。

## 防膨胀

| 通道 | 判据 |
|---|---|
| 台账 | `report` 的未决数每轮应**单调下降**；某指纹反复出现却没 `handle`，说明排查被跳过 |
| 归档 | 已冻结，行数只增不减即为异常（说明有人又往 md 里写条目了） |
