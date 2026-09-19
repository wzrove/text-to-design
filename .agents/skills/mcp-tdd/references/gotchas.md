# Gotchas：现象 → 真相 → 动作

> 何时读：闭环第 3 步定位时症状眼熟、或第 5–6 步验证结果不符合预期时。
> 这些是「看着像 A、其实是 B」的坑，逐条都付过排查成本。

| 现象 | 真相 / 动作 |
| --- | --- |
| 报错与修复前**一字不差**；写类工具报 `未知方法: move / resize / set_fill` | 插件仍跑旧产物：`pnpm build` + 重载插件；**不要**改参数、不要换工具 |
| `move / resize / set_* 失败: not a function`，而 **create 类完全正常** | 引擎沙箱缺 ES2020+ API（产物 `target: es6` 不注入 polyfill）——如 `Object.hasOwn`。改用手写替代（`Object.prototype.hasOwnProperty.call`），并跑 `tests/engine-api-compat.test.ts` 确认为零违规。**别当成插件跑旧产物**：这条重载插件不会好 |
| `jsd_ping` 超时 / `connected:false`；日志报「端口 47820 被非 text-to-design MCP 服务占用」 | daemon 未起、插件未连，或**旧 daemon 正在替换**（窗口 6s，等 6s 再试，别判定外来占用）→ 跑 `diagnose.sh`；判 `environment` |
| 报错含 `set_x` / `get_layoutGrow` 等函数名，全仓搜不到 | 那是**引擎运行时内部 API**：去 `shared/src/core/` 与 `ui/src/code/plugin.ts` 找调用点 |
| 改了一处，现象完全不变 | bug 常**横跨两层**（算法层 + 透传层），两处同时查 |
| 引擎静默忽略、回显却是成功 | 平台限制（字段超集、实例 override…）→ 按 SKILL.md「平台限制：三档处理」，绝不接受「回显成功实则没生效」 |
| 报错点在下游，根因在上游 | 典型：manifest 配错 → core 全线抛错 → MCP 层只看到一句英文异常；顺调用链往回走 |
| 实例侧序列化读到空 `fills` | 实例 override 可能未落盘 → **不要据此判定样式缺陷**，先查主组件 |
| 需要插件侧数据 | 插件 `console.log` 只进即时设计开发者控制台，外部读不到 → 临时 `throw new Error('DEBUG pos=…')` 经 WS 回传，**定位后必须移除** |
| 抛错只有 `请求超时` / `plugin error`，没有原因 | 静默 catch 吞了上下文 → 补 `e.message` 与上下文，别留无原因抛错 |
| 入参类错误日志里不一定有；日志文案被截断到 200 字符；超时 / 未连接是 WARN 级 | 两条采集通道覆盖面不同，别只靠一条；以 `--channel agent` 的完整原文为准。细节见 `error-channels.md` |
| smoke-split 退出码为 0 但输出有失败 | `smoke-split.ts` **没有 `process.exit`**：解析输出里的 `✗` 行（`verify.sh` 已代劳），别只看退出码 |
| `followUp jsd_find` 报 `isError` | 既有失败项，与本次改动无关 → 用 `verify.sh baseline` 确认，**别顺手改** |
| 回归时用例里的节点 id 失效（节点被删、画布被清） | 用本次实际返回的 id 替换步骤占位符；原用例不可复现就标 `status: stale` 并新开 case，别硬凑 |
| 同一秒连起两次 `run-start` | runId 曾按秒生成会撞名，后写的元信息覆盖前一次 → 现已顺延编号（`…Z-2`）。看到 `-2` 后缀属正常，别当成重复 run 删掉 |
| 台账**整目录不入库**（本机数据） | `docs/mcp-errors/` 已在仓库根 `.gitignore` 里：事件流会随任务无限增长，闭环库 / 用例 / run 元信息只对跑过它的那台机器有意义。新克隆的仓库不需要它——`init`（或任何命令）自动重建目录与 README。**别把台账文件 `git add` 回来**；要长留的结论写进技能参考或提交信息 |
| daemon / 插件都正常（`jsd_ping` 回 `connected:true`），但 agent 工具表里没有 `jsd_*` | 宿主侧没注册：`spawn node ENOENT`（宿主 PATH 无 node → `~/.workbuddy/mcp.json` 用绝对 node 路径）或 `skipping untrusted server`（改了配置 → 信任按 hash 失效，需在连接器管理里重新点信任；之后**新开会话**才注入工具）。查法见 `troubleshooting.md` 第 7 节 |
