# 0038. 版本升级提示：daemon 代查 npm latest，页头条件挂载升级入口，Modal 给分步清单与复制给 LLM

- **日期：** 2026-10-10
- **状态：** 已采纳
- **影响范围：** `shared/version-channel.ts`（新）、`mcp-server/{version-check.ts（新）,bridge.ts,daemon/run.ts}`、`ui/vite.config.ts`、`ui/src/bridge/{router.ts,BridgeSocket.ts,types.ts,useBridge.tsx}`、`ui/src/{App.tsx,utils/version.ts（新）,components/{UpgradeButton,UpgradeModal}.tsx（新）}`、`shared/dicts/i18n/messages.{zh-CN,en}.ts`
- **相关记录：** 0014（浮层不进流）、0015（浮层抬高窗口下限）、0016（i18n 键化）、0037（页头提示走 Tooltip、操作结果走 toast）、0007/0013（不允许静默失效）

## 压力

1. **版本事实运行时不可见**：ui 的版本只存在于 `packages/ui/package.json`，构建没有 `define` 注入，运行时拿不到；daemon 版本只在 `status` 帧里（`shared/connection.ts:21-25`）。用户无从知道本地装的插件/服务是不是落后于 npm 上的最新版。
2. **新增一条跨进程通道 + 一次真实外网调用**：要动 shared（协议）、mcp-server（查询与推送）、ui（构建注入 + 桥 + 两个组件）、i18n 两表，跨 ≥4 处；且引入周期性的后台查询，得先定缓存与失败语义。
3. **宿主网络白名单是硬约束**：`ui/scripts/vite-plugin-manifest.ts:31-48` 里 Figma 的 `networkAccess.allowedDomains` 只有 `localhost`，面板 iframe 直连 `registry.npmjs.org` 必被拒；jsDesign 未声明、MasterGo 无该字段。所以「谁去查」不是偏好问题，是可行性问题。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| Proxy（daemon 作远程替身代查） | 采用 | 面板侧唯一可用网络是连本地 daemon 的 WS（47812）；daemon 是 Node 进程，无宿主白名单限制，且已有 HTTP/WS 服务与推送通道 |
| Strategy（查询源可切换：直连 / daemon 代查） | 排除 | 只有一个可用实现，且直连在 Figma 恒失败。为不存在的第二实现付接口成本，命中 SKILL「停止条件」第 1 条 |
| Retry（registry 瞬态失败重试） | 排除 | 版本检查是幂等读，**失败的后果是「不提示」而已**，不是功能受损；daemon 每周期都会重查，天然是自愈的，不需要重试预算 |
| Observer / Domain Event（版本变化广播给多消费者） | 排除 | 消费者只有一个（面板），一次直接回调就够，事件总线是白付的间接层 |
| 保持简单：构建期把 latest 写死进包 | 排除 | 版本号随时间失真，会给出与当天事实相反的建议——这不是「更简单」，是错的 |

## 结论

**不引入模式。** daemon 侧一次 npm registry 查询 + 进程内 TTL 缓存，结果随连接推一帧 `version` 给面板；面板拿**构建期注入的自身版本**与 **status 帧里的 daemon 版本**各自比对，任一侧落后才在页头挂载升级入口；Modal 复用仓库浮层三点式约定（遮罩是真 `<button>` / Esc 收口在 App / 关闭后焦点归还触发器），容器用 daisyUI `modal` 的 `<dialog>`（要它的 top-layer 与原生 Esc）。

## 实施方案

