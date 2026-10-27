# a7f8846b. 遥测错误结构化:scope/code/subject 分类 + fingerprint 跨窗口 rollup,message 降为 detail

- **日期：** 2026-10-26
- **状态：** 已采纳
- **影响范围：** `shared`（新增 `dicts/error-report`、`dicts/log` 加 scope）、`mcp-server`（logger/telemetry/pending/registry/run）、`telemetry`（schema + handler + summary）、`tests`
- **相关记录：** 补 [1a135e6a](1a135e6a-遥测上报改事件驱动冲刷-去定时器、条目级幂等、退避重试.md) 明确列为「本次不做」的**全局错误指纹**；沿 0016 的「类别固化到载荷、格式化收口一处」口径（`ERROR_CODES` 早已存在）；不取代任何记录

## 压力

线上 DB 实测：一次批量里 15 行 `响应: r… node_op ok=false 耗时=…ms error=engine_error`，`created_at` 全同、`count` 全 1、`error_id` 全不同。根因两条：

1. **`message` 兼任三件事**：给人看的正文、分类键、上报载荷。它由各生产点用字符串拼出来，而拼进去的东西里有每次必变的值（桥接请求号 `r{seq}`、耗时、节点 id），按整串去重等于永不命中。当时的补丁是正则抹平（mcp-server 内的 `fingerprintOf`），能救急但脆：新 message 形状要新正则，且它是**客户端私有**的，服务端无法复用 → 跨窗口仍是新行。
2. **分类词表早就有，断在 logger 这一段**：`ERROR_CODES`（9 个封闭值）与 `BridgeError.code` 是协议层既有事实，但日志出口 `LogSink = (level, line) => void` 只传文本，`code` 在这里被扔掉；`tool` / `method` 同样只在调用点存在，拼进字符串就找不回来。

代价：同一错误跨 10s 窗口重复入库（约 8.6k 行/天/安装），报表只能对 message 做正则。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| `(scope, code, subject)` 结构化 + `message` 降为 detail；分组键 = 三元组 + 归一化 message | 采用 | 分类维度封闭（scope 三值、code 复用 `ERROR_CODES`、subject 取工具/方法名），两侧共用 shared 的同一份实现 |
| 只把正则指纹挪进 shared（不结构化） | 排除 | 治标：新 message 形状仍要新正则，且 `code` 明明在手上却要靠文本猜回来 |
| 分组键只取 `(scope, code, subject)`，message 不进键 | 排除 | 会把同一工具下不同根因的 engine_error 合成一条，丢掉区分度；归一化后的 message 留在键里，易变片段已抹平 |
| 客户端发 `fingerprint` 字符串 | 排除 | 分组键是**服务端也要算**的东西（老客户端兜底），把实现放 shared、两边各算一次，比多传一个字段更不容易跑偏 |
| 保留 `error_id` 唯一索引做投递幂等 | 排除 | 与 `(user_id, fingerprint)` rollup 冲突：同一 `error_id` 在跨窗口新批次里不会再 INSERT。改用它当**水位**（该批是否已计过），迁移里删掉唯一索引 |
| 加独立 `error_groups` 汇总表 + 原始事件表 | 排除 | 原始表仍按窗口写 8.6k 行/天，没解决「写太多」；单表 rollup + 水位已够 |
| 保持简单（只留已落的正则指纹） | 排除 | 服务端跨窗口重复仍在，报表仍无分类 |

## 结论

**错误载荷带 `(scope, code, subject)` 分类三元组，`message` 只作展示；分组键由 shared 的 `errorGroupKey` 统一算，客户端窗口内去重、服务端跨窗口 rollup 用同一个串。**

- `scope`：`bridge` / `tool` / `daemon`（`LOG_SCOPES`，封闭三值）。
- `code`：复用 `ERROR_CODES`，不新造词表。
- `subject`：工具名 / 插件方法名。
- 分组键 = `scope|code|subject|归一化 message 前 240 字`；归一化只抹已知易变词（uuid、`r{seq}`、`耗时={ms}ms`、节点 id `1:23`），**不抹数字本身**（`HTTP 500` ≠ `HTTP 404`）。

## 实施方案

