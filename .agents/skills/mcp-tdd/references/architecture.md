# 架构：代码究竟在哪执行

> 何时读：要查「某个文件属于哪一层、改完要不要重载插件」时。

## 进程模型

```
AI 会话 ──stdio──> shim ──HTTP(localhost)──> daemon ──WS(47812)──> 插件进程 ──> 即时设计引擎
                                  │
                          packages/mcp-server        packages/ui（跑在即时设计客户端内）
```

- **daemon**（`packages/mcp-server`）是**转发器**：收 MCP 调用 → 经 WS 发给插件 → 回传结果。
- **真正的工具逻辑**在 `packages/shared/src/core/`，但**由插件进程执行**，
  分发入口是 `packages/ui/src/code/plugin.ts`。
- **每个 AI 会话拉起一个 shim**（stdio ↔ HTTP 代理）；daemon **全局唯一**。
- 端口：WS `47812`、MCP HTTP `47820`。daemon 侧常量为
  `packages/mcp-server/src/config.ts` 的 `PORT` / `HTTP_PORT`
  （分别由 `TEXT_TO_DESIGN_MCP_PORT` / `TEXT_TO_DESIGN_MCP_HTTP_PORT` 覆盖）；
  插件侧同值常量在 `packages/shared/src/index.ts` 的 `WS_PORT`，被
  `ui/scripts/vite-plugin-manifest.ts` 写进 manifest 的 allowedDomains——
  改端口要两处一起改。
- 日志：`/tmp/text-to-design-mcp.log`。

## 两条铁律

1. 改 `shared/` 或 `ui/` → **必须** `pnpm build` + 在即时设计里**重载插件**。
   仅重启 daemon **完全无效**——插件仍跑旧产物，报错一字不差。
2. 改 `mcp-server/` → 重启 daemon 即可（下次调用时 shim 自动接管）。

## 构建与重载

```bash
cd /path/to/js-app && pnpm build          # ui build + mcp-server build
pnpm -r run typecheck                     # 三包 tsc --noEmit
pnpm exec biome check <changed files>     # 只 lint 改动文件，别跑全仓
```

然后在即时设计客户端：`插件 → 开发 → 重新运行`，加载
`packages/ui/dist/jsdesign/manifest.json`。

## 跑 tsx 脚本：用仓库内的，别用裸 `npx`

`npx` 在包缺失时会问 `Ok to proceed? (y)` —— 非交互环境里会**直接挂住**。
仓库已装 `tsx`，直接用本地 bin：

```bash
# 冒烟
cd packages/mcp-server && ./node_modules/.bin/tsx smoke-split.ts
# 定点测试
./node_modules/.bin/tsx /tmp/xxx.ts
```

从仓库根跑用 `packages/mcp-server/node_modules/.bin/tsx`。
实在要用 npx 就加 `--no-install`：缺包时**快速失败**而不是停下来等人回答。
`scripts/verify.sh` 已按此顺序解析 tsx，找不到时报错并提示 `pnpm install`。

## 各层职责与文件地图

| 层 | 目录 | 职责 | 改完要做什么 |
|---|---|---|---|
| 算法/核心 | `packages/shared/src/core/` | 坐标与尺寸计算、编组、增删改、序列化 | build + 重载插件 |
| Schema | `packages/shared/src/schemas/` | 入参 schema、`PROP_METHOD_FIELDS`、平台能力 | build + 重载插件 |
| 插件分发/透传 | `packages/ui/src/code/plugin.ts` | `switch(msg.method)`，把参数透传给引擎 | build + 重载插件 |
| 平台适配 | `packages/ui/src/code/jsdesign/`、`code/figma/` | host、host 能力 | build + 重载插件 |
| 桥与传输 | `packages/mcp-server/src/bridge.ts`、`transport.ts`、`pending.ts` | WS 收发、二进制帧、超时与错误上下文 | 重启 daemon |
| daemon | `packages/mcp-server/src/daemon/` | probe / run / proxy / spawn，探活与替换 | 重启 daemon |
| 工具与提示词 | `packages/mcp-server/src/tools/`、`server.ts` | 工具注册、schema、`INSTRUCTIONS`、prompts | 重启 daemon |
| 冒烟 | `packages/mcp-server/smoke-split.ts` | 入参→下发 method/params 的断言 | 用仓库内 `tsx` 跑（见下），别用裸 `npx` |

`shared/src/core/` 主要文件：`buildNode.ts`（创建）、`nodes.ts`（节点操作/坐标）、
`update.ts`（属性写入选址与 warnings）、`component.ts`（组件/变体）、
`serialize.ts`、`execute.ts`、`normalize.ts`。

## 一个 bug 常横跨两层

例：`jsd_group_nodes` 编组报 NaN —— 需**同时**修 `shared/src/core/nodes.ts`
（有限性兜底）与 `ui/src/code/plugin.ts`（布局参数透传）才生效，只修一侧现象完全不变。
排查时**默认怀疑两层**，别只盯一处。
