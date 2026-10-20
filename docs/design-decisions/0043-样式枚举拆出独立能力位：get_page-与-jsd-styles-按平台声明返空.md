# 0043. 样式枚举拆出独立能力位：get_page 与 jsd://styles 按平台声明返空

- **日期：** 2026-10-10
- **状态：** 已采纳（三包类型检查通过 + 8 例单测通过；**即时设计真机已验**：`jsd://styles` 11ms / 8ms 返空带 `note`（原 25008ms 超时），`get_page` 在跨页那半被 0039 修订收口后回到 42ms；MasterGo 那半 2026-10-14 已验：`assets.styles` 列得出来 ⇒ 声明为真）**机制描述于 2026-10-15 更正**：挂住的不是同步 getter，是 typings 未声明、运行时透出的 `*Async` 成员（见「变更历史」）—— 结论与闸不变；**同日端到端**：即时设计改声明后 `jsd://styles` 毫秒级列 7 条（不再恒空），选路那一半已由 [e1e66f0a](e1e66f0a-样式枚举选路按平台声明：新增-styleEnumerationSync，不靠-.-探测.md) 承载
- **影响范围：** `shared/`（`dicts/capability.ts` 新增 `styleEnumeration` 位、`dicts/i18n/messages.{zh-CN,en}.ts` 各一键、`schemas/results.ts` 的 `listStylesResultSchema` 加可选 `note` + `pageStructureResultSchema.note` 第三种来源、`core/{access,export,assets,nodes}.ts` 的 ctx 透传与闸、新增 `__tests__/assets-capability.test.ts`、`__tests__/list-styles.test.ts` 补 3 例）、`ui/`（三侧 `meta.ts` 的 capabilities、`code/plugin.ts` 两处传 ctx）、`mcp-server/`（`tools/resources.ts` 描述补「空清单 ≠ 没有样式」）；**另清掉 0042 的探针**：删 `schemas/inputs.ts` 的 `kinds`、`core/{access,export}.ts` 的筛选参数、`mcp-server/tools/resources.ts` 的 `jsd://styles/{kind}` 与 3 例单测
- **相关记录：** 0002（RuntimeContext 显式注入）、0007（不允许静默失效）、0022/0032（平台事实只落声明表，core 不猜平台）、0029（能力字典改规格表）、0039（`get_page` 把样式枚举带进默认路径）、0042（按类拆分 + 单类探针；其「同步 getter 不可中断」的机制描述已于 2026-10-15 更正）、[e1e66f0a](e1e66f0a-样式枚举选路按平台声明：新增-styleEnumerationSync，不靠-.-探测.md)（枚举在两条入口之间**走哪条**改由声明决定，本条的闸不动）

## 压力

**一条「存在性」判据根本答不上来的平台缺陷，把 `get_page` 整个废掉了。**

0042 在即时设计上测得的两条事实（空文档同样成立 ⇒ 与文档内容无关，是平台缺陷）：

```
r7  get_page     ok=false 耗时=25024ms error=forward_timeout
r10 list_styles  ok=false 耗时=25008ms error=forward_timeout
```

而 0039 把 `listStylesAsync` 放进了 `get_page` 的 `assets` 默认路径 —— 于是**即时设计上 `get_page` 全废**，且它是「设计前第一步」的入口（复用纪律四处同源都指向它）。

卡点在**选路**，不在「能不能问」。core 的 `listStylesAsync` 按 0010「有 async 就用 async」：每一类先取 `host.getLocal*StylesAsync?.bind(host)`，`?.` 成立就 `await` 它，**只有该成员不存在时才退到同步 getter**。而即时设计：

```
typings（plugin-api.d.ts:95-98）  只有四个同步版，没有 *Async
运行时（Object.create(native)）   四个 *Async 都透出来，typeof === 'function'
⇒ ?. 判断成立 → await asyncGet() → await 一个永挂的 Promise → 25s forward_timeout
⇒ 同步 getter 从头到尾没被调用过 —— 而它完全可用（实测 0~1ms，数据正确：PAINT 6 / TEXT 1）
```

**存在性探测（`typeof` / `?.`）在这里永远答 true** —— typings 里的「没有」不等于运行时的「没有」。它不是判据不够好，是判据类型错了：这是「问了没回音」，不是「没有这个东西」。

