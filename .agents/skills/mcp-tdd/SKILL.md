---
name: mcp-tdd
description: >
  text-to-design（即时设计 / jsDesign MCP）仓库里做设计任务、调用 jsd_* 工具时用本技能 ——
  画图、改样式、改文案、导出、编组、组件操作都算：每次 jsd_* 报错记入 docs/mcp-errors/ 台账
  （按指纹去重），再走「定位 → 修复 → 静态验证 → 引擎实测 → 原用例回归 → 闭环」。
  也覆盖改动后的验证与归属判定：改了 shared / ui / mcp-server 后确认改动真生效、跑 typecheck /
  lint / smoke-split / baseline、排查 jsd_ping 未连接或 daemon 端口占用、判定「报错与修复前一字
  不差 = 插件跑旧产物」「回显成功但画布没变 = 平台限制」。同一指纹已闭环又在回归阶段复发时，
  必须先出设计决策（转 .agents/skills/software-design-patterns）才能闭环。
  用户说「回归一下」「TDD 一下 MCP」「验证一下这个改动」「这报错怎么回事」「看 / 清理 / 归档台账」
  时也要用，即使他没提 MCP、没提技能、没提台账。
  不适用：纯问答读代码、不调 jsd_* 的纯源码重构、编译期与 lint 报错（不进台账）、与本仓无关的
  插件调试、全仓 lint 整改、以及直接用 jsd_* 操作画布的设计任务本身。
compatibility: >
  需 Node 20+（台账 CLI）与 pnpm（验证脚本在仓库根运行），且 text-to-design MCP 在线
  （插件面板显示「已连接」）。引擎侧行为无法在 CI / 无人环境验证 —— 必须由人在即时设计
  客户端重载插件后实测。报错日志默认读 /tmp/text-to-design-mcp.log。
license: MIT
metadata:
  author: wuzhuo
  version: "3.1"
---

# jsDesign MCP 报错闭环

仓库 `text-to-design`（pnpm workspace：`shared` / `mcp-server` / `ui`），50+ 个 `jsd_*` 工具。
一次闭环 = **捕获 → 定位 → 修复 → 验证 → 回归 → 收口**（归档不在此列，见「归档」一节）。

真实设计任务就是最好的测试用例。风险是报错被随手消化掉 —— 改个参数重试成功、绕道换个工具画出来，
错误就丢了，下次照样踩。所以**见错即记**（进 `docs/mcp-errors/` 台账，可 review），修完**必须用
原用例回归**。下文路径都相对本技能目录 `<repo>/.agents/skills/mcp-tdd/`。

## 铁律：先搞清代码在哪执行

```
AI 会话 ──stdio──> shim ──HTTP(47820)──> daemon ──WS(47812)──> 插件进程 ──> 即时设计引擎
                                  (mcp-server)          (ui 包，跑在客户端内)
```

- **工具逻辑真正执行在插件进程**，不在 daemon。daemon 只是转发器。
- 改 `shared/` 或 `ui/` → **必须** `pnpm build` + 在即时设计里**重载插件**。
  只重启 daemon **完全无效**：插件仍跑旧产物，报错与改前一字不差。
- 改 `mcp-server/` → 重启 daemon 即可（下次调用时 shim 自动接管）。
- 插件加载的是 `packages/ui/dist/jsdesign/manifest.json`（旧 dist 会误导排查）。

## 闭环（按序做，别跳步）

- [ ] **0 判连接 + 开 run** —— `jsd_ping` 期望 `connected:true`；不通先跑 `scripts/diagnose.sh`
      （health / 端口 / 进程 / 日志 + 分流结论）。插件离线**不要开始设计任务**：刷出来的全是
      `environment` 噪音，记了只是污染台账。通了再 `run-start --case <id> --goal "…"`
      （没有 runId，报错归属不明），记下 `jsd_ping` 的 `platform`。
- [ ] **1 任务中：见错即记** —— 判据：`isError: true`、文案含 `错误: `、或结构化字段全空却没标错。
      立刻 `record`，**不挑不攒**。**记录是旁路，任务不能停**：能改道改道，改不了记下跳过；
      **不要中途改源码**。改道成功也值得留痕 —— 把绕道的写法 `case-step` 补进用例。
- [ ] **2 本轮收尾** —— `run-end`，再无条件 `scan-log` 兜底补采服务端错误
      （超时 / 插件未连接是 WARN 级，加 `--include-warn`）。`hits: 0` 且 `list` 无未决 = 这轮干净。
- [ ] **3 定位** —— `list` 拿指纹与「骨架」文案 → 查分层路由表 `references/fix-playbook.md`；
      症状眼熟先翻 `references/gotchas.md`。默认怀疑**两层**：报错点常在下游、根因在上游。
      报错里的 `set_x` / `get_layoutGrow` 是引擎运行时内部 API，全仓搜不到是正常的。
