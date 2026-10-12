---
"text-to-design-ui": patch
"text-to-design-mcp": patch
---

fix: 样式枚举拆出独立能力位，`get_page` 与 `jsd://styles` 按平台声明返空（见 0043）

0042 把样式枚举拆成了四次独立调用，但没解决根因：core 判断「能不能问样式」靠 `typeof host.getLocalPaintStyles === 'function'`，而即时设计**四个 getter 全都在** —— 只是引擎侧永不返回。存在性探测答的是「有没有这个东西」，而这里的问题是「问了没回音」，判据类型不对。

**本批把判据换成平台声明**：新增能力位 `styleEnumeration`（「能不能列出有哪些样式」），与既有的 `styles`（「能不能**按 id 应用**样式」）分开 —— 合成一位正是这次事故的机制：即时设计 claim 了 `styles` 且它真的能按 id 应用，于是「能列清单」被隐含出来，`get_page` 因此全废（25s `forward_timeout`）。

- **未声明 ⇒ 恒空，且一个 getter 都不调。** 闸在 `core/access.ts`（两个消费方共用：`list_styles` ← `jsd://styles`，`listDocumentAssets` ← `get_page`）。断言的是**调用记录** —— 只看返回值会放过「取回来再丢掉」，而那照样冻死线程。
- **变量面同规则**（用既有的 `variables` 位）：资源清单四个面此前是「两个靠声明、两个靠探测」，同一份清单两套判据，正是漏判的土壤。
- **能力表未注入时 fail-open**（退回 `typeof` 探测，沿 0002 与写路径同口径）。
- **空数组必须点名成因**（0007）：`jsd://styles` 回包加 `note`，`get_page` 的 `note` 多第三种来源 —— 「清单读不出来」不能被读成「文档里没有样式」。

平台声明：Figma / MasterGo 声明 `styleEnumeration`，即时设计只声明 `styles`。MasterGo 这一条**未真机验过**，是按现状声明（此前 MG 就是在枚举样式的，不为未验证的怀疑砍掉它的清单）—— 真机一测不对，改 `meta.ts` 那一行即可，机制不动。

**顺带清掉 0042 的探针**：`list_styles` 的 `kinds` 入参与单类资源 `jsd://styles/{kind}` 一并删除。它的存在前提是「还要靠分开问来定位哪一类坏」，而现在不该问的平台在能力闸处一个 getter 都不会调 —— 「按类少问」不再承载判断，长期养一个入口没有收益；真要取证，临时放开声明即可。四类仍保留为**四次独立调用**（任一类失败不连坐，这条独立成立），`STYLE_KINDS` 也留着 —— `styles[].type` 的取值域还需要它一处。

真机待验：① 即时设计上 `get_page` 与 `jsd://styles` 回到毫秒级且 `note` 点名；② MasterGo 上 `jsd://styles` 仍列得出样式。
