# e1e66f0a. 样式枚举选路按平台声明：新增 styleEnumerationSync，不靠 ?. 探测

- **日期：** 2026-10-15
- **状态：** 已采纳（三包类型检查通过 + `list-styles.test.ts` 7 例通过；**端到端真机已验（2026-10-15，重载后）**：`jsd_ping` capabilities 含 `styles` + `styleEnumeration` + `styleEnumerationSync`；`jsd://styles` 毫秒级列 7 条（6 PAINT + 1 TEXT）；`jsd_get_page` 的 `assets.styles` 同为 7 条，`note` 里「未声明本地样式枚举能力」那句已消失）
- **影响范围：** `shared/`（`dicts/capability.ts` 新增 `styleEnumerationSync` 位、`dicts/i18n/messages.{zh-CN,en}.ts` 各一键、`core/access.ts` 的 `preferSync` 选路、`__tests__/list-styles.test.ts` 补 2 例）、`ui/`（`code/jsdesign/meta.ts` 声明该位）
- **相关记录：** 0010（异步优先）、0011（Access 层收口）、0022/0032（平台事实只落声明表，core 不猜平台）、0002（未注入能力表时 fail-open）、0042（按类拆分；其机制描述已由本批更正）、0043（`styleEnumeration` 能力闸；机制描述同批更正）

## 压力

**0043 把 `get_page` 从 25s 挂死救回来了，但救成的是「恒空」—— 止损，不是修复。**

0043 的闸让未声明 `styleEnumeration` 的平台一个 getter 都不调，即时设计上 `jsd://styles` 从 25008ms 超时变成 11ms 返空带 `note`。可「恒空」是假的：真机（2026-10-15）四类同步 getter **直接调全部 0~1ms 正常返回**，数据正确（PAINT 6 / TEXT 1 / EFFECT 0 / GRID 0）。⇒ 这一面在即时设计上**本来就能列出**，只是没人问过它。

代价是实打实的：`assets.styles` 与 `jsd://styles` 是 0039 定下的**设计前复用判断**依据 —— 恒空等于告诉调用方「这个文档没有可用样式」，于是本可复用的颜色/文本样式只能靠新建绕过，正是 0039 要根治的那类问题。而 0043 的 `note` 只是把谎言说破了，没有把答案找回来。

真因在**选路**，不在「能不能问」。`listStylesAsync` 按 0010「有 async 就用 async」：每类先取 `host.getLocal*StylesAsync?.bind(host)`，`?.` 成立就 `await`，**只有该成员不存在时才退同步 getter**。而即时设计：

```
typings（plugin-api.d.ts:95-98）  只有四个同步版，没有 *Async
运行时（Object.create(native)）   四个 *Async 都透出来，typeof === 'function'
⇒ ?. 判断成立 → await asyncGet() → await 一个永挂的 Promise → 25s forward_timeout
⇒ 同步 getter 从头到尾没被调用过 —— 而它完全可用（0~1ms，数据正确）
```

同样是「typings 里的『没有』≠ 运行时里的『没有』」。`documentScopeRead` 那条（`loadAllPagesAsync`，见 0039 修订）是同一模式的第二次出现 ⇒ 这是**一类**判据错误，不是一次手滑。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 新增 flow 能力位 `styleEnumerationSync`：声明 ⇒ 只问同步入口 | 采用 | — |
| core 里维护一份「不可信的 async 符号名」排除清单 | 排除 | 符号名单是**第二份平台事实**：core 不认识平台、也不该认识（0022/0009），且下次引擎再换符号照样漏。真源已经是 `ui/src/code/<平台>/meta.ts` 的 `capabilities` |
| 给 `await` 加 `Promise.race` 超时，超时后回落同步入口 | 排除 | ① 超时只是**放弃这次调用**，25s 已经花掉（可用答案就在 0~1ms 外的同步入口上，不该先付 25s）；② 引入时间耦合：阈值取多少都没有依据，而声明是**当场**就知道的；③ `probe-ops.ts` 的 `asyncCall` 正是用 race 取证的 —— 取证工具不是产品路径 |
| 反过来一律同步优先，async 只作兜底 | 排除 | Figma 的 dynamic-page 下同步入口**必抛**（0011），四类的 async 是唯一入口。把默认倒过来会把 Figma 弄坏，等于换一边栽 |
| 在 host 门面里不投影 `*Async`（让 `?.` 自己落空） | 排除 | 门面是 `Object.create(native)` 的**被动透出**，不是投影白名单（0017 的形制）。为躲一个坏符号改成白名单，会把其他「未声明但可用」的原生成员一起挡掉，并改掉门面本身那条纪律 |
| 删掉 async 分支，只留同步 | 排除 | 同上：Figma 只能走 async。两条路都还得在，要换掉的是**谁来决定走哪条** |

