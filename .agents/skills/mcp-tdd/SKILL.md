---
name: mcp-tdd
description: >
  text-to-design（即时设计 / jsDesign MCP）仓库里做设计任务、调用 jsd_* 工具时用本技能 ——
  画图、改样式、改文案、导出、编组、组件操作都算：每次 jsd_* 报错记入 docs/mcp-errors/
  台账（按指纹去重），再走「定位 → 修复 → 静态验证 → 引擎实测 → 原用例回归 → 闭环」。
  同时覆盖改动后的验证与归属判定：改了 shared / ui / mcp-server 后确认改动真生效、
  跑 typecheck / lint / smoke-split / baseline 比对、排查 jsd_ping 未连接或 daemon 端口占用、
  判定「报错与修复前一字不差 = 插件跑旧产物」「回显成功但画布没变 = 平台限制」。
  用户说「回归一下」「TDD 一下 MCP」「验证一下这个改动」「这报错怎么回事」「看 / 清理报错台账」
  时也要用，即使他没提 MCP、没提技能、没提台账。
  不适用：纯问答与读代码、不调用 jsd_* 的纯源码重构、编译期或 lint 报错（不进台账）、
  与本仓库无关的插件调试、全仓 lint 整改、以及直接用 jsd_* 操作画布的设计任务本身。
compatibility: >
  需 Node 20+（台账 CLI）与 pnpm（验证脚本在仓库根运行），且 text-to-design MCP 在线
  （插件面板显示「已连接」）。引擎侧行为（插件真实执行）必须由人在即时设计客户端
  「插件 → 开发 → 重新运行」后实测，无法在 CI 或无人环境下完成。
  报错日志默认读 /tmp/text-to-design-mcp.log。
license: MIT
metadata:
  author: wuzhuo
  version: "3.0"
---

# jsDesign MCP 报错闭环

仓库 `text-to-design`（pnpm workspace：`shared` / `mcp-server` / `ui`），50+ 个 `jsd_*` 工具。
一次闭环 = **捕获 → 定位 → 修复 → 验证 → 回归 → 归档**。

真实设计任务就是最好的测试用例。风险是报错被随手消化掉——改个参数重试成功、绕道换个工具画出来，
错误信息就丢了，下次照样踩。所以**见错即记**（记进 `docs/mcp-errors/` 台账，随仓库提交、
可 review），修完**必须用原用例回归**。

本技能目录 `<repo>/.agents/skills/mcp-tdd/`，下文路径都相对它。

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

- [ ] **0 判连接 + 开 run** —— `jsd_ping` 期望 `connected:true`。不通先跑
      `bash .agents/skills/mcp-tdd/scripts/diagnose.sh`（health / 端口 / 进程 / 日志一次跑完并给分流结论）。
      插件离线**不要开始设计任务**：刷出来的全是 `environment` 噪音，记了只是污染台账。
      通了再 `run-start --case <id> --goal "…"`（没有 runId，报错归属不明）；记下 `jsd_ping` 的 `platform`。
- [ ] **1 任务中：见错即记** —— 触发判据：`isError: true`、文案含 `错误: `、或结构化字段全空却没标错。
      立刻 `record`，**不挑不攒**（是不是用法问题由归属判定管，不是记录的活）。
      **记录是旁路，任务不能停**：能改道改道，改不了记下跳过；**不要中途改源码**。
      改道成功（绕道用别的工具画出来了）同样值得留痕：把绕道的写法用 `case-step` 补进用例，
      否则这份「怎么绕过去」的知识下次还得重找。
- [ ] **2 收口** —— `run-end`，再无条件 `scan-log` 兜底补采服务端错误
      （超时 / 插件未连接是 WARN 级，加 `--include-warn`）。`hits: 0` 且 `list` 无未决 = 这轮干净。
- [ ] **3 定位** —— `list` 拿指纹与「骨架」文案 → 查分层路由表 `references/fix-playbook.md`。
      默认怀疑**两层**：报错点常在下游、根因在上游；报错里的 `set_x` / `get_layoutGrow`
      是引擎运行时内部 API，全仓搜不到是正常的。
- [ ] **4 改：一次只修一条指纹** —— 批量改完一起回归，失败时无法归因。消根因 > 打补丁；
      前置校验优于后置报错；文案点名字段 / 值 / 支持列表。动 `shared/src/core/` 或
      `ui/src/code/plugin.ts` 前必读 `references/constraints.md`。
- [ ] **5 静态验证（改完必跑）** —— `pnpm run typecheck` + `bash .agents/skills/mcp-tdd/scripts/verify.sh all`。
      有失败就定位 → 改 → **重跑**，直到无失败；分不清「本次引入」还是「既有」就跑
      `verify.sh baseline`（git stash 前后对比，**先 `--dry-run` 看它要干什么**，需干净工作区）。
