# 0039. website 多语言沿用 0016 口径：locale 由 Solid context 显式提供，不引库也不做 /en/ 预渲染

- **日期：** 2026-10-11
- **状态：** 已采纳
- **影响范围：** `packages/website/`（新增 `src/i18n/`（`locale.tsx`、`messages.zh-CN.ts`、`messages.en.ts`）、`src/content.ts` 文案迁入字典、`src/components/*` 全部改为经 `useLocale()` 取文案、`Header.tsx` 加语言切换、`index.html` 的 `lang`/`title`/`description` 运行期改写）
- **相关记录：** 口径承 0016（语义键 + 参数、默认取 `navigator.language`、显式选择优先且持久化、不引 i18n 库）；「一类文案一个 owner 文件」承 0007；「静态字典集中放一处」承 AGENTS.md（本包自用字典落 `website/src/`，不进 `shared/src/dicts` —— 见候选表）

## 压力

1. **文案是内联硬编码**：`content.ts` 与 9 个组件里全是中文字面量，加第二语言等于把每处抄成两份，
   且抄漏一处不会报错、只会静默混语言。
2. **有一类事实本身就随语言变**，不是翻译问题：hero 与安装段里点名的 AI 助手，中文读者给
   Qoder / WorkBuddy / 豆包，英文读者给 Codex / Claude Code / opencode；安装提示词整段也要按语言给
   不同工具名。这类内容必须走同一套字典，否则会变成组件里的第二个 `if (locale)`。
3. **运行环境换了**：0016 的载体在 `shared/dicts/i18n`，那是三侧（shared / mcp-server / ui）共用的
   契约层；website 是独立分包、产物是静态站点，把营销文案塞进 `shared` 等于让 npm 包背上官网文案。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 语义键字典 + 入口解析一次 + context 显式传值 | 采用（主） | 与 0016 同口径；Solid 的 `createContext` 就是框架自带的 DI 作用域，不新增模式 |
| 字典放 `packages/shared/src/dicts/i18n/` | 排除 | `shared` 是平台无关的插件契约包（zod 线格式 + DesignHost），官网文案进它就会被 `text-to-design-shared` 的发布者背走；website 与插件运行期无依赖关系 |
| i18next / formatjs / `solid-i18n` | 排除 | 两套 locale、无复数/性别/ICU 需求（0016 同判）；库只加包体和一层 API |
| 每个组件收 `locale` prop 直传 | 排除 | 9 个组件 × 逐层转发，纯样板；context 一处装配即可 |
| 构建期出 `/index.html` + `/en/index.html` 两份预渲染 | 排除（本次不做） | 静态托管下 en 才有独立 URL 与 og 标签，但要改 vite 多入口、每个组件收 locale 参数；用户 2026-10-11 定案先要单页客户端切换。留作退出条件 |
| 运行期热切换 | 采用 | 与 0016 相反：这里没有「对外契约中途变更」的问题，切语言只是重渲染，正是 Solid 的原生行为 |
| `document.lang` / `title` / `description` 交给字典出口 | 采用 | 单页切换后 `<html lang>` 与 meta 必须跟着改，否则读屏与浏览器按 zh 念英文页 |

## 结论

**不引入模式与库。** 文案抽成两份纯数据字典（`messages.zh-CN.ts` 为键真源，`messages.en.ts` 用
`satisfies typeof zh` 让漏译变编译错），locale 只在入口解析一次（显式选择 > `navigator.language` > `zh-CN`），
经 Solid context 显式提供，文案只在组件出口渲染；`<html lang>`、`title`、`description` 作为第二个出口随 locale 同步。
AI 助手名单与安装提示词按 locale 取值，不在组件里写分支。

## 实施方案

- **目标形状（全量）**：`website/src/i18n/locale.tsx` 持 `Locale` / `normalizeLocale` /
  `resolveLocale({ stored, navigatorLanguage })`（纯函数）/ `LocaleProvider` + `useLocale()`；
  字典 `messages.<locale>.ts` 同形状，键按区块分组；`content.ts` 只留语言无关的事实
  （仓库/Releases 链接、manifest 路径、端口、命令），语言相关文案全部迁进字典。
  装配点在 `main.tsx`（`LocaleProvider` 包 `App`），解析在 provider 内做一次并写 `localStorage`。
- **本次不做**：`/en/` 预渲染与 hreflang、更多 locale、字典热加载、把字典搬到 `shared`。

## 成本与退出条件

- 成本：多一层 context 与两份字典文件；静态站点的 en 文案不被搜索引擎独立收录（单页客户端切换的固有代价）；
  字典漏译由 `satisfies` 在 `pnpm typecheck` 阶段拦。
- 退出条件：① 需要 en 独立收录 / 分享卡片按语言出图 → 上 vite 多入口预渲染，context 装配点不变，
  只把「入口解析」从浏览器换成构建期注入；② 出现第三 locale → 键结构不变，加 `messages.<lang>.ts`；
  ③ 若某条文案同时被插件与官网需要 → 再单独评估上移 `shared`，不整体搬。

## 验证

- 不变量测试：`tests/website-i18n.test.ts` —— 两份字典的**叶子键集合相等**、无空串。字符串数组
  （`hero.steps`、各平台 `steps`、逐字动画用的 `titleChars`）折成一条比 —— 按语言拆字天然不等长；
  对象数组仍逐条比，漏一条会红。另有 `normalizeLocale` 对 `zh` / `zh-TW` / `zh_Hans` / `en-US` /
  `EN` / 未知语种 / `undefined` 的归一化，和 `resolveLocale` 优先序（stored > navigator > fallback）。
- 边界/并发/重试用例：无（纯静态站，无并发面）。
- 指标与日志：无。
- 不做「组件里不得出现中文字面量」这类源码扫描 —— 它会把 `docs/` 等并行改动的文件一起卷进来，
  红得没有信息量；键集合相等已经能拦住漏译。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-11 | 官网需支持 en，且 AI 助手名单按语言分流 | 初次决策：沿用 0016 口径，不引模式不引库，context 显式传值 |
| 2026-10-11 | 首跑 `pnpm test` 两条红 | 结论不变，是**测试写错了**：把数组下标当键对账，而 `titleChars` 中文 3 字 / 英文 7 字母本就不同长、英文标题里的空格被判成空串。改成字符串数组折成一条比 |