- [ ] **4 改：一次只修一条指纹** —— 批量改完一起回归，失败时无法归因。消根因 > 打补丁；
      前置校验优于后置报错；文案点名字段 / 值 / 支持列表。动 `shared/src/core/` 或
      `ui/src/code/plugin.ts` 前必读 `references/constraints.md`。
      **先判单点还是结构**：结构型先出设计决策再改（见下节），单点 bug 直接改。
- [ ] **5 静态验证** —— `pnpm run typecheck` + `scripts/verify.sh all`。有失败就定位 → 改 → **重跑**
      到无失败；分不清「本次引入」还是「既有」就跑 `verify.sh baseline`
      （git stash 前后对比，**先 `--dry-run` 看它要干什么**，需干净工作区）。
- [ ] **6 引擎侧实测** —— 改过 `shared/` 或 `ui/` 必须重载插件后跑一次**最小 MCP 调用**。
      **只跑 build 或只看代码推理，都不算验证。**
- [ ] **7 回归：原用例重放** —— `case-show` 出的步骤按相同 `tool` + 相同 `args` 重跑，命中就
      `record --stage regress`。同指纹复发 = `regressed`，修复无效 → 回第 3 步；
      换了个新错误 = 部分修复，先记这条再决定闭环哪条。回归**用原用例**，不是「看起来修好了」。
- [ ] **8 收口** —— 回归干净才 `handle`（硬闸门见下）；然后 `report`，把 REPORT.md 路径
      与本轮闭环指纹报给用户；撞到的新平台限制补进 `references/platform-limits.md` 表。
      改了 MCP 源码按仓库约定提交（conventional commits）。**归档不在这九步里** —— 见下节。

硬闸门（都由脚本核对，不靠自觉）：

- `product-bug` 必带 `--verified-by <回归runId>`；该 run 不存在、或这个指纹在回归 run 里复发，
  **直接拒收闭环**。确无回归条件才用 `--force --note "原因"`，条目留 `forced` 标记供 review。
- 已闭环过、**且在回归阶段真复发**的指纹，必须带 `--decision <NNNN>`（见下节），否则拒收。

没有可重放用例时（首次撞上的错误常见）：`case-new` 建骨架 → `case-step` 把刚跑过的步骤补进去 →
回第 3 步。用例是长期资产，别用完就丢。

## 归档（台账瘦身，独立节奏）

事件流只追加、闭环库只增是**刻意的**（证据链完整），代价是主库无限增长。`archive` 把**已终结**
的那部分搬出主库：事件按月份分片进 `archive/events/`，闭环条目进 `archive/handled.json`；
`list --archived` 查归档内容。参数以 `node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs help` 为准，
别照抄记忆里的版本。

- **判据（三条全满足才搬）**：在 `handled.json` 里 · `handledAt` 早于阈值 · 此后无事件。
  → `regressed` 的指纹**永不归档**，它还活着。
- **归档 ≠ 注销**：去重闸门同时查归档库 —— 再出现仍 `suppressed`（多带 `archived: true`）；
  **回归阶段复发**则连同历史事件整块搬回主库并置 `regressed`。所以**别手删台账文件**：
  手删才是真把闸门拆了。
- **节奏**：不追求每轮必跑。`list --all` 要翻页、或 `report` 里已闭环行压过未决行时跑一次。

## 闸门：什么时候转 software-design-patterns

报错闭环回答「这条修没修掉」，设计决策回答「为什么这么修、什么时候该回退」。
单点 bug 不需要决策记录；**结构压力伪装成 bug** 时按单点改只会复发。判据：

| 命任一条 → 先出设计决策 | 命中 → 直接改 |
| --- | --- |
| 已闭环过又在回归阶段复发（CLI **拒收**，强制要求） | 参数校验、文案点名、normalize 兜底 |
| 修法要新增分支 / 抽象，或跨 ≥3 个文件 | 单文件、少量行的改动 |
| 落在 `INDEX.md` 某条记录的「影响范围」内 | 与既有决策无交集 |

走法一句话：`.agents/skills/software-design-patterns/` 出结论并落 `docs/design-decisions/NNNN-*.md`
→ 按记录的「最小落地」改代码（走闭环第 5–7 步）→ `handle … --decision NNNN` 挂回台账。

**方向单向**：那个技能是**独立可移植**的通用技能 —— 不引用台账，也不知道本仓用什么跟踪缺陷。
「什么时候转过去、编号怎么用、证据怎么回填、退出条件怎么回退」这套交接口径由**本技能单方面持有**，
完整契约见 `references/bookkeeping.md` 的「转投设计决策」。确无结构问题（如两次互不相关的偶发）
才用 `--force --note "原因"` 豁免。

## 归属判定（每次 handle 都要做）

`handle --verdict` 三选一：**`product-bug`**（默认）合法入参报错 / 文案含糊 / 本该支持的组合不支持
→ 改代码 → 回归 → 闭环；**`usage-error`** 参数类型或枚举写错、前置条件没满足、用了已删除的旧工具名
→ 修正用例步骤 → 闭环（`--note` 写明错在哪）；**`environment`** 插件离线、端口 47812 / 47820 被占、
daemon 未起 → **不改代码**，闭环一次并转告用户手动处理（别重试刷屏）。

