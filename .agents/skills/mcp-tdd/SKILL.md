---
name: mcp-tdd
description: >
  在设计软件里执行设计任务时使用本技能 —— 画图、改样式、改文案、导出、编组、
  组件操作,凡调用 jsd_* 工具都算。它把每次工具报错记入 docs/mcp-errors/ 并按指纹去重,
  然后驱动「修复 → 用原用例回归」的循环,已闭环的错误不再重复入账。
  用户要求回归或 TDD 一下 MCP、排查/清理 jsd_* 报错、查看报错台账时也要使用,
  即使他没有提"技能""台账"这些词。不适用于纯问答,也不适用于不调用 jsd_* 的纯源码重构。
compatibility: Requires Node 20+ and a live text-to-design MCP connection (plugin panel showing 已连接). Error-log harvesting reads /tmp/text-to-design-mcp.log by default.
license: MIT
metadata:
  author: wuzhuo
  version: "1.0"
---

# MCP 测试驱动开发

text-to-design 的 MCP 有 50+ 个 `jsd_*` 工具,真实设计任务是最好的测试用例 —— 但报错
容易被随手消化掉:改个参数重试成功、绕道用别的工具画出来,错误信息就丢了,下次照样踩。
本技能把每个设计任务变成一次 TDD 循环:

**捕获**(任务中见错即记)→ **修复**(收口后逐条改源码)→ **回归**(重放原用例)→
**闭环**(同指纹此后不再入账)

台账落在 `docs/mcp-errors/`,随仓库提交,是可 review 的工程资产。

## 前置检查

`jsd_ping` 不通(「插件未连接」)就别开始设计任务 —— 刷出来的全是 `environment` 噪音。
让用户在设计软件里运行插件面板,显示「已连接」后重试。顺带记下 `jsd_ping` 返回的
`platform` 字段,填进 `case-new --platform`。

## 七条铁律

1. **先开 run 再干活。** 任务前 `run-start`,任务后 `run-end`。没有 runId,报错归属不明。
2. **见错即记,不挑不攒。** 出现 `isError: true`、文本含 `错误: `、或调用整体失败,立刻
   `record`。不要判断"看起来不重要""是我参数写错了"—— 那是归属判定该干的活,不是记录的活。
3. **记录是旁路,任务不能停。** 报错的步骤能改道就改道;改不了就记下、跳过、继续。
   不要在任务中途停下来改源码 —— 修复属于收口后。
4. **`suppressed` 是正常结果,不是故障。** 它表示这条已闭环过。不要换措辞重记、
   不要绕过 CLI 直接写 jsonl。确实要重新记账用 `unhandle`。
5. **修复必须回归,且必须用原用例。** 改完源码不做回归不许 `handle`。
6. **只有回归干净的指纹才能闭环。** 回归中任一步报错,先记新报错,再决定闭环哪条。
7. **一次只修一条指纹。** 批量改完一起回归,失败时无法归因,`--fix` 也只能写句含糊话。

## 工作流

```
- [ ] 1. 前置:jsd_ping 在线 → run-start --case <id> --goal "…"
- [ ] 2. 任务中:每次 jsd_* 报错立刻 record
- [ ] 3. 收口:run-end,再 scan-log 兜底补采服务端错误
- [ ] 4. 挑一条:list 拿指纹 → references/fix-playbook.md 定位源码层
- [ ] 5. 改:消根因 > 打补丁 → 跑验证循环
- [ ] 6. 回归:新开 run,case-show 出的步骤原样重放,record 带 --stage regress
- [ ] 7. 闭环:回归干净才 handle;复发则回第 4 步
- [ ] 8. 收尾:report,把 REPORT.md 路径与闭环指纹报给用户
```

没有可重放用例时(首次撞上的错误常见):`case-new` 建骨架 → `case-step` 把刚跑过的步骤
补进去 → 回第 1 步。用例是长期资产,别用完就丢。

## 命令速查

`S=.agents/skills/mcp-tdd/scripts/mcp-tdd.mjs`,都在仓库根执行。

| 意图 | 命令 |
| --- | --- |
| 开 / 收任务 | `run-start --case <id> --goal "…"` · `run-end --run <rid>` |
| 记一条报错 | `record --run <rid> --tool jsd_x --error "原文" --args '{…}'` |
| 日志兜底采集 | `scan-log --run <rid> [--include-warn]` |
| 看未决 | `list` · `list --all` · `list --json` |
| 闭环 | `handle --fingerprint <fp> --verdict <v> --fix "…" --file <p> --commit <sha> --verified-by <回归runId>` |
| 撤销闭环 | `unhandle --fingerprint <fp>` |
| 用例 | `case-new` · `case-step` · `case-show [--case <id>]` |
| 快照 | `report` → `docs/mcp-errors/REPORT.md` |

`record` 的返回值决定下一步:`recorded` / `duplicate` 继续任务;`suppressed` 继续任务
(符合预期);`regressed` **停下** —— 已闭环的又复发了,优先处理。

完整命令序列、真实反例、边界情形见 `references/workflow.md`。