- **shared**：`dicts/log.ts` 加 `LOG_SCOPES` / `LogScope`；新增 `dicts/error-report.ts`（`normalizeErrorMessage` / `errorGroupKey` / `ErrorGroupInput`），从 `dicts/index.ts` 导出。两侧（daemon 客户端、worker 服务端）共用这一份。
- **mcp-server**：`LogRecord`（shared，`level / scope / message / code? / subject? / stack? / context?`）是**落盘、UI 推送、遥测三处共用**的形状；`LogSink` 收一条 `LogRecord`，`logger.error(message, tag?)` 的 tag 只带 `{ scope, code, subject }`。热调用点打标：`pending.ts`（scope=bridge, subject=method, code=msg.error.code）、`registry.ts` 平台门控与执行失败（scope=tool, subject=def.name, code=errorCodeOf(e)）、`run.ts` 进程级异常（scope=daemon, level=fatal）。`captureError(record: LogRecord)`，队列条目 = `LogRecord & { id, fingerprint, count?, inflight? }`；上线投影 `toWire` 去掉本地字段。落盘改 **JSONL**：`{ time, ...LogRecord }`。
- **telemetry**：`error_reports` 加 `fingerprint / code / scope / subject / last_seen`；唯一索引从 `error_id` 改为 `(user_id, fingerprint)`；写入改 `onConflictDoUpdate` —— `count = case when 旧 error_id = excluded.error_id then 旧 count else 旧 count + excluded.count end`（重发同一批不重复计数，跨窗口才累加），`last_seen = now()`，`code/scope/subject` 用 coalesce 保留旧值。zod 加三字段（可选；老客户端由服务端用同一份 `errorGroupKey` 从 message 算键兜底）。新增读侧 `GET /v1/errors/summary?hours&limit`，按 `(code, scope, subject)` 聚合 `sum(count) / distinct user / last_seen / sample`。
- **本次不做**：不落原始事件表（要审计另开）；不加 worker 侧按安装限流；不删 `message`（日志文件与 UI 抽屉要人读文案）。

## 成本与退出条件

- 成本：客户端多三个字段 + 一次归一化；DB 多四列一索引；迁移要删 `error_id` 唯一索引（旧行 fingerprint 为 NULL，历史数据不参与 rollup）；`message` 与分类可能不一致（分类是权威，message 只是样本）。
- 退出条件：若不再需要跨窗口 rollup → 删 `fingerprint` 与唯一索引、写入退回 `error_id` upsert，分类列可留（报表仍可用）；若 worker 侧要做限流 → 在 `(user_id, fingerprint)` 上按窗口配额丢弃并把溢出并入 count。

## 验证

- 不变量测试（`tests/error-report.test.ts`）：同一失败（仅请求号/耗时不同）收敛成一个键；不同 code/scope/subject 不合并；`HTTP 500` 与 `HTTP 404` 不合并；节点 id / uuid 归一；键长 < 400；缺三元组时退化成 `|||message`。
- 边界：`error_id` 水位对重发幂等（同批重发 count 不加）；老客户端（无 scope/code/subject）由服务端同一份实现算键，仍 rollup。
- 实测：`pnpm run typecheck` 全绿；`node scripts/decision-refs.mjs check` 通过；迁移由 `drizzle-kit generate` 产出（`0003_smooth_susan_delgado.sql`）。
- 待用户：`pnpm test` / `pnpm lint`；对 Supabase 跑 `pnpm db:migrate`；`pnpm build` 后重启 daemon（改的是 `mcp-server/`）。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-26 | 初次决策（用户：整合 message 字段，做到更好的分类与上报） | 采用结构化三元组 + shared 分组键 + 单表 rollup；补上 1a135e6a 暂缓的全局错误指纹 |
| 2026-10-27 | 要求「log 结构统一，保持上报的样子」 | 结论扩展（不新建记录）：`LogRecord` 成为落盘 / UI 推送 / 遥测**三处共用**的形状；落盘文件改 JSONL；`ServerPush` 的 log 帧加 `record`（保留 `level`/`line` 兼容旧 UI）；`LOG_LEVELS` 补 `fatal`；UI `LogEntry extends LogRecord`，抽屉按 `errorGroupKey` 合并同形状行。原「本次不做：不删 message」仍成立（message 仍是记录里的展示字段） |
