# 完整工作流

> 何时读：需要完整命令序列、真实样例，或遇到边界情形（任务中途掉线、用户改需求、
> 用例不可复现、误判闭环）时。

`SKILL.md` 是主流程,本文补全命令序列、真实样例与边界情形。

阶段与 `SKILL.md` 闭环的对应:阶段 0·前置 = 闭环 0–2(前置 / 任务中记录 / 收口),
阶段 2·修复 = 闭环 3–6(定位 / 改 / 静态验证 / 引擎实测),阶段 3·回归 = 闭环 7,
阶段 4·收口 = 闭环 8。

## 命令别名

下文用 `$S` 指代 CLI:

```bash
S=.agents/skills/mcp-tdd/scripts/mcp-tdd.mjs
```

所有命令都从**仓库根**执行。台账落在 `<repo>/docs/mcp-errors/`(可用 `MCP_TDD_ROOT`
指向别处,便于在临时目录里试跑)。`node $S help` 打印全量参数。

## 最小可运行示例

一整轮的主干命令,先扫一遍再读下面的分阶段细节:

```bash
node $S init                                               # 幂等,建台账骨架
node $S case-new --title "画 300x200 卡片" --platform jsdesign
RID=$(node $S run-start --case case-20260918-0001 --goal "画卡片")

# —— 任务中每次 jsd_* 报错 ——
node $S record --run "$RID" --tool jsd_set_fill_color \
  --error '参数校验失败(jsd_set_fill_color): color: 必须是非空字符串' \
  --args '{"nodeId":"23:1456","color":""}'
node $S run-end --run "$RID"; node $S scan-log --run "$RID"

# —— 修复后:typecheck → verify.sh all → build + 重载插件 ——
node $S list                                               # 指纹 + 骨架文案
RRID=$(node $S run-start --case case-20260918-0001 --goal "回归 f1fbe3996e54")
# 按 case-show 的步骤原样重放;若原报错复发就记一条(会被判 regressed):
#   node $S record --run "$RRID" --stage regress --case case-20260918-0001 \
#     --tool jsd_set_fill_color --error '<原报错原文>'
node $S handle --fingerprint f1fbe3996e54 --verdict product-bug \
  --case case-20260918-0001 --fix "normalizeColor 拦空串,报错点名字段" \
  --file packages/shared/src/core/normalize.ts --commit $(git rev-parse --short HEAD) \
  --verified-by "$RRID"                                    # 复发过的指纹还要 --decision NNNN
node $S report
```

`--error` 传**原文**(别翻译或概括 —— 指纹算的就是原始文案);`--args` 传**触发这次报错的
那份入参原样**(后面复现的关键,别省)。

## 阶段 0 · 前置

```bash
node $S init                       # 幂等,建台账骨架
node $S case-show                  # 有没有可复用用例
```

调用 `jsd_ping`:

- `ok: true` → 继续。
- 「插件未连接」→ **不要开始设计任务**。让用户在设计软件里运行插件面板,面板显示
  「已连接」后重试。此时刷出来的错误全是 `environment` 类,记了也只是噪音。
- 记一下 `jsd_ping` 返回的 `platform` 字段,填进 `case-new --platform`。
  平台差异能力(如 Figma 的变量)在即时设计里必然被门控拦截 —— 那是预期行为,不是 bug。

## 阶段 1 · 任务中

```bash
RID=$(node $S run-start --case case-20260918-0001 --goal "在画布中心画 300x200 卡片")
echo "$RID"
```

`run-start` 只在 stdout 输出一行 runId,直接 `$(...)` 取用。

之后每调用一次 `jsd_*`,看结果:

| 现象 | 动作 |
| --- | --- |
| 正常返回 | 继续 |
| `isError: true` | 立即 `record` |
| 文本里出现 `错误: ` | 立即 `record` |
| 结构化字段全是空值/默认值但没标 isError | 可疑 —— `record` 记下,`--note "疑似静默失败"` |
| 工具名不存在(MCP 报 unknown tool) | `record`,`--tool` 填那个名字,verdict 多判 `usage-error`(多半是记了已删除的旧工具名) |