`product-bug` 必带 `--verified-by <回归runId>`:脚本会去 `runs/<id>.json` 和事件流里核对,
**该 run 不存在或这个指纹在回归 run 里复发,直接拒收闭环**(铁律 5、6 由代码兜住,不靠自觉)。
回归 run 里夹带别的报错会告警放行。确实无法回归时 `--force --note "原因"`,条目留 `forced` 标记。

## 决策表

`handle --verdict` 三选一。判不准按 `product-bug`:宁可多查一轮,别把真 bug 判成用法问题。

| verdict | 判据 | 处理 |
| --- | --- | --- |
| `product-bug`(默认) | 代码缺陷:合法入参报错、文案含糊、本该支持的组合不支持 | 改代码 → 回归 → 闭环 |
| `usage-error` | 调用方写错:参数类型/枚举不对、前置条件没满足 | 修正用例步骤 → 闭环,`--note` 写明错在哪 |
| `environment` | 插件离线、端口 47812 被占、daemon 未起、旧版残留 | **不要改代码**,闭环并转告用户手动处理 |

归属速查:拿 `list` 输出的**骨架**字段比对,完整路由表见 `references/fix-playbook.md`。

| 骨架特征 | 改哪层 |
| --- | --- |
| `参数校验失败(<tool>): <字段>: …` | `packages/mcp-server/src/tools/<组>.ts` 的 `inputSchema` |
| `node_op <op> 失败` | `packages/shared/src/core/nodes.ts` |
| `component_op <op> 失败` | `packages/shared/src/core/component.ts` |
| `find 失败` | `packages/shared/src/core/nodes.ts` / `serialize.ts` |
| `平台 X 不支持操作: <op>` | `packages/ui/src/code/<平台>/ops.ts` |
| `请求超时` / `请求被拒` | `packages/mcp-server/src/pending.ts` / `bridge.ts` |

## 验证循环

```bash
pnpm run typecheck   # AGENTS.md 约定的唯一验证命令,不产出编译产物
pnpm build           # 仅当动过 ui/src/code/** 或 shared/** —— 插件跑的是 dist 产物
```

改了插件侧代码,必须 rebuild **并在设计软件里重载插件**,再进回归。跳过这步会测到旧脚本,
得出"修复无效"的假结论。回归不过则回工作流第 4 步,不要 `handle`。

## Gotchas

- **日志里的错误文案被截断。** `registry.ts` 落盘时做了 `msg.slice(0, 200)`,完整原文
  只在 agent 侧记录里。看到文案以 `...` 结尾,就以 `--channel agent` 的记录为准。
- **不能假设入参类错误日志里一定有。** 直接 MCP 调用由 SDK 的 `validateToolInput` 拦截,
  **不经过** `executeTool`,所以不落日志;而 `jsd_batch` 内层调用由 registry 自己
  `safeParse`,**会**落日志。两条通道都不能省。
- **每次插件失败在日志里留两行。** `响应: rNNN … ok=false error=X` 紧跟一条
  `工具 <jsd_x> 执行失败: X`,间隔约 1ms。`scan-log` 默认丢弃前者 —— 它只有插件方法名
  (`find`,多工具共用,反查不唯一),且带请求号会把指纹打散。实测真实日志 43 条 ERROR
  归并后是 10 条指纹,不丢镜像行则虚增到 29 条。
- **超时和「插件未连接」是 WARN 级**,默认 `scan-log` 不抓。排查这两类症状加 `--include-warn`。
- **报错点常在下游,根因在上游。** 典型:manifest 写了 `documentAccess: 'dynamic-page'`,
  Figma 禁掉一批同步 API,core 全线抛错,MCP 层只看到一句英文异常。定位要顺调用链往回走。
- **旧工具名已删除。** `jsd_create_nodes` / `jsd_update_node` 被拆成 `jsd_create_*` /
  `jsd_set_*`;模型顺手用旧名会报 unknown tool,判 `usage-error`。工具名是固定集合,
  别猜 —— 不确定先 `jsd_ping`(返回能力表与 `platformOps` 名单)。
- **用例里的节点 id 会失效。** 回归重放时用本次实际返回的 id 替换步骤里的占位符。
- **台账要入库,游标不入库。** `docs/mcp-errors/.log-cursor.json` 是本机状态,已 ignore。

## 参考文件

按需加载,不要一次全读:

| 何时读 | 文件 |
| --- | --- |
| 要改源码,需要文案 → 文件的完整路由表与修法标准 | `references/fix-playbook.md` |
| 需要完整命令序列、真实样例、边界情形(中途掉线、改需求、误判闭环) | `references/workflow.md` |
| 判断某条报错该走哪条通道,或要加日志埋点 | `references/error-channels.md` |
| 怀疑指纹归并过粗 / 过细,或看到不该 `suppressed` 的项 | `references/fingerprint.md` |
| 手写复杂用例,需要字段模板 | `assets/case.template.json` |
| 维护技能本身(校准 description 触发率) | `assets/trigger-queries.json` |

## 安装位置

位于 `<repo>/.agents/skills/mcp-tdd/`。宿主若只从 `<repo>/.workbuddy/skills/` 发现 skill:

```bash
mkdir -p .workbuddy/skills && ln -s ../../.agents/skills/mcp-tdd .workbuddy/skills/mcp-tdd
```