- [ ] **6 引擎侧实测** —— 改过 `shared/` 或 `ui/` 必须重载插件后跑一次**最小 MCP 调用**。
      **只跑 build 或只看代码推理，都不算验证。**
- [ ] **7 回归：原用例重放** —— `case-show` 出的步骤按相同 `tool` + 相同 `args` 重跑，命中就
      `record --stage regress`。同指纹复发 = `regressed`，修复无效 → 回第 3 步；
      换了个新错误 = 部分修复，先记这条再决定闭环哪条。回归**用原用例**，不是「看起来修好了」。
- [ ] **8 闭环 + 归档** —— 回归干净才 `handle`（判据见下表）；然后 `report`，把 REPORT.md 路径
      与本轮闭环指纹报给用户；撞到的新平台限制补进 `references/platform-limits.md` 表。
      改了 MCP 源码按仓库约定提交（conventional commits）。

硬闸门：`product-bug` 必带 `--verified-by <回归runId>`，脚本会去核对 `runs/<id>.json` 与事件流，
**该 run 不存在、或这个指纹在回归 run 里复发，直接拒收闭环**（不靠自觉）。确无回归条件才用
`--force --note "原因"`，条目会留 `forced` 标记供日后 review。

没有可重放用例时（首次撞上的错误常见）：`case-new` 建骨架 → `case-step` 把刚跑过的步骤补进去 →
回第 3 步。用例是长期资产，别用完就丢。

## 最小可运行示例

```bash
S=node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs          # 都在仓库根执行；$S help 是权威参数说明

$S init                                                    # 幂等，建台账骨架
$S case-new --title "画 300x200 卡片" --platform jsdesign
RID=$($S run-start --case case-20260918-0001 --goal "画卡片")

# —— 任务中每次 jsd_* 报错 ——
$S record --run "$RID" --tool jsd_set_fill_color \
  --error '参数校验失败(jsd_set_fill_color): color: 必须是非空字符串' \
  --args '{"nodeId":"23:1456","color":""}'
$S run-end --run "$RID"; $S scan-log --run "$RID"

# —— 修复后：typecheck → verify.sh all → build + 重载插件 ——
$S list                                                    # 指纹 + 骨架文案
RRID=$($S run-start --case case-20260918-0001 --goal "回归 f1fbe3996e54")
# 按 case-show 的步骤原样重放；若原报错复发就记一条（会被判 regressed）：
#   $S record --run "$RRID" --stage regress --case case-20260918-0001 \
#     --tool jsd_set_fill_color --error '<原报错原文>'
$S handle --fingerprint f1fbe3996e54 --verdict product-bug \
  --case case-20260918-0001 --fix "normalizeColor 拦空串，报错点名字段" \
  --file packages/shared/src/core/normalize.ts --commit $(git rev-parse --short HEAD) \
  --verified-by "$RRID"
$S report
```

`--error` 传**原文**（别翻译或概括——指纹算的就是原始文案）；`--args` 传**触发这次报错的那份入参
原样**（后面复现的关键，别省）。

## 归属判定（每次 handle 都要做）

| verdict | 判据 | 处理 |
| --- | --- | --- |
| `product-bug`（默认） | 合法入参报错、文案含糊、本该支持的组合不支持 | 改代码 → 回归 → 闭环 |
| `usage-error` | 参数类型 / 枚举写错、前置条件没满足、用了已删除的旧工具名 | 修正用例步骤 → 闭环，`--note` 写明错在哪 |
| `environment` | 插件离线、端口 47812 / 47820 被占、daemon 未起 | **不改代码**，闭环一次并转告用户手动处理（别重试刷屏） |

拿不准按 `product-bug`：宁可多查一轮，别把真 bug 判成用法问题。

`record` 返回值决定下一步：`recorded` / `duplicate` 继续任务；`suppressed` 继续任务（表示已闭环过，
符合预期——别换措辞重记、别绕开 CLI 写 jsonl）；`regressed` **停下**：已闭环的又复发了，优先处理。

## Gotchas