```bash
node $S record --run "$RID" --case case-20260918-0001 \
  --tool jsd_set_fill_color \
  --error '参数校验失败(jsd_set_fill_color): color: 必须是非空字符串' \
  --args '{"nodeId":"23:1456","color":""}'
```

`--args` 传**触发这次报错的那份入参原样**。这是后面复现的关键,别省略。
入参含用户隐私内容(文案、素材路径)时先裁剪再传。

`--error` 传工具结果里的原文,**不要翻译或概括** —— 指纹算的是原始文案,改写了就归并不上。

任务收口:

```bash
node $S run-end --run "$RID"
node $S scan-log --run "$RID" --case case-20260918-0001
```

`scan-log` 输出 `hits: 0` 且 list 也无未决 → 这一轮干净,任务结束。

## 阶段 2 · 修复

```bash
node $S list                 # 未决清单 + 指纹
node $S list --all           # 连已闭环一起看,确认没收错
node $S list --json          # 需要程序化处理时
```

挑一条(一次一条,见 `SKILL.md` 闭环第 4 步),走四步。

### 2.1 定位

拿 `骨架` 字段查 `fix-playbook.md` 的分层路由表。报错文案全仓都是 `throw new Error`
字面量,路由表没覆盖时直接搜骨架里最长的中文片段:

```bash
rg "没有找到组件" packages
```

跨层查找时注意:报错点常在**下游**,根因在**上游**。典型如 manifest 配置错 →
插件里同步 API 抛错 → MCP 层只看到一句 Figma 的英文异常。定位要顺着调用链往回走,
不要停在报错那一行。

### 2.2 判根因

问三个问题:

1. 这个报错点是唯一出口,还是同类问题的其中一处?(只有一处 → 可能是特判,不是根因)
2. 修这里能让**同类**报错一起消失吗?
3. 上游有没有本该拦住的地方?

第 3 问最重要 —— 很多报错的正确修法是"在更早的地方前置校验",而不是"让当前这处
报错更清楚"。

### 2.3 改

按 `fix-playbook.md` 的「修法标准」:消根因 > 打补丁;前置校验优于后置报错;
文案点名字段/值/支持列表;易回退的坑留注释护栏。

### 2.4 自检

```bash
pnpm run typecheck
pnpm build          # 动了 ui/src/code/** 或 shared/** 就必须重建
```

动过插件侧代码,回归前还要在设计软件里**重载插件**。忘了这步会得出"修复无效"的假结论 ——
因为跑的还是 `packages/ui/dist/` 里的旧脚本。

### 归属判定

`handle --verdict` 三选一(完整判据见 `SKILL.md`):`product-bug` / `usage-error` /
`environment`。判不准时按 `product-bug`,宁可多查一轮。

## 阶段 3 · 回归

回归必须是**用原用例重放**,不是"看起来修好了"。

```bash
node $S case-show --case case-20260918-0001
RRID=$(node $S run-start --case case-20260918-0001 --goal "回归 f1fbe3996e54")
```

照着 `case-show` 打印的步骤,逐条以相同 `tool` + 相同 `args` 重新调用 MCP 工具。
**每条结果都过一遍 record**(尤其是失败的那几条):

```bash
node $S record --run "$RRID" --stage regress --case case-20260918-0001 \
  --tool jsd_set_fill_color \
  --error '参数校验失败(jsd_set_fill_color): color: 必须是非空字符串'
```

三种结局:

| 重放结果 | record 返回 | 判定 |
| --- | --- | --- |
| 不再报错 | (无调用) | 修复生效,可闭环 |
| 同指纹再次报错 | `regressed` | 修复无效,回到阶段 2 |
| 换了个新错误 | `recorded` | 部分修复:先记这条,再决定闭环哪条 |

