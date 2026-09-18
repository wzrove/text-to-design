# MCP 报错台账(mcp-tdd)

由 `.agents/skills/mcp-tdd` 维护。**改台账请走 CLI,不要手改 jsonl** —— 指纹与状态
由脚本维护,手改会破坏去重。

| 文件 | 作用 | 可否手改 |
| --- | --- | --- |
| `errors.jsonl` | 追加式事件流,每条 = 一次报错观察 | 否(只由 `record`/`scan-log` 追加) |
| `handled.json` | 已闭环指纹库,= 去重闸门 | 否(用 `handle`/`unhandle`) |
| `cases/<caseId>.json` | 可重放的设计任务用例(回归依据) | 可(用例本身是测试资产) |
| `runs/<runId>.json` | 一次设计任务的元信息 | 否 |
| `.log-cursor.json` | daemon 日志采集位点 | 否 |
| `REPORT.md` | `report` 生成的当前未决报错快照 | 否(会被覆盖) |

## 状态语义

| 状态 | 判定 | 含义 |
| --- | --- | --- |
| `open` | 有事件、不在 `handled.json` | 未处理,待排查 |
| `regressed` | 在 `handled.json`,但 `handledAt` 之后又出现事件 | 修复未生效或已回退,**优先处理** |
| `handled` | 在 `handled.json` 且无更新事件 | 已闭环,后续同指纹不再记录(仅累加抑制计数) |

## 闭环判定(verdict)

`handle` 时必须给一个判定,决定这条错误"算谁的问题":

| verdict | 含义 | 闭环方式 |
| --- | --- | --- |
| `product-bug` | MCP 代码缺陷(默认) | 改代码 → 回归通过 → handle |
| `usage-error` | 调用方参数/前置条件写错,非缺陷 | 修正用例 → handle |
| `environment` | 插件离线、端口占用等环境问题 | 不修代码,记录并提示用户 |

只有 `product-bug` 需要回归证据(`--verified-by <回归runId>`)。

## 事件字段

```json
{
  "id": "err-20260918T022633Z-a1b2c3",
  "fingerprint": "9f2c1ab34de5",
  "tool": "jsd_set_fill_color",
  "message": "参数校验失败(jsd_set_fill_color): color: 非法",
  "normalized": "参数校验失败(<tool>): color: 非法",
  "channel": "agent | log",
  "stage": "record | regress",
  "caseId": "case-20260918-0001",
  "runId": "run-20260918T022633Z",
  "args": {},
  "state": "open | regressed",
  "ts": "2026-09-18T02:26:33.092Z"
}
```
