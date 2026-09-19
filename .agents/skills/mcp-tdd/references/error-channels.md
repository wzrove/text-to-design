# 报错捕获通道

> 何时读：要判断某条报错该走哪条采集通道、排查「日志里没有 / 只有半截」的报错，
> 或要在服务端加日志埋点时。

两条通道互补,缺一条就有盲区。

## 通道 1 · agent 侧(`--channel agent`,默认)

**来源**:工具返回结果。

**触发判据**

- `isError: true` —— `bridgeTool` 的统一兜底产出,见
  `packages/mcp-server/src/core/registry.ts` 的 `catch` 分支 → `err(...)`
- `content[].text` 以 `错误: ` 开头 —— `err()` 拼出的用户可读文案
- 返回的结构化字段全是 schema 空形状(如 `created: []`)而 `isError` 缺失 —— 可疑,宁可记

**为什么必须存在**:直接 MCP 调用时,入参 schema 校验由 SDK 的 `validateToolInput`
在**进入工具回调之前**完成。校验失败时 SDK 直接构造 `isError` 响应,**不经过**
`executeTool` 的 try/catch,因此服务端日志里没有这条记录,通道 2 也抓不到。

**但别把这条当成铁律** —— `jsd_batch` 的内层调用绕开了 MCP 往返(见 `registry.ts`
里 `executeTool` 的注释:内层工具的 `inputSchema` 不生效,由 registry 自己的
`safeParse` 兜住),这条路径的校验失败**会**落日志。实测在真实日志里就捞到过:

```
[ERROR] 工具 jsd_platform_op 执行失败: 参数校验失败(jsd_platform_op): op: Invalid input: expected string, received undefined
```

结论:入参类错误可能只存在于通道 1,也可能两条都有。**通道 1 不能省。**

**代价**:依赖模型主动执行。为降低遗漏,任务收口后无条件补一次 `scan-log`。

**可选加固**:若宿主支持 PostToolUse 类 hook,可在 hook 里扫描工具输出中的
`isError`/`错误: ` 并自动调 `record`,把通道 1 从"靠纪律"变成"靠机制"。
具体 hook 配置方式随宿主而异,接入前先确认该宿主的 hook 事件名与传入字段,
不要照搬别的工具链的 schema。

## 通道 2 · 日志侧(`--channel log`)

**来源**:`/tmp/text-to-design-mcp.log`(路径由 `TEXT_TO_DESIGN_MCP_LOG` 覆盖)。

**格式**(见 `packages/mcp-server/src/logger.ts`):

```
2026-09-18T02:26:33.092Z [ERROR] [text-to-design-mcp] 工具 jsd_set_fill_color 执行失败: 参数校验失败(...)
```

采集器 `parseLogLine` 识别三种形态:

| 日志正文 | 提取出的 tool |
| --- | --- |
| `工具 <name> 执行失败: <msg>` | `<name>` |
| `工具 <name> 在当前平台不可用,已拦截` | `<name>` |
| 其它 | `(daemon)` |

**采集方式**:按位点增量(`docs/mcp-errors/.log-cursor.json` 记录已读 offset 与 inode)。
重复执行不会重复入账;文件被轮转/重建(长度回退或 inode 变化)自动从头开始。

下文 `$S` = `node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs`(从仓库根执行)。

```bash
node $S scan-log --run "$RID" --case <caseId>       # 默认只抓 [ERROR]
node $S scan-log --include-warn ...                 # 连 [WARN] 一起抓
node $S scan-log --keep-mirrors ...                 # 保留镜像行(排查用)
node $S scan-log --reset ...                        # 忽略位点,从头重扫
```

### 插件响应镜像行(默认跳过)

一次插件侧失败在日志里留**两行**,间隔约 1ms:

```
04:11:11.512 [ERROR] 响应: r751 find ok=false 耗时=43ms error=find 失败: in get_variantGroupProperties: ...
04:11:11.513 [ERROR] 工具 jsd_find 执行失败: find 失败: in get_variantGroupProperties: ...
```

第一行来自 `src/pending.ts`(插件回了 `ok=false`),第二行来自
`core/registry.ts` 的 catch。同一件事,**第二行才是采信对象**:

- 带 `jsd_*` 工具名;第一行只有插件方法名(`find`),而方法是多工具共用的,反查不唯一
- 第一行含请求号(`r751`),会让每条失败各自成一条指纹,把待办列表撑爆

所以 `scan-log` 默认丢弃镜像行。实测在 2075 行真实日志上:43 条 ERROR → 跳过 19 条镜像
→ 24 条命中 → 归并成 **10 条**不同指纹。不跳过的话是 29 条,一半是噪声。

排查镜像行本身时才用 `--keep-mirrors`(例如怀疑"插件回了失败但工具层没记")。

**默认只抓 ERROR 的理由**:WARN 噪音大(`插件通道被新连接顶替`、`同步清单失败`等)。
但两类高频问题恰恰是 WARN 级,排查相关症状时要显式打开 `--include-warn`:

| WARN 文案 | 出处 | 含义 |
| --- | --- | --- |
| `请求超时: <id> <method> 耗时=<n>ms` | `src/pending.ts` | 插件执行超时(默认 30s) |
| `请求被拒(插件未连接): <method>` | `src/bridge.ts` | 工具目录没门控住,插件实际不在线 |

**为什么它是兜底**:它不依赖模型纪律,但覆盖面窄于通道 1。两个已知短板:

1. 落盘被 `TEXT_TO_DESIGN_MCP_LOG_LEVEL` 门槛过滤(默认 `info`,ERROR/WARN 恒过)。
2. **错误文案被截断到 200 字符** —— 见 `registry.ts` 的
   `msg.slice(0, 200)`。长文案在日志里不完整,**原始全文只存在于通道 1 的记录里**。

因此遇到截断(`...` 结尾)时,以 agent 侧记录为准。

## 通道选择速查

| 症状 | 用哪条 |
| --- | --- |
| 工具返回报错,任务继续不下去 | 通道 1,立即 `record` |
| 参数明明写错却被放过 / 改对参数就好了 | 通道 1(SDK 校验,通道 2 抓不到) |
| 任务看起来成功但画布没动静 | 两条都跑:通道 2 的 ERROR 段 |
| 某工具卡住很久然后失败 | 通道 2 + `--include-warn`(超时是 WARN) |
| daemon 起不来 / 端口冲突 | 通道 2(ERROR),verdict 判 `environment` |
| 任务收口后想确认没漏 | 通道 2 无条件跑一次 |

## 加日志埋点时的注意

要在服务端新增可观测点时,遵循仓库既有纪律(`logger.ts` 顶部注释):

- 用 `error()` / `warn()` 分级,别用 `console.*` —— daemon 是 detached 且 stdio 被
  ignore,stdout/stderr 不可见,只有落盘日志能留痕。
- `setLogSink` 的实现里**不得**再调 `log*`,否则递归。
- 想让某类报错被本 skill 自动采集,文案请保持可解析:优先
  `工具 <name> 执行失败: <原因>` 这个既有前缀。新造的格式要在 `parseLogLine`
  里补匹配规则,否则会掉进 `(daemon)` 兜底桶。