```bash
node $S run-end --run "$RRID"
node $S handle --fingerprint f1fbe3996e54 \
  --verdict product-bug \
  --case case-20260918-0001 \
  --fix "normalizeColor 补空串拦截,报错文案点名字段" \
  --file packages/shared/src/core/normalize.ts \
  --commit $(git rev-parse --short HEAD) \
  --verified-by "$RRID" \
  --decision 0007
```

`--file` 可重复传多次。`--verified-by` 填回归 runId —— 这是修复的证据链。

`--decision <NNNN>` 把闭环挂到 `docs/design-decisions/NNNN-*.md`（暂未建记录只告警不阻断）。
**已闭环过、且在回归阶段真复发的指纹必须带它**，否则 `handle` 直接拒收 —— 先按
`SKILL.md` 的闸门一节出决策再回来。`list --decision 0007` 可反查这条决策关联的指纹生死。

## 阶段 4 · 收口

```bash
node $S report               # → docs/mcp-errors/REPORT.md
node $S list                 # 确认未决清零
```

把 `REPORT.md` 路径和本轮闭环的指纹报给用户。改了 MCP 源码就按仓库约定提交
(commitlint 走 conventional commits)。

**归档不在这四阶段里** —— 它是台账的独立节奏，只在主库开始碍事时才跑（`list --all` 要翻页、
或 `report` 里已闭环行压过未决行）：

```bash
node $S archive --dry-run          # 先看要搬什么，不写盘
node $S archive --older-than 30d   # 默认 30d
node $S list --archived            # 查归档内容
```

归档前后 `record` / `handle` 语义不变：去重闸门同时查归档库，回归阶段复发会把条目整块搬回主库
并置 `regressed`。判据与不变式见 `SKILL.md` 的「归档」一节，别手删台账文件。

## 边界情形

**任务中途插件掉线**
连接类错误记一次即可(`--verdict environment`),不要重试刷屏。让用户重连后,
新开 run 继续剩余步骤 —— 别在同一个 run 里混前后两个连接状态。

**同一错误在一次任务里重复几十次**
`record` 自动按 `runId + 指纹` 去重,第二次起返回 `duplicate`,直接忽略即可。

**用户中途改需求**
`node $S run-end --run "$RID" --status aborted`,然后新开 run。别把改需求前后的
报错混进同一个 run 的统计。

**回归时用例步骤已经不可复现**(比如节点被删了、画布被清空了)
不要硬凑。新开一个能跑通的 case,把旧 case 的 `status` 改成 `stale`,
并在 `handle --note` 里写明"原用例已失效,以新 case 验证"。

**误判闭环了**(`handle` 后发现有漏)
`node $S unhandle --fingerprint <fp>`,指纹回到未决,可以重新记。

**`handle` 被拒:该指纹复发过,要求 `--decision`**
这不是拦路虎,是结论:同一个报错修一次又复发,说明上次的修法是单点补丁。
先读 `.agents/skills/software-design-patterns/SKILL.md` 出结论、落
`docs/design-decisions/NNNN-*.md`,再按记录的「最小落地」改一遍并重新回归,
最后 `handle … --decision NNNN`。确无结构问题(如两次是互不相关的偶发)时才
`--force --note "原因"` —— 条目会留 `forced` 标记,复盘时会被翻出来。

**跨轮次收敛**
每轮结束后 `report` 出的未决数应当单调下降。若某指纹每轮都出现却没有被 `handle`,
说明排查被跳过了 —— 它会一直占着未决列表。

**要临时关掉某类噪音**
不要靠删事件。正确做法是判定 `usage-error`,用 `--note` 写明为什么不算缺陷。
台账保留完整历史,闭环库负责降噪;真嫌主库大就跑 `archive`(见阶段 4)。