- **目标形状（全量）**
  - `shared/version-channel.ts`（新，照 `camera-lock.ts` 的旁路消息形状）：`NPM_PACKAGES`（两个包名）、`REGISTRY_LATEST_URL`、`VERSION_CHECK_MS`、`VersionPushFrame { type:'version'; latest:{ ui:string|null; mcp:string|null } }` + `isVersionPushFrame` 守卫。放 shared 因为两侧共用同一份事实（daemon 发、面板收），沿 0008/0009「一个事实一份」。
  - `mcp-server/src/version-check.ts`（新）：`fetchLatest()` —— `fetch` + `AbortController` 超时，结果按 `VERSION_CHECK_MS` 缓存；**永不抛**，失败/超时/非 200 返回 `null` 并 `warn`（沿 0007：不静默失效，留痕）。
  - `mcp-server/src/bridge.ts`：加 `pushVersion(frame)` —— 在线直推，离线**丢弃不排队**（版本提示不是日志，重连后下个周期自会补上；排队回放会把陈旧结论灌给新面板）。
  - `mcp-server/src/daemon/run.ts`：三个触发点 —— **启动预热缓存**、**面板连上立刻推**（新开钩子 `onPluginConnect`，不复用 `onConnectionChange` 那个已被平台状态占用的单槽）、**心跳兜住会话中途发版**。查询频率由缓存守，投递跟心跳。
  - `ui/vite.config.ts`：UI 分支加 `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`（比 `import package.json` 稳，避开 `resolveJsonModule`），并在 `vite-env.d.ts` 声明类型。
  - `ui/src/bridge`：`router.onWsText` 认 `type==='version'` → `onVersion` 回调；`BridgeSocket` 转成 `BridgeEvent{type:'version';latest}`，同时把 status 帧里的 daemon 版本存下来暴露为 `serverVersion`（比较发生在面板，daemon 不需要知道面板版本）；`useBridge.tsx` 增 `latest` / `serverVersion` 两个 accessor。
  - `ui/src/utils/version.ts`（新）：`isOutdated(current, latest)` —— 纯函数，逐段数字比较（要正确处理 `0.9.0 < 0.10.0`），`latest` 为 `null` / 不可解析时返回 `false`（**拿不到事实就不提示**，与「静默失效」相反的那半条：宁可不报，不报错的结论）。
  - `ui/src/components/UpgradeButton.tsx`：`<Tooltip align="end">` 包 `btn btn-ghost btn-xs px-1` 纯图标按钮，**仅当任一侧落后时挂载**（沿 App.tsx:114-121 的纪律：常态面板里一颗永远不可用的按钮只是噪声）。
  - `ui/src/components/UpgradeModal.tsx`：daisyUI `modal` + `modal-box`，列「当前版本 / 最新版」与分步升级清单，一个「复制给 LLM」按钮走既有 `copyWithToast`（沿 0037）。遮罩用真 `<button>`，Esc 与焦点归还沿用 `App.tsx` 对 logOpen 的那套收口。
  - i18n：新增 `upgrade.*` 键（zh 是真源、en 必须真译，`UNTRANSLATED_BASELINE=0`）。
- **本次不做**
  - 不自动升级、不代跑命令（只给指令 + 复制）。
  - 不做「忽略此版本」的持久化。
  - 只认 `latest` dist-tag，不看预发布 / `next`。
  - 面板不直连 registry（即便 jsDesign / MG 可能放行，也不开这个分叉）。
  - 不做手动刷新按钮（连上后每周期自动重推）。

## 成本与退出条件

- 成本：一次外网调用（每进程每 `VERSION_CHECK_MS` 一次，失败静默留痕）、一个推送帧类型、一个后台 interval、构建期一个 `define`、面板两个组件与两个 bridge accessor。无新增持久化、无新依赖。
- 退出条件：① 宿主放开面板外网（Figma `networkAccess` 放行 registry，或宿主提供版本 API）→ 删 `version-check.ts`、推送帧与 daemon interval，改面板直查；② 版本来源改为宿主 manifest → 同上三处一并删。回退路径是**删文件 + 摘页头那颗按钮**，不留兼容层。

## 验证

- 不变量/单测：`isVersionPushFrame` 守卫边界（照 `packages/shared/src/__tests__/camera-lock.test.ts`）；`isOutdated` 的 0.9.0 vs 0.10.0、相等、`latest=null`、非法串四类。
- 门禁：`tests/i18n.test.ts`（键集一致 / 占位符一致 / 未译基线 0）、`pnpm typecheck`、三平台构建。
- 真机：连上 daemon 后页头出现升级钮 → 点击开 Modal（版本号与步骤对）→ 复制按钮出 toast → Esc 关闭且焦点回到该钮；断开 daemon 后按钮消失（无 latest 不提示）；registry 不可达时全程无按钮、daemon 日志有 warn。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-10 | 初次决策 | 采用「daemon 代查 + 推送帧 + 面板条件挂载 + daisyUI Modal」；不引入模式（Strategy / Retry / Observer 均排除） |
| 2026-10-10 | 「面板打开时能不能立刻查一次」 | 结论不变，只补投递时机：加 `onPluginConnect` 钩子在连接建立时立刻推，并在 daemon 启动时预热缓存（原来首个心跳前最多要等 30s）。不复用 `onConnectionChange` —— 那是单槽，已被平台状态刷新占用 |
