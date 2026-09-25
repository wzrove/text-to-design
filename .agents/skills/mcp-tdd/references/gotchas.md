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
| `sync-guarantee.ts` 里新增/修改的断言**怎么改都通过**，看着像在守其实没守 | 与全局类型**同名**的本仓类型被 `import` 后，import 声明在整个模块内生效并**优先于全局声明** —— 别名写在 import 之前也没用（import 会被提升）。`type RuntimePaint = Paint;` 拿到的其实是线格式的 `Paint`，于是 `Paint extends RuntimePaint` 退化成 `X extends X` 恒真。**动作**：全局类型直接用原名（该文件不 import 这三个名字），本仓线格式一律 `import type { Paint as WirePaint }`。**改完先做一次变异测试**（往声明表里塞一个假值，确认 `tsc` 真的红）——恒真断言是「加了守卫」与「守卫生效」之间最常见的假象，见 0022 |
| 断言报 `Type '"X"' does not satisfy the constraint 'never'`，但 X 看着确实该被拦 | 那是 `ExpectNever<...>` 的**正常失败形态**：报出来的字符串就是违规键名。先判方向：若期望「拦截」却报错，说明该值在本平台 typings 里**存在**（收窄登记是凭空限制）；若期望「放行」却报错，说明它**不存在**（该登记一条 deny）。两个方向都由 `sync-guarantee.ts` 成对断言，别只留一条 |
| 报错文案退化成 `错误: [object Object]`，而同类规则文案正常 | **先怀疑 daemon 陈旧**：daemon 是**长驻单例**，`mcp-server` 改了但没重启时，它仍握着**旧构建的工具 schema 与旧版 SDK 的 issues 格式化** —— 同一载荷于是只剩一个被 stringify 过的对象。判据：`curl -X POST http://127.0.0.1:47820/shutdown` 重启后**同一载荷**文案立刻变完整（2026-09-24 实测，指纹 `a46b3d0c206e` 就属这一类，判 `environment`）。改 `shared/` 或 `ui/` 才需要重载插件；改 `mcp-server/` 只需重启 daemon，两条别混 |