| 现象 | 真相 / 动作 |
| --- | --- |
| 报错与修复前**一字不差**；写类工具报 `未知方法: move / resize / set_fill` | 插件仍跑旧产物：`pnpm build` + 重载插件；**不要**改参数、不要换工具 |
| `move / resize / set_* 失败: not a function`，而 **create 类完全正常** | 引擎沙箱缺 ES2020+ API（产物 `target: es6` 不注入 polyfill）——如 `Object.hasOwn`。改用手写替代（`Object.prototype.hasOwnProperty.call`），并跑 `tests/engine-api-compat.test.ts` 确认为零违规。**别当成插件跑旧产物**：这条重载插件不会好 |
| `jsd_ping` 超时 / `connected:false`；日志报「端口 47820 被非 text-to-design MCP 服务占用」 | daemon 未起、插件未连，或**旧 daemon 正在替换**（窗口 6s，等 6s 再试，别判定外来占用）→ 跑 `diagnose.sh`；判 `environment` |
| 报错含 `set_x` / `get_layoutGrow` 等函数名，全仓搜不到 | 那是**引擎运行时内部 API**：去 `shared/src/core/` 与 `ui/src/code/plugin.ts` 找调用点 |
| 改了一处，现象完全不变 | bug 常**横跨两层**（算法层 + 透传层），两处同时查 |
| 引擎静默忽略、回显却是成功 | 平台限制（字段超集、实例 override…）→ 按下方三档处理，绝不接受「回显成功实则没生效」 |
| 报错点在下游，根因在上游 | 典型：manifest 配错 → core 全线抛错 → MCP 层只看到一句英文异常；顺调用链往回走 |
| 实例侧序列化读到空 `fills` | 实例 override 可能未落盘 → **不要据此判定样式缺陷**，先查主组件 |
| 需要插件侧数据 | 插件 `console.log` 只进即时设计开发者控制台，外部读不到 → 临时 `throw new Error('DEBUG pos=…')` 经 WS 回传，**定位后必须移除** |
| 抛错只有 `请求超时` / `plugin error`，没有原因 | 静默 catch 吞了上下文 → 补 `e.message` 与上下文，别留无原因抛错 |
| 入参类错误日志里不一定有；日志文案被截断到 200 字符；超时 / 未连接是 WARN 级 | 两条采集通道覆盖面不同，别只靠一条；以 `--channel agent` 的完整原文为准。细节见 `references/error-channels.md` |
| smoke-split 退出码为 0 但输出有失败 | `smoke-split.ts` **没有 `process.exit`**：解析输出里的 `✗` 行（`verify.sh` 已代劳），别只看退出码 |
| `followUp jsd_find` 报 `isError` | 既有失败项，与本次改动无关 → 用 `verify.sh baseline` 确认，**别顺手改** |
| 回归时用例里的节点 id 失效（节点被删、画布被清） | 用本次实际返回的 id 替换步骤占位符；原用例不可复现就标 `status: stale` 并新开 case，别硬凑 |
| 台账**整目录不入库**（本机数据） | `docs/mcp-errors/` 已在仓库根 `.gitignore` 里：事件流会随任务无限增长，闭环库 / 用例 / run 元信息只对跑过它的那台机器有意义。新克隆的仓库不需要它——`init`（或任何命令）自动重建目录与 README。**别把台账文件 `git add` 回来**；要长留的结论写进技能参考或提交信息 |
| daemon / 插件都正常（`jsd_ping` 回 `connected:true`），但 agent 工具表里没有 `jsd_*` | 宿主侧没注册：`spawn node ENOENT`（宿主 PATH 无 node → `~/.workbuddy/mcp.json` 用绝对 node 路径）或 `skipping untrusted server`（改了配置 → 信任按 hash 失效，需在连接器管理里重新点信任；之后**新开会话**才注入工具）。查法见 `references/troubleshooting.md` 第 7 节 |

## 命令速查

台账 CLI：`S=node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs`（仓库根执行；`$S help` 打印全量参数）。
台账落在 `docs/mcp-errors/`，字段与状态语义见其 README。

| 意图 | 命令 |
| --- | --- |
| 建台账 / 开关任务 | `init` · `run-start --case <id> --goal "…"` · `run-end --run <rid>` |
| 记账 / 补采 | `record --run <rid> --tool jsd_x --error "原文" --args '{…}'` · `scan-log --run <rid> [--include-warn]` |
| 看未决 | `list` · `list --all` · `list --json` |
| 闭环 / 撤销 | `handle --fingerprint <fp> --verdict <v> --fix "…" --file <p> --commit <sha> --verified-by <回归runId>` · `unhandle --fingerprint <fp>` |
| 用例 | `case-new` · `case-step` · `case-show [--case <id>]` |
| 快照 | `report` → `docs/mcp-errors/REPORT.md` |

三个只读脚本（不联网、不交互，`--help` 是权威说明）：

| 脚本 | 用途 | 退出码 |
| --- | --- | --- |
| `scripts/diagnose.sh` | 连接层：health / 端口 / 进程 / 日志尾 + 分流结论 | 0 可达 / 1 不可达 / 2 用法 |
| `scripts/verify.sh [all\|typecheck\|lint\|smoke\|baseline] [--dry-run\|--json]` | 分层静态验证；`baseline` diff 出**新增失败** | 0 通过 / 1 失败 / 2 环境 |
| `scripts/buglog.sh [--limit N]` | 查**冻结归档**条目 + 汇总台账计数（只读） | 0 找到 / 1 没找到 / 2 用法 |