⚠ **2026-10-15 真机更正了「没回音的是谁」**（详见「变更历史」）：本条当初写的「同步 getter 不可中断、调用即冻死线程」两处都指错了对象 —— 挂着的是 Promise，**线程并不冻死**（两次超时之间别的调用照常），同步 getter 也从未被调用。**「存在性探测答 true ⇒ 判据类型错」这件事本身成立**，闸的结论不变。

同时 0029 的 `styles` 能力位语义是「能不能**按 id 应用**样式」（门控 `fillStyleId` 等四个字段），即时设计这一条是真能用的，claim 得没错。事故机制正是**拿它当「能列清单」用了**：两条语义合成一位，缺的那半被有的那半隐含出来。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 拆出独立能力位 `styleEnumeration`，未声明 ⇒ 恒空且**一次都不调** | 采用 | — |
| 沿用 `styles` 一条，给 `get_page` 加 `includeStyles?` 默认关 | 排除 | ① 默认关等于把「这个平台能不能列」这份事实**复制到 MCP 调用方**（每次调用都得多问一次），撞 0032「一个事实一份」；② 能力位是**既有机制**（0029/0032 已在用），本条不新造任何东西 —— 加参数才是新造了一条并行的判定通道 |
| 调用点 try/catch 后返空 | 排除 | 挂住的是**永不 resolve 的 Promise**：`await` 既不抛也不 settle ⇒ `catch` 接不到；加 `Promise.race` 超时也只是「放弃这次调用」，救不回这一面。判断必须在**调用前**做出（0042 已排除同一条） |
| 靠 `?.` 探测有没有 `*Async` 成员来选路（0010 的异步优先） | 排除（2026-10-15 真机证伪） | 即时设计运行时**四个 `*Async` 都在**（typings 没声明，`Object.create(native)` 透出）⇒ 探测永远答「有 async」⇒ 选中的正是永不 resolve 的那条。选路只能靠声明（`styleEnumerationSync`） |
| core 里按平台写跳过清单 | 排除 | core 不认识平台、也不该认识（0022/0009）。「某平台声明了什么」的唯一真源已经是 `ui/src/code/<平台>/meta.ts` 的 `capabilities`，再抄一份即为第二份事实 |
| 未声明就让 `assets` 整块返空 | 排除 | 组件 / 变体集走 `findAllWithCriteria`，是**失败可捕获**的常规调用，三平台同构；不该被样式那一面连坐 —— 连坐会把「页面有什么组件」这个最有复用价值的答案一起弄丢 |

## 结论

**不引入模式。** 把「能不能列出有哪些样式」从 `styles` 里拆成独立能力位 `styleEnumeration`（kind: `flow`，core 不据此判定任何字段），判据顺序改为：

1. **能力声明优先**：未声明 ⇒ 恒空，且**一个 getter 都不调**；
2. 未注入能力表（`ctx.capabilities == null`）⇒ fail-open，退回 `typeof` 探测（沿 0002，与写路径同口径）；
3. 声明了就照常问 —— 能力位是「能不能问」，不是「一定有内容」。

同一个规则顺带套到变量面（用既有的 `variables` 位，不新加）。这不是为了修变量面（即时设计本来就没有 `getLocalVariablesAsync`，探测也会返空），而是为了让资源清单四个面**同一条规则**：此前是「两个面靠声明、两个面靠探测」，同一份清单里两套判据，正是这次漏判的土壤。

配一条纪律（0007）：空数组有两种成因，必须区分。`listStylesResultSchema` 加可选 `note`，`get_page` 的 `note` 多第三种来源 —— 「清单恒空」要被点名成**读不出来**，而不是留着让调用方读成「文档里没有样式」。

## 实施方案

