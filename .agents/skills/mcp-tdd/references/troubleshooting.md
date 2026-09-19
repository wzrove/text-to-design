# 分步排查（定位卡住时读）

> 何时读：闭环第 3 步（定位）没进展、`diagnose.sh` 没给出结论，或要判定「改动是否真生效」时。

连接层的整体分流先跑
`bash .agents/skills/mcp-tdd/scripts/diagnose.sh`（health / 端口 / 进程 / 日志一次跑完）。

## 1. 「插件离线」还是「daemon 有问题」

```bash
curl -s http://127.0.0.1:47820/health
tail -50 /tmp/text-to-design-mcp.log
```

- health 通、但工具表为空 → **插件未运行/未连接** → 去即时设计重载插件。
- health 不通、日志有 `端口 47820 被非 text-to-design MCP 服务占用` →
  先看是否**旧 daemon 正在替换**（替换等待 6s，`DAEMON_REPLACE_MS`），
  等 6s 再试，**不要立刻判定外来占用**。
- health 不通且无进程 → daemon 未起，发起一次 MCP 调用会按需拉起。

这类症状 verdict 判 `environment`，记一次即可，不要重试刷屏。

## 2. 用报错里的函数名定位调用点

报错里的 `set_x`、`get_layoutGrow`、`resize` … **来自即时设计运行时内部 API，
不在本项目源码里，搜不到是正常的**。去这两处找对应调用点：

- `packages/shared/src/core/`（算法层：坐标 / 尺寸 / 编组计算）
- `packages/ui/src/code/plugin.ts`（参数透传层）

一个 bug 可能横跨两处，只修一侧现象不变。完整分层路由表见 `fix-playbook.md`。

## 3. 需要插件侧数据时

插件进程的 `console.log` 只输出到**即时设计开发者控制台，外部读不到**。

```ts
// 临时诊断：把数据拼进 Error 消息，经 WS 回到调用侧
throw new Error(`DEBUG pos=${pos.x},${pos.y} box=${box.x},${box.y}`);
```

**定位后务必移除。** 实测样例：`pos=NaN,NaN` 而 `box=2776.31,811.32,100,100`
—— 一眼看出断点在坐标读取而非布局计算。

## 4. 逐条勾：改动真的生效了吗

判据（报错一字不差 = 插件跑旧产物）见 `SKILL.md` 的 Gotchas。这里是要逐条确认的清单：

- [ ] `pnpm build` 真的跑过、无报错
- [ ] 即时设计里**重新运行**过插件
- [ ] 加载的是 `packages/ui/dist/jsdesign/manifest.json`（旧 dist 会误导）
- [ ] 写类工具报「未知方法」→ 同上，插件未重载

## 5. baseline 的两个额外机制

`verify.sh baseline` 的用法见 `SKILL.md`；这里只补脚本行为：

- 它需要工作区可被 stash，会先打印恢复提示；**中断后**用 `git stash list`
  找回 `jsd-verify-baseline` 手动 pop。
- 若 stash 或 pop 失败，脚本会明确报出并保留线索，此时**先处理 stash 再继续**，
  不要在改动被藏起来的状态下判断结果。

## 6. smoke-split 的四类标记行

`smoke-split.ts` 读输出时要看标记行，别只看退出码（它没有 `process.exit`）：

| 标记行 | 含义 |
|---|---|
| `正向` | 入参 → 下发 method/params 的断言 |
| `负例` | 非法入参被拒 |
| `引擎方法白名单` | 方法在允许集合内 |
| `followUp 结果引导` | 该项有**既有**失败（`followUp jsd_find`），与本轮改动无关 |

`scripts/verify.sh smoke` 已内置这套解析；手工跑时用仓库内 tsx，别用裸 `npx`
（缺包时会停下来等人确认，非交互环境直接挂住）。

## 7. agent 拿不到 `jsd_*` 工具（宿主侧 MCP 没注册）

症状：daemon 与插件都正常（`jsd_ping` 能回 `connected:true`），但 agent 的工具表里没有
`jsd_*`，`ToolSearch` 也搜不到。**这不是 MCP 服务端的问题**，而是宿主没把它注册进会话。
按这三步查（证据都在宿主日志里，不在 `/tmp/text-to-design-mcp.log`）：

```bash
HOSTLOG=~/.workbuddy/logs/$(date +%F)/           # 宿主日志目录
grep -h "doConnect\|MCP Security" "$HOSTLOG"*.log | tail -20
```

| 日志特征 | 根因 | 修法 |
|---|---|---|
| `doConnect FAIL: server=text-to-design error=spawn node ENOENT` | 宿主/CLI 进程的 `PATH` 里**没有 node**（GUI 应用不继承 fnm / nvm 的 shell PATH），而 `~/.workbuddy/mcp.json` 写的是 `"command": "node"` | 把 command 改成绝对路径：`/home/<user>/.workbuddy/binaries/node/versions/<ver>/bin/node`（随 WorkBuddy 自带的那个） |
| `[MCP Security] buildDesiredConfigs: skipping untrusted server "<name>" (hash: …)` | 自定义 MCP 的信任**按配置 hash 绑定**：改了 `~/.workbuddy/mcp.json`（command / args / type 任一）→ hash 变 → 之前点过的信任失效 | 到「连接器管理 → 自定义连接器」对该 server 点**信任**（UI 操作，agent 做不了） |
| `getConnectedServers()` 的 `allServers` 里该 server 一直停在 `connecting` | 上面两条之一的后果 | 修完前两条后**新开会话**——工具目录在会话初始化时注入，当轮会话不会自动补上 |

排查顺序建议：先看 ENOENT（PATH），再看 skipping untrusted（信任），最后确认会话是否新建。
改配置后顺手 `curl -s http://127.0.0.1:47820/health` 与
`tools/call jsd_ping` 各自确认 daemon / 插件仍在线——这两层出问题与工具注册无关，别混在一起查。