## 结论

**不引入模式。** 加一个 flow 能力位 `styleEnumerationSync`（「本平台的样式枚举走**同步**入口」），选路由声明决定，与 0043 的闸串成两级判据：

1. `styleEnumeration`（0043）：**能不能问** —— 未声明 ⇒ 恒空，一个 getter 都不调；
2. `styleEnumerationSync`（本条）：声明 ⇒ `preferSync`，**只调同步入口，`*Async` 一次都不碰**；未声明 ⇒ 维持 0010 的 async 优先（Figma：dynamic-page 下同步入口必抛）；
3. 能力表未注入（`ctx.capabilities == null`）⇒ fail-open，沿用 `typeof` 探测（沿 0002，与写路径同口径）。

两个平台细节钉死：

- **声明了 sync 就没有 async 兜底**（fail-closed）：该位的语义是「同步入口是这一面唯一可信的路」；若哪天同步版也不存在，这一面就是没了 —— 退去问 async 等于主动回到那条永挂的路。
- **不声明 ≠ 走 async 一定安全**：只表示「本平台没有证据说 async 不可用」。MG 不声明这一位，而它的门面是**逐成员投影**（不是 `Object.create` 透出），`*Async` 本来就不在 host 上 ⇒ `?.` 自然落空、走同步（2026-10-14 真机：`assets.styles` 列得出来）。这份「刚好没事」不能反过来当成判据。

改的是**声明**，不是机制：0043 的闸、`GATED_SURFACES`、`note` 通道一行未动。

## 实施方案

- **目标形状**
  - **依赖方向**：平台专属事实仍在 `ui/src/code/<平台>/meta.ts` 的 `capabilities`；core 只认 `RuntimeContext`，不读平台名（沿 0022）。
  - **单点选路**：`core/access.ts` 的 `listStylesAsync` —— 两个消费方（`core/export.ts` 的 `list_styles` ← MCP 的 `jsd://styles`；`core/assets.ts` 的资源清单 ← `get_page`）共用这一处，`preferSync` 只在这里判一次。
  - **扩展点**：将来再有「两条入口、该走哪条」的面，加一位 + 在选路处加一行；闸与 note 通道不动。
- **本批做**：能力位 + 两语言 label + `preferSync` 选路 + jsDesign 声明 + 2 例单测（声明 ⇒ `asyncCalls` 为空；未声明 ⇒ 仍优先 async，Figma 语义不动）。
- ~~**本批不做**：① 把同一判据推广到 `resolveOne` 的 `getNodeByIdAsync` / `resolveMainComponent` 的 `getMainComponentAsync`~~ **① 已于 2026-10-19 做掉**（`mainComponentSync`，形状与本条一致；`getNodeByIdAsync` 那半**仍然不做** —— 即时设计上 `find` 一直是毫秒级，没有它挂的证据）：证据见「变更历史」末两行；② 给 async 分支加 race 超时（见候选表）；③ MG 声明这一位（它的 `?.` 本来就落空，声明了反而是把未验证的事实写进声明表）。

## 成本与退出条件

- **成本**：多一个能力位（含两语言各一键）与一个布尔 `preferSync`；无新增间接层、无新状态、无新调用。
- **退出条件**：① 若 jsDesign 的 `*Async` 将来能正常返回 ⇒ 摘掉 `ui/src/code/jsdesign/meta.ts` 里这一位即可，core 的选路不动；② 若某平台声明了 sync、而它的同步入口也挂（或消失）⇒ 同样只改那一行声明，那一面退回恒空（fail-closed 的预期行为）；③ 若将来出现第三个入口形态，说明「声明哪条路」这个形状不够用 —— 那时该换的是**选路判据的结构**，不是这一位。

## 验证

- **不变量测试**（`__tests__/list-styles.test.ts`，7 例；新增 2 例）：
  - `声明 styleEnumerationSync：只问同步入口，*Async 一次都不碰` —— 断言 `asyncCalls` 为空且同步四类全调；
  - `未声明时仍优先 *Async（Figma 的 dynamic-page 语义不能动）` —— 防「顺手把 async 优先删掉」；
  - 两条都断言**调用记录**，不是返回值 —— 只看返回值会放过「两条都调、丢掉其中一份」，而那照样会挂 25s。
