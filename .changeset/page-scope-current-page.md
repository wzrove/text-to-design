---
"text-to-design-ui": patch
"text-to-design-mcp": patch
---

fix: 跨页读按平台声明收口 —— 读不到非当前页的平台只扫当前页（0039 修订，两轮真机实测）

即时设计真机跑了两轮（每轮都 `pnpm build` + 重载插件）：

| 请求 | 第一轮（0043 后） | 第二轮（按符号收口） | 第三轮（按能力声明收口） |
|---|---|---|---|
| `jsd_ping` | 5ms | 22ms | 16ms |
| `jsd://styles` | **11ms**（原 25008ms 超时） | — | **8ms** |
| `jsd_find` 当前页 | 44ms | 44ms | — |
| `jsd_find scope=document` | 25425ms / 25466ms `forward_timeout` | 25008ms `forward_timeout` | **25ms**，带「已退回当前页」note |
| `jsd_get_page` | 25634ms `forward_timeout` | 25016ms `forward_timeout` | **42ms** `ok=true` |

第三轮 `get_page` 的真实回包：当前页 14 个顶层 FRAME（id/名称/类型/宽高/x/y）+ `assets` 四键（本平台样式/变量读不出，恒空）+ `pages` 一条 + 两句 `note` 点名成因。

样式那一半已经修好（0043：`jsd://styles` 11ms 返空带 `note`），但 `get_page` 仍然挂 —— **卡点是跨页读**：当前页 find 只要 44ms，跨页必挂 25s。0039 那句「jsDesign 无 dynamic-page、文档常驻，直接遍历即可」不成立。

**第一版判据（有没有 `loadAllPagesAsync`）被真机推翻**：按符号收口后 `find scope=document` 照样 25008ms 超时。原因和 0042 的样式 getter 是**同一个坑** —— jsDesign 的 host 是 `Object.create(native)`，typings 里没有的符号运行时照样透出来，于是 `loadAllPagesAsync` **存在且永不返回**。

**最终判据**：新增能力位 `documentScopeRead`（形制同 0043，只收平台声明）。未声明 ⇒

- `get_page` 的资源清单与 `pages` 元数据**只覆盖当前页**；
- `jsd_find scope=document` **退回当前页**；
- **连 `ensurePagesLoaded` 都跳过**（它 await 的正是那个永不返回的调用）；
- 以上都在 `note` 里点名（「不等于文档只有一页」）。

判据放在**调用前**，不是 try/catch —— 同步调用不可中断，失败根本走不到 catch。Figma 声明（真有 dynamic-page 且会返回）；即时设计 / MasterGo 不声明（MG 未真机验，按保守默认收口，验过能跨页再放开这一位）。

新增 4 例单测（`document-scope.test.ts`），断言的是**遍历了哪些页**而不是返回值；假宿主刻意把 `loadAllPagesAsync` 做成「符号在」（真机上它永不返回），用例验的是闸门而不是挂死。