**拿不准按 `product-bug`**：宁可多查一轮，别把真 bug 判成用法问题。完整判据表见 `references/bookkeeping.md`。

`record` 返回值决定下一步：`recorded` / `duplicate` / `suppressed` 继续任务（`suppressed` = 该指纹
已闭环过，符合预期 —— 别换措辞重记、别绕开 CLI 写 jsonl）；`regressed` **停下**：已闭环的又复发了。

## 平台限制：三档处理

撞到平台限制 / 语义陷阱（引擎校验、静默失效、语义反直觉、字段存在但不生效）时，口径是固定三档：
**① 优先在代码里兜住**（消不掉就检测并进 `warnings` 点名，绝不留「回显成功实则没生效」）→
**② 代码兜不住才落提示词**（仅限必须由调用方决策的，且工具描述 + `prompts.ts` 总纲 +
`server.ts` 的 `INSTRUCTIONS` 三处一起改）→ **③ 一律记账**（台账 `handle` + 补一行清单）。

> 口诀：**能代码化的别写提示词，能自动化的别让人记。**

**先翻清单**：`references/platform-limits.md` 有已知现象表与逐条口径 —— 命中就照走，别重新发明；
判定后必须补一行进该表，否则下次还要重查。

## 反模式

- 只看代码推理就宣称「修好了」；报错一字不差却改参数、换工具（先怀疑未重载插件）。
- 任务中途停下来改源码；批量改完一起回归（失败时无法归因，`--fix` 也只能写句含糊话）。
- 顺手修既有失败项、顺手扩大重构范围；跑全仓 `pnpm run lint`（只 lint 改动文件）。
- 绕过 CLI 手改 `errors.jsonl` / `handled.json` / `archive/**`：归档也走 `archive` 命令 ——
  手删文件等于把「已闭环指纹不再记录」的闸门拆掉，同一个 bug 会被反复当新错误记账。
- 拿 `--force` 当快捷键；反过来给每个单点 bug 都开一张决策记录。
- 给现象起 `P编号`：那套编号已经废止（连同字典一起删了），源码注释与文案里不再引用，也别新建。

## 参考文件（按需加载，别一次性全读）

CLI 参数以 `node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs help` 为准，本文不抄一遍 ——
参数变了只改一处。

| 何时读 | 文件 |
| --- | --- |
| 症状眼熟，怀疑「看着像 A 其实是 B」 | `references/gotchas.md` |
| 骨架文案 → 文件的完整路由表 + 修法标准 | `references/fix-playbook.md` |
| **动 `shared/src/core/`、`ui/src/code/plugin.ts`，或要加字段之前**（字段集单一真相 / 提示词与代码同源 / schema 复用 / 零轴两侧不同 / 协议窄化 / mock host 三坑） | `references/constraints.md` |
| 「改动是否真生效」判不准，或 `diagnose.sh` 没定位到 | `references/troubleshooting.md` |
| 怀疑平台限制，要决定「代码兜 / 提示词 / 记账」 | `references/platform-limits.md` |
| 查某文件属哪一层、改完要做什么 | `references/architecture.md` |
| 报错走哪条采集通道，或要加日志埋点 | `references/error-channels.md` |
| 指纹归并过粗 / 过细，看到不该 `suppressed` 的项 | `references/fingerprint.md` |
| 完整命令序列、真实样例、边界情形（掉线 / 改需求 / 误判闭环） | `references/workflow.md` |
| 记账写哪儿、归属判定完整判据、台账字段对照、归档机制、**转投设计决策的交接契约** | `references/bookkeeping.md` |
| 手写用例模板 / 维护本技能（校准触发率） | `assets/case.template.json` · `assets/trigger-queries.json` |

只读脚本：`scripts/diagnose.sh`（连接层，闭环第 0 步）、`scripts/verify.sh`（分层静态验证，第 5 步）。

**现象不用编号。** 曾经有一套编号字典（`references/timeline.md`，按发现顺序给每个已知现象起号），
已于 2026-09-19 连同源码注释、报错文案、changeset 里的全部引用一起删除 —— 编号不表达「什么时候该
回退」，还逼着人维护两份真相。现在各有各的身份：报错认**指纹**（`list` 的「骨架」行），
平台限制认 `references/platform-limits.md` 的**现象描述**，修复理由认 `docs/design-decisions/`
的决策记录。三处都不需要人工编号，`tests/skill-doc-budget.test.ts` 会拦住编号回潮。

> 宿主若只从 `<repo>/.workbuddy/skills/` 发现 skill，软链过去：
> `mkdir -p .workbuddy/skills && ln -s ../../.agents/skills/mcp-tdd .workbuddy/skills/mcp-tdd`