- **目标形状**
  - **依赖方向**：平台专属事实仍在 `ui/src/code/<平台>/meta.ts` 的 `capabilities`；core 只认 `RuntimeContext`，不读平台名（沿 0022）。
  - **单点闸**：`core/access.ts` 的 `listStylesAsync(host, ctx)` / `listVariablesAsync(host, ctx)` —— 两个消费方共用这两处：
    - `core/export.ts` 的 `listStyles` ← 插件的 `list_styles` ← MCP 的 `jsd://styles`；
    - `core/assets.ts` 的 `listDocumentAssets` ← `core/nodes.ts` 的 `getPageStructure` ← `get_page` / `jsd://page`。
  - **ctx 来源**：`ui/src/code/plugin.ts` 的 `runtimeContext(meta.capabilities, platform)`，与写路径（`executeOps` / `updateSelection`）同一个 ctx —— 读路径此前没用到它，本批只是把它传进来，没有第二份注入点。
  - **调用时序**：`get_page` → `getPageStructure(host, ctx)` → `listDocumentAssets(host, ctx)` → 按 `GATED_SURFACES`（能力位 → 资源面）先算 `unavailableSurfaces`（供 note 点名），再让 Access 层的闸决定调不调。
  - **平台声明**：Figma / MasterGo 声明 `styleEnumeration`；即时设计只声明 `styles`（不 claim 枚举）。
  - **扩展点**：将来再有「符号在但问不出来」的面，只做两件事 —— 在 `dicts/capability.ts` 加一位、在 `GATED_SURFACES` 加一行；core 的判据与 note 通道不动。
- **本批做**：能力位拆分 + 三平台声明 + 两条读路径的闸 + `note` 点名 + 8 例单测 + MCP 资源描述与 `getPage.description`（中/英）补口径。
- **本批顺带清掉**：0042 的**探针** —— `list_styles` 的 `kinds` 入参、单类资源 `jsd://styles/{kind}` 与 3 例相关单测。理由：探针的存在前提是「还要靠分开问来定位哪一类坏」，而本批的闸让不该问的平台一次都不问，「按类少问」不再承载判断；真要取证，临时放开声明即可，不必长期养一个入口。四类仍保留为**四次独立调用**（任一类失败不连坐，这条独立成立）。
- **本批不做**：① 「某一类挂死、其余三类正常」的按类跳过清单 —— 没有「某一类坏」的证据（探针已随本批摘掉），有了再说（真要加，形状是 `GATED_SURFACES` 里按 kind 再细一格，不用改机制）；② `get_page` 加 `includeStyles?` 参数（见候选表）；③ 给 `assets` 整块加「本平台支持哪些面」的新字段 —— 空数组 + `note` 已经把成因说清了，再加字段是同一事实的第二份载体。

## 成本与退出条件

- **成本**：多一个能力位（含两语言各一键）与一个 `ctx` 参数（三个读路径函数签名各多一参）；`listStylesResultSchema` 多一个可选键（可选 ⇒ 旧插件不发不判非法，同 0039 的 `assets` 纪律）。无新增间接层、无新状态。
- **退出条件**：若 MG 真机证明 `styleEnumeration` 是**假声明**（MG 也列不出来），改 `ui/src/code/mastergo/meta.ts` 那一行摘掉即可，机制不动 —— 这正是「声明与机制分开」的收益。**2026-10-14 未命中**：MG 的 `assets.styles` 列得出来（PAINT / EFFECT 条目，不退超时），声明为真，meta 那一行不动。若将来某平台的枚举又变得问不出来（不论挂在同步还是 async 那条路上），同样只改声明。

## 验证

- **不变量测试**（8 例）：
  - `list-styles.test.ts`（5 例）：四类全问且空的一类不报错 / getter 缺失跳过；未声明 `styleEnumeration` 时**调用记录为空且返回空** / 只声明 `styles` 不算声明枚举（两条位不互相隐含）/ 能力表未注入时 fail-open 退回探测。
  - `assets-capability.test.ts`（3 例）：未声明时 `assets.styles` / `assets.variables` 恒空且 `unavailableSurfaces` 列出两面；声明了照常枚举；`get_page` 的 `note` 里点名 `assets.styles`。
  - 断言对象是**调用记录**而非返回值 —— 只看返回值会放过「取回来再丢掉」，而那照样会把整条调用挂到 25s 超时。
