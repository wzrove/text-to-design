---
"text-to-design-ui": minor
"text-to-design-mcp": minor
---

feat(版本升级提示): 落后于 npm 最新版时,页头挂出升级入口,点开 Modal 给分步清单并支持复制给 AI 助手(见 0038)

**谁去查**:面板 iframe 直连 npm registry 在 Figma 上必被 `networkAccess` 白名单挡住(只有 localhost),jsDesign 未声明、MasterGo 无该字段 —— 所以改由 **daemon 代查**:`mcp-server/src/version-check.ts` 带超时与进程内缓存(查询周期 `VERSION_CHECK_MS`),结果经新的推送帧 `version` 发给面板,投递跟心跳(30s)、查询按缓存周期,故面板刚连上就能拿到结论而 registry 不被心跳打。查不到(超时/非 200/无 version)一律返回 `null` 并 warn —— **不提示**,宁可闭嘴也不给错的升级建议。

**比什么**:插件侧比自己(构建期 `define` 注入 `__APP_VERSION__`,比 `import package.json` 稳,避开 `resolveJsonModule`),服务侧比 daemon 自报的 status 帧版本;两侧独立,只升了一个也照常提示。比较走 `utils/version.ts` 的纯数字段比较(`0.9.0 < 0.10.0`),预发布后缀砍掉后与正式版同档。`latest` 为 `null` 的一侧不参与。

**入口**:只在确有新版本时挂载(沿页头「重连」钮的纪律:常态面板里一颗点不出东西的按钮是噪声),纯图标不带文字以免页头抖动;气泡走既有 `Tooltip`。Modal 用 daisyUI 的原生 `<dialog>`(要它的 top-layer 盖住 `z-50` 的 toast,顺带有原生 Esc),遮罩仍是真 `<button>` + `form method=dialog`,Esc/关闭后焦点归还页头那颗钮(与日志抽屉同一条纪律)。复制走既有 `copyWithToast`,指令里带上两侧当前版本与最新版本。

**不做**:不自动升级、不代跑命令、不做「忽略此版本」持久化、只认 `latest` dist-tag。