环境覆盖：`JSD_REPO`（仓库根）、`MCP_TDD_ROOT`（台账根）、`T2D_DOC_DIR`（归档目录）；
`verify.sh --json` 时人类可读报告走 stderr，stdout 只留一行 JSON。

## 硬约束（改 `shared/` 或 `ui/` 前必读）

- **字段集单一真相**：`PROP_METHOD_FIELDS[method]`（`shared/src/schemas/split-ops.ts`）同时驱动
  工具入参 schema 与引擎侧越界拦截 → **不要另开 extraFields 旁路通道**。
- **提示词与代码同源**：改工具可用性纪律要同时改 `server.ts` 的 `INSTRUCTIONS`、
  `tools/prompts.ts` 总纲、工具 `description` 与 `.describe()`。**只写一处等于没写。**
- 完整清单（schema 复用 / 零轴两侧不同 / `PROP_APPLICABILITY` 过滤 / 协议联合窄化 / 错误前缀 /
  mock host 三个必踩坑）见 `references/constraints.md`。

## 平台限制：三档处理

撞到平台限制 / 语义陷阱（引擎校验、静默失效、语义与直觉相反、字段存在但不生效）：

1. **优先在代码里兜住** —— 能消除就消除；消不掉就**检测并报错 / 进 `warnings` 点名**，
   绝不留「回显成功实则没生效」；能算出修复出口就顺手算出（如 `instanceStyleFixHint()`）。
2. **代码兜不住才落提示词** —— 仅限必须由调用方决策、或平台既定行为，且工具描述 +
   `prompts.ts` 总纲 + `server.ts` 的 `INSTRUCTIONS` **三处一起改**。
3. **一律记账** —— 台账 `handle` 一条（`--fix` 写清根因 / 处理口径 / 代码落点 / 是否需重载插件验证），
   同时在 `references/platform-limits.md` 表里补一行，否则下次还要重新查。

> 口诀：**能代码化的别写提示词，能自动化的别让人记。**
> 已知限制清单见 `references/platform-limits.md`。

## 反模式

- 只看代码推理就宣称「修好了」；报错一致就改参数、换工具（先怀疑未重载插件）。
- 任务中途停下来改源码；批量改完一起回归（失败时无法归因，`--fix` 也只能写句含糊话）。
- 顺手修既有失败项、顺手扩大重构范围；跑全仓 `pnpm run lint`（既有告警多，只 lint 改动文件）。
- 绕过 CLI 手改 `errors.jsonl` / `handled.json`；往冻结归档里写新条目。
- 修完不 `handle`、不 `report`——未决列表越来越长，最后没人看。
- 把 skill 建在只服务单一宿主的目录（`.workbuddy/skills/`、`.claude/skills/` 等）——
  本仓库统一放跨智能体通用的 `.agents/skills/`，一次写好，所有智能体都能用。

## 参考文件（按需加载，别一次性全读）

| 何时读 | 文件 |
| --- | --- |
| 要改源码：骨架文案 → 文件的完整路由表 + 修法标准 | `references/fix-playbook.md` |
| **动 `shared/src/core/` 或 `ui/src/code/plugin.ts` 之前** | `references/constraints.md` |
| 要判定「改动是否真生效」，或 `diagnose.sh` 没定位到 | `references/troubleshooting.md` |
| 怀疑是平台限制，要决定「代码兜 / 提示词 / 记账」 | `references/platform-limits.md` |
| 要查某文件属哪一层、改完要做什么 | `references/architecture.md` |
| 报错该走哪条采集通道，或要加日志埋点 | `references/error-channels.md` |
| 指纹归并过粗 / 过细，或看到不该 `suppressed` 的项 | `references/fingerprint.md` |
| 完整命令序列、边界情形（中途掉线、改需求、误判闭环） | `references/workflow.md` |
| 记账写哪儿、旧 md 条目 ↔ 台账字段对照、历史遗留 | `references/bookkeeping.md` |
| 手写复杂用例的字段模板 / 维护本技能（校准触发率） | `assets/case.template.json` · `assets/trigger-queries.json` |

历史归档 `archive/*.md`（P1–P32 的根因与修法，**冻结只读**）：查历史、避免重复踩坑时读它，
命中就照结论走、别重新发明；新结论一律写台账。

## 安装位置

位于 `<repo>/.agents/skills/mcp-tdd/`。宿主若只从 `<repo>/.workbuddy/skills/` 发现 skill：

```bash
mkdir -p .workbuddy/skills && ln -s ../../.agents/skills/mcp-tdd .workbuddy/skills/mcp-tdd
```