- **真机（jsDesign，2026-10-15，改选路前的路径证据）**：四类同步 getter 直接调 0~1ms（PAINT 6 / TEXT 1 / EFFECT 0 / GRID 0）、数据正确；`jsd://styles` **连续两次 25s 超时**。
- **真机（jsDesign，2026-10-15，重载后已跑完，顺序固定：先 ping 再测）**：`jsd_ping` 是**前置门禁**，不是顺手一跑 —— 它回报的 `capabilities` 就是插件当前那份 `meta.ts`，看不到 `styleEnumerationSync` 说明**插件没重载**（后面测的数全是旧产物，测了也不算）。

  1. ✅ `jsd_ping` ⇒ `capabilities: ["styles","styleEnumeration","styleEnumerationSync"]`；
  2. ✅ `jsd://styles` ⇒ 毫秒级 7 条：PAINT 6（色板/主色、品牌渐变、控件底、选中底、描边、状态点-静默）+ TEXT 1（排版/测试-标题24），无 `note`；
  3. ✅ `jsd_get_page` ⇒ `assets.styles` 同为 7 条（`summary.styles: 7`），`note` 只剩两条（`assets.variables` 恒空 = 无变量面；资源清单与 pages 只覆盖当前页 = 0039 修订）—— 「本平台未声明本地样式枚举能力」那句已消失。

  ⇒ 样式这一面从「恒空」回到**可用**；定位用的临时探针（`probe_local_styles` / `probe-ops.ts`）随之删除，`platformOps` 改回 `[]`。
- **指标与日志**：daemon 日志里 jsDesign 的 `jsd://styles` 不再出现 `forward_timeout`。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-15 | 初次决策。起因：0043 的闸让即时设计的样式面恒空，而真机证明同步 getter 0~1ms 可用 —— 卡点在「有 async 就用 async」的探测式选路 | 不引模式：新增 `styleEnumerationSync` flow 位，选路由平台声明决定；两级判据（能不能问 / 走哪条路）；声明 sync 即 fail-closed 不再回落 async。0042/0043 的机制描述同批更正为「永挂的是 typings 未声明、运行时透出的 `*Async`」 |
| 2026-10-15 | 端到端真机（重载后）：ping 三位齐、`jsd://styles` 7 条、`assets.styles` 7 条、`note` 里那句消失 | 结论不变，状态转「已验」。**声明改了，机制没动**：样式面从恒空回到可用；三处把「即时设计列不出样式」写死的 MCP 文案（`platform-facts.ts` 的 jsDesign 段与 **MG 段**、prompts 的回读例外、两语言 create_style 描述）一并更正；临时探针删除 |
| 2026-10-19 | 同一判据推广到**主组件读**（即时设计真机取证） | 新增 flow 位 `mainComponentSync`（即时设计声明），`core/access.ts` 的 `resolveMainComponent` 收 `RuntimeContext` 按声明选路，不再 `?.` 探测 `getMainComponentAsync`。取证：`jsd_copy_overrides`（**只读覆盖快照、不写任何属性**）25109ms `forward_timeout`，`jsd_set_instance_properties` 同 —— 两入口唯一共同前置就是这次主组件读 ⇒ 挂点从中被隔离出来，不是 `setProperties`。附带把 `detachInstanceNodes` / `copyInstanceOverrides` / `applyOverrides` 三个入口的 `ctx` 串上；Figma 不声明（dynamic-page 下同步字段必抛），MG 不声明（运行时无该符号） |
| 2026-10-19 | 单测补 3 例（`__tests__/main-component-sync.test.ts`） | 声明 ⇒ `getMainComponentAsync` **一次都不碰**且读到同步字段；未声明（Figma 形状）⇒ 仍走 async；未注入能力表 ⇒ fail-open 沿用 async。三条都断言**调了哪条入口**，不是返回值 —— 只看返回值会放过「先 await 异步再回退」，那照样挂 25s |
| 2026-10-19 | 端到端真机（重载后，即时设计） | 全部通过：`jsd_ping` 的 `capabilities` 出现 `mainComponentSync`（前置门禁）；`jsd_copy_overrides` **13 ms**（原 25109 ms）、`jsd_apply_overrides` 42 ms、`jsd_detach_instance` 36 ms，均 `applied/created` 正常；`jsd_set_instance_properties{Foo:'bar'}` **14 ms** 即报「没有可写的属性面」（属性面守卫这时才跑得到，原 25021 ms 超时） |
