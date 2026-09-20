---
"text-to-design-ui": minor
---

feat: 日志改为按需抽屉、面板高度改为贴合内容

两件事一起做，因为前者直接制造了后者要解决的问题：日志不再占位之后，固定 520 的面板底部空出一大片。

**日志：常驻面板 → 按需抽屉**

日志是纯诊断信息，却拿了主视线资源：原 `LogPanel` 挂 `flex-1`，在面板里常态吃掉一半以上高度，且与「选中节点」同级做成了实心卡（`border` + `shadow-sm` + `bg-base-100`），顶上还有一排 4 个过滤按钮，空态是一个 emoji 加两行文案。

- 出口改成 header 上的幽灵图标（`LogTrigger`）：无文字、`/50` 灰，只在有未读 error 时染成 error 色并露出条数。
- 打开时从底部滑出固定 `72%` 高的抽屉（`LogDrawer`）；默认档位由 `info+` 提到 `warn+` —— 健康状态下打开就该是空的，满屏 info 只是把「太显眼」换了个地方犯。
- 未读水位按**错误条数累计**记，而不是最大 id：同一行日志会被 `pushLog` 合并成计数（id 不变），按 id 记会让复发的同一错误永远不算未读 —— 偏偏复发才最该被看见。清空后水位随之归零。
- 可达性：`role=dialog` + `aria-modal`；ESC 与点遮罩都能关（遮罩用真 `button`，键盘可达且不必给 `div` 挂 `onClick`）；关闭后焦点还给入口钮；新错误数经 sr-only live region 播报；`prefers-reduced-motion` 下入场动效由全局兜底压掉。

**面板高度：固定 520 → 贴内容（宿主支持时）**

宿主 `ui.resize` 两平台都有（Figma `figma.ui.resize`、jsDesign `UIAPI.resize`），但 `showUI` 不接受 `height: 'auto'`，所以「自动高度」只能是由 UI 量出来再推给窗口。见 `docs/design-decisions/0014`。

- 尺寸常量、夹取函数与两条旁路消息收进 `shared/src/panel.ts`；旁路消息**不进 `PluginRequest` 契约**（那条契约的 schema 给 MCP 工具用、会进工具目录，改高度不过 MCP）。
- code 侧用 `ui_env` 上报「`typeof host.ui.resize === 'function'`」，UI 据此二选一：有则窗口贴内容；**没有则退回「选中节点吃满剩余高度」**（`SelectionCard.fill`），与历史行为一致。缺消息按「没有」处理。
- 防抖与夹取：测量值只在变化 ≥ 8px 时才发，且**向上**吸附到该步长；取整固定**向上**并留 1px 余量，`html/body` 再加 `overflow: hidden` —— 三者共同保证「请求高度 ≥ 内容高度」。差一点点都不行：窗口只要比内容矮，视口就冒出 Scrollbar → 内容宽度少 4px → 中文重排 → 内容变高 → 再请求 → 滚动条消失 → 变矮……这条回环的表现就是面板持续抖动。触发源是 `ResizeObserver` 而不是 `selectionchange` —— 后者高频，窗口会跟着每次画布点选变高变矮。
- 面板高度**只由内容决定**：开合日志抽屉不改变窗口尺寸（抽屉自己取窗口的 85%）。抽屉同时由 `absolute` 改 `fixed`：自适应下根元素高度即内容高度，按根元素定位会矮一截，遮罩外会露出未变暗的那部分。
- `index.css` 给 `html/body` 补上主题底色，窗口暂高于内容时露出的那一段与面板同色。

文件：`LogPanel.tsx`（删）→ `LogDrawer.tsx`、`LogTrigger.tsx`、`PanelHeightSync.tsx`（新）；`App.tsx` 收口布局二选一与未读水位；新增 `shared/src/panel.ts`、`ui/src/bridge/codeChannel.ts`（信封单点，此前 `router.ts` 手写两遍）。`COLORS.md` / `tailwind.config.js` / `router.ts` / `CapabilityCard.tsx` 的 `LogPanel` 指路注释同步更名。