- **真机（即时设计，2026-10-10 已跑）**：✅ `jsd://styles` **11ms** 返回 `{styles:[],count:0,note:"本平台未声明本地样式枚举能力…"}`（此前是 25008ms 超时）；`jsd_ping` 5ms、`capabilities: ["styles"]`；MCP 资源表里 `jsd://styles/{kind}` 已消失（探针摘干净了）。
  ⚠ 同一轮里 `jsd_get_page` **仍然 25634ms `forward_timeout`** —— 但卡点**不是样式**：`find scope=document` 25425ms / 25466ms 同样超时，当前页 find 只要 44ms ⇒ 是**跨页读**（0039 引入的资源清单遍历各页）。那半已由 [0039](0039-get_page-收窄为顶层几何加资源清单：复用既有契约成员，变量走可选入口.md) 的修订接走（按「能否显式加载页」收口为只扫当前页），**待再一轮真机复验**。
- **真机**：① jsDesign：**已跑**（0039 第三轮 —— `get_page` 42ms、`note` 点名只覆盖当前页）；② MasterGo：**已跑（2026-10-14）** —— `assets.styles` 列得出来（PAINT / EFFECT 条目），`styleEnumeration` 这条声明为真；跨页那半仍按 0039 的收口只覆盖当前页（`note` 点名）。
- **指标与日志**：daemon 日志里 jsDesign 的 `get_page` 不再出现 `forward_timeout`。

## 晋级评估

> 首批跑一阵之后填一次。三条全中才扩到全量，缺一条就维持首批范围或按「退出条件」回退。
> 流程见 references/rollout.md。
> 没有对照实现时，「稳定」看回归与指标是否守住；「假设被证实」看新增实现时改动点有没有扩散。

| 门槛 | 证据 | 结论 |
|---|---|---|
| 稳定：首批范围无回归、指标未恶化 | {监控 / 回归记录} | 中 / 不中 |
| 假设被证实：真来了新实现，且改动点没扩散到 Context / 调用方 | {git 历史 / 需求记录} | 中 / 不中 |
| 成本在预算内：排查、构建、运维未被推高 | {指标 / oncall 记录} | 中 / 不中 |

评估结论：<维持首批 / 扩到全量 / 回退>，日期 2026-10-10

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-10 | 初次决策。用户口径：`get_page` 按平台看有没有对应能力，没有就返空 | 不引模式：拆 `styleEnumeration` 独立能力位，未声明 ⇒ 恒空且不调；变量面同规则走既有 `variables` 位；空数组必须带 `note` 区分成因 |
| 2026-10-10 | 用户补一句「0042 的探针也可以清理掉了」 | 摘掉 `kinds` 入参、单类资源 `jsd://styles/{kind}` 与 3 例单测；**四类仍保留为四次独立调用**（任一类失败不连坐，这条独立成立）。结论不变 —— 机制仍在能力位上，探针只是没了存在前提 |
| 2026-10-14 | 用户重载插件后跑 MasterGo 那半真机（dec 25827d0c 的复验顺带结掉本记录的待验项） | 结论不变：`styleEnumeration` 拆位的机制与「按声明决定调不调」都照旧，MG 声明**为真**、退出条件未命中。新暴露一条与本记录相邻的事实：MG 的 `assets.styles` 与 `assets.variables` 互为镜像（同一资源按创建路径只进其中一桶），已写进 0039 的 ⚠ 与 dec 25827d0c |
| 2026-10-15 | 真机复验（逐层探针定位）：四类 `getLocal*Styles` **直接调全部 0~1ms 正常返回**（PAINT 6 / TEXT 1 / EFFECT 0 / GRID 0），而 `jsd://styles` 仍连续两次 25s 超时 ⇒ 卡点不在 getter 本身，而在**选路** | **机制描述更正**：永挂的是 typings 未声明、运行时由 `Object.create(native)` 透出的 `*Async` 成员 —— `typeof` 探测答 true ⇒ 0010 的「有 async 就用 async」选中它 ⇒ `await` 永不 resolve（挂着的是 Promise，线程**不**冻死）。本条此前写的「同步 getter 不可中断、调用即冻死线程」两处都指错了对象。**「存在性探测答 true ⇒ 判据类型错」与能力闸的结论不变**，改的是声明：即时设计由「不 claim」改为 `styleEnumeration` + `styleEnumerationSync`（core 的 `preferSync` 只问同步入口），`jsd://styles` / `assets.styles` 由恒空变回能列出；机制与闸一行未动 |
