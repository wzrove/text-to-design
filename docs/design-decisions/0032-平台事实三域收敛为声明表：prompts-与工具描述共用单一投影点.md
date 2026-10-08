# 0032. 平台事实三域收敛为声明表：prompts 与工具描述共用单一投影点

- **日期：** 2026-09-29
- **状态：** 已采纳
- **影响范围：** `shared/`（新增 `dicts/platform-knowledge.ts`、`dicts/platform-value-domain.ts` 第四类登记 + 断言辅助类型、`core/host.ts` 契约注释、i18n 三键）、`ui/`（三侧 `sync-guarantee.ts` 加第 6 节断言）、`mcp-server/`（新增 `tools/platform-facts.ts` 渲染点、`tools/{prompts,components,platform}.ts`、`README.md`）、`tests/platform-knowledge.test.ts`
- **相关记录：** N/A（延续 0022 / 0029 的范式，不取代任何记录）

## 压力

**① 同一事实多份表述，且已经漂。** 组件属性三平台差异写在 4 处：`dicts/capability.ts:49-53`（门控位）、`tools/platform.ts` 的 `platformNote`、`tools/components.ts:149`（描述）、`README.md` 的组件行。其中 `components.ts:149` 的「jsDesign 无对应能力」与 typings 事实不符 ——
`@jsdesigndeveloper/plugin-typings@1.0.12` `plugin-api.d.ts:1093` 里 `InstanceNode.setProperties(properties: { [property: string]: string })` **存在**，只是**只收 string**（Figma / MG 收 `string | boolean`）。真缺口是「读侧 `componentProperties` 不存在 + 值只能传字符串」，不是「无入口」。
同一处描述还把两个字段的形状说反了：写成 `variantProperties(变体,如 {"状态":["a0","a1"]})` —— `{"状态":["a0","a1"]}` 是 `variantGroupProperties`（可选值集合）的形状，`variantProperties` 是「本节点当前取值」的字符串映射。两个字段读法不同，混起来会让调用方按错的形状去解析。

**② 契约注释已过时。** `shared/core/host.ts:122-124` 仍写「**两平台**原生入口都收 `string | boolean`」——0017 接入第三平台后未回填，而 jsDesign 是 string-only。**第三条平台差异目前无人知晓、也无人守。**

**③ 变体兜底写法抄了两份，且口径偏弱。** `tools/components.ts:167` 与 `tools/prompts.ts:208` 各写一份「多主件 / 族名 / 状态」。两处都把它写成「替代做法」；typings 证明它是**唯一路径**：`ComponentSetNode`（`plugin-api.d.ts:1074-1079`）只有 `clone` / `readonly defaultVariant` / `readonly variantGroupProperties`，除 `combineAsVariants`（:127）外**全 API 无第二条产出**（无 `createComponentSet`）。

**④ prompts 是平台盲的。** `registerPrompts(server, i18n)`（`tools/index.ts:45`）拿不到平台状态，只能把三平台分支**全量内联**进每一份提示词 —— Figma 用户也读到 jsDesign 的崩溃细节。变量与组件两域在 prompts 里 **0 覆盖**；变体那 1 处是全量双分支。

**⑤ 新事实形态装不进现表。** `platform-value-domain.ts` 的三张表（类型事实 / 类型排除 / 运行时值域）都以**节点字段**为键，而「`setProperties` 只收 string」的宿主是**契约方法参数**。

**失败后果**：调用方照过时文案行事 → 在 jsDesign 传布尔属性，以为会生效或报错，实得静默 no-op（0007 明令根除的形态）；反向也成立 —— 因文案说「无对应能力」而放弃一个其实可用的入口。
**当前成本**：每加一条平台事实要改 2–4 处，漏一处不报错。0029 已为「能力面」收口过一次，三域这次重演同一问题（同一问题修完又复发）。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 声明表 + 单一投影点（沿用 0022 / 0029 范式） | 采用 | — |
| Strategy / Factory：按平台出策略对象族 | 排除 | 撞 SKILL 停止条件：3 平台 × 3 域、分支稳定且一眼可读，抽象后跳转成本高于收益；0020 已否过「按平台出工具族」，按平台出对象族是同一条理由 |
| 只改文案，不建表 | 排除 | 漂移源仍在（同一事实仍有 4 个落点），本次修完下次加平台再演一遍；且 ④ 的前半段（prompts 无法按平台分流）根本没被解决 |
| 整表放只读资源 `jsd://platform/knowledge` | 本次不做（留缝） | 资源面是对外契约（README 资源表、客户端索引、0006 目录体积口径）；先验证表能被两处投影吃干净 —— prompts 已能只讲当前平台，语境够用 |

## 结论

**不引入模式**，用「声明表 + 单一投影点 + 编译期双向断言」：

- 新表 `shared/src/dicts/platform-knowledge.ts`：平台 × 域（变量 / 组件 / 变体）→ 能力位 / 读路径 / 写入口 / 替代路径 / 证据（`file:line`）。
- `platform-value-domain.ts` 新增**第四类登记**「契约方法参数取值域」（首条 = jsDesign `InstanceNode.setProperties` 只收 string），配双向类型级断言。
- prompts 与工具描述**都从表投影**；`registerPrompts` 改为按 `getPlatformState()` 分流。

## 实施方案

**目标形状（全量）**

- **角色与职责**：`platform-knowledge.ts` 是「哪条域事实」的唯一真源 —— 它是**数据**（只有标识符：工具名 / op 名 / 字段名 / typings 行号），不含句子、不含行为。句子在 `mcp-server/src/tools/platform-facts.ts`（**唯一渲染点**），两处消费：① 工具描述 / `platformNote`，装配期拼一次（覆盖全部平台）；② 配方 prompt，调用期拼（只讲当前平台）。
- **接口所在层与依赖方向**：表在 `shared/dicts`（与 `capability` / `platform-value-domain` 同层）；`mcp-server` 单向依赖 shared；`ui/` 侧只在 `sync-guarantee.ts` 做**类型级**断言，不引运行时依赖。
- **创建与装配位置**：表是模块常量，无需装配；渲染函数是纯函数（不读任何模块级状态）。平台**由调用方显式传**：描述侧传 `null`（装配期覆盖全平台），prompt 侧传调用期的当前平台。
- **调用时序**：`ping` → 平台状态缓存（既有，`platform-state.ts`）→ `prompts/get` 当场读 `getPlatformState()` → 只讲当前平台的分支。
  ⚠ **必须调用期读**：`buildServer` 早于插件连接（0030），装配期读缓存必然是空 —— 那等于把「平台盲」换成「平台恒空」，症状一样却更难查。故 `registerPrompts` **不加**平台入参（加了就诱导装配期取值）。平台未探测（`null`）时给保守文案：先 `jsd_ping` 读能力位再选路。
- **扩展点留在哪**：第四类登记表按「平台 → 方法 → 值形态」形状开，新方法直接加行；域枚举**封闭在 3 个**（加域要改类型，编译期逼问），不预留空域。<br>「某平台声明了没有」**不进表**：claim 的唯一真源是插件侧 `ui/src/code/<平台>/meta.ts` 的 `capabilities`（经 ping 上报），装配期拿不到时用表里已有的 `fallback` 推断主路径（有替代路径 = 主路径走不通），渲染时不复制 claim。

**本次不做**

- 不加 `jsd://platform/knowledge` 资源；
- 不动 capability 三档机制与 `platforms` 门控（0020 的边界）；
- 不做 jsDesign 真机复验（`setProperties` 收 boolean 究竟静默还是报错），故文案**只声明 typings 事实**（string-only），**不写「引擎不收」**；
- 不加运行期热切换（0016 口径：装配期投影）。

## 成本与退出条件

- **成本**：多一张表（约 60 行）+ 第四类登记表（约 20 行）+ 两侧断言；`registerPrompts` 多一个入参（调用点 1 处）。间接层只有 1 跳（表 → 文案），无状态、无网络、无存储、无运维负担。
- **退出条件**：
  1. 平台数降到 1（无差异可表）→ 删表，文案内联；
  2. jsDesign 补上 boolean 取值域或 `componentProperties` 读侧 → 删对应行；`sync-guarantee` 的反向断言会**先编译失败**提醒（沿 0022 的机制，不靠人记）；
  3. 某条域事实收敛到「三平台同形」→ 删该行，退回通用文案（表里不写同形部分，与 0022「收录范围刻意收窄」同口径）。

## 验证

- **不变量测试**（`tests/platform-knowledge.test.ts`，12 例）：
  - 结构完整：三域 × 三平台一格不漏，缺席必须写成**显式** `null` / `[]`（写 `undefined` 即漏格）；`read` 非空时 `readShape` 必须有（三平台形态确实不同：map / map / array）。
  - 证据可追溯：仓内证据的文件必须真实存在；typings 证据必须带 `@x.y.z` 版本且带行号（或明说「零命中」）。
  - 与 claim 一致：变体域「有替代路径 ⇔ 未 claim `inPlaceVariants`」逐个平台比对 `meta.ts` 源码文本 —— 这条同时守住装配期文案里那些**举例**的平台名，某个平台补上原位合并时这里先红。
    （组件域**不做**同样比对：MG 读得到 `componentProperties` 却没 claim 能力位，两者本来就不同义。）
  - 投影不串平台：按单平台渲染的文案里不得出现其它平台名；`platform=null`（装配期）反过来必须讲全三平台；渲染结果不得漏出 `undefined`。
  - 契约方法参数取值域的判别力已实测：把 jsDesign 的 `deny` 改成 `['string']` → `tsc` 报 `Type '"string"' does not satisfy the constraint 'never'`（① 方向），同时报 `MethodParamAllowViolations<"string", string>` 点名漏登记的 `boolean`（② 方向）。
- **边界用例**：platform 未探测（`null`）；平台不适用工具走 `describePlatformGate`（`platform-state.ts:150`）的替代路径分支。
- **回归证据**：`pnpm run typecheck` 通过；`tests/i18n.test.ts`（21 例，含中文棘轮与 en 未译基线 0）、`packages/mcp-server/src/__tests__/catalog-budget.test.ts`（6 例，描述变长后目录仍在 500 KB 内）通过；`pnpm build` 三平台产物构建通过（真机效果仍需在对应客户端重载插件后目检）。
- **指标与日志**：无新增；沿用平台探测日志（`platform-state.ts:118`）。
- **真机复验（2026-09-29，即时设计客户端 + 新 daemon；工具面 53 个 / 配方 9 个）**：
  - `jsd_ping` 回包 `{platform: jsdesign, capabilities: ['styles'], platformOps: [], coreCapabilities: 6 项}` —— 与表里 jsDesign 行的三条「无」（variables / componentProperties / inPlaceVariants）一致；
  - 四个配方（`design-strategy` / `variant-set` / `component-property` / `variable-binding`）渲染**只讲当前平台**：含 Figma=false、含 MasterGo=false、含即时设计=true —— 「单平台文案不串平台」这条不再是纸上断言；
  - 工具描述已是表的投影（`jsd_set_instance_properties` 明写「能传哪种值取决于本平台签名」并列出三平台取值域；`jsd_combine_as_variants` / `jsd_platform_op` 同理）；
  - 平台上 `platformOps` 为空 ⇒ **0033 的 6 个 MG op 无法在本环境复验**，仍需在 MasterGo 客户端载入新 dist 后走一遍。
- **真机复验(2026-10-08，即时设计客户端 + 插件重载 + daemon 重启) → 该项在本环境不可隔离**：
  要验「传 boolean 到 `setProperties`」，前提是**有一个已存在的属性**，而 jsDesign 上两条路都断：
  ① 无 `componentProperties` 能力位(ping 回包 `capabilities:['styles']`，读侧没有任何属性可列)；
  ② `jsd_combine_as_variants` **引擎级失败**(本轮三种姿势全败)，做不出变体集 ⇒ 也没有 `variantProperties`。
  实测：任意属性名都是「未知」，`{'Foo': true}` 与 `{'Foo': 'true'}` **表现完全相同** —— 都是插件
  25s 无响应(daemon 日志 `r15/r16 component_op ok=false 耗时=2500xms error=forward_timeout`)，
  故**无法从 boolean 与 string 的差异上得出任何结论**。
  ⇒ 结论不变：文案继续只声明 typings 事实(string-only)、**不写「引擎不收」** —— 这一条真机验不了。
- **真机复验(2026-10-08，Figma 客户端 + 插件重载)**：同样四份配方按 `prompts/get` 原文渲染 ——
  含 `Figma`=true、含 `即时设计`=false、含 `MasterGo`=false，且正文带本平台 op 名
  (`figma_component_property_add` / `figma_variables_create` / `figma_variables_apply`)。
  ⇒ **三平台的分流现在都各有真机证据**(jsDesign 09-29、MG / Figma 10-08)。
- **真机复验(2026-10-08，MasterGo 客户端 + 插件重载)**：四个配方(`variant-set` / `component-property` /
  `design-strategy` / `variable-binding`)按 `prompts/get` 原文渲染 —— 含 `Figma`=false、含 `即时设计`=false、
  含 `MasterGo`=true，且 `variant-set` / `component-property` 正文带**本平台 op 名**
  (`mg_create_variant_property` / `mg_add_component_property` 等)⇒ 「单平台文案不串平台」在 MG 上也成立
  (09-29 只在 jsDesign 验过)。同轮 `ping` 的 `platformOps` 11 个，与表里 MG 行一致。
- **⚠ 附带发现(同轮，未修，待定)**：`jsd_set_instance_properties` 在 jsDesign 上给**未知属性名**会让插件
  挂满 25s 才超时，错误文案里不带原因(调用方分不清「属性名非法」还是「平台没有这个能力面」)。
  根因位置：`core/component.ts:191-209` 的运行时属性名校验**只在主件父级是 COMPONENT_SET 时生效**
  (拿 `variantGroupProperties` 当合法键表)，jsDesign 走不到那条分支就直接 `setProperties`。
  修法候选：按能力位前置拦下、给替代路径报错(而非挂 25s)。**尚未改** —— 属单点前置校验，
  但落在「平台能力面判定」上，要动就先看清它属本记录的表还是 0022 的门控，别顺手加分支。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-29 | 初次决策 | 采用「声明表 + 单一投影点」；排除 Strategy/Factory 与「只改文案」 |
| 2026-09-29 | 真机复验（即时设计客户端） | 结论不变。复验中发现两处与「配方能用不可用」直接相关的缺陷，已按 AGENTS.md 的「单点 bug 直接改」处理：① `daemon/proxy.ts` 的 `syncPrompts` 镜像上游参数时一律写成 `z.string()`，**丢掉可选性** → 不填参数就调不动（本题 9 个配方里 8 个有可选参数，用法正是「留空只返回纪律」）；已抽出 `promptArgsSchema` 保可选性并加回归测试。② 三个新配方自身有自相矛盾（jsDesign 分支仍教人传布尔；同一事实说两遍），已按第四类登记的取值域改写 |
| 2026-10-08 | 真机复验（即时设计客户端） | 结论不变。「jsDesign 传 boolean」这条**在本环境不可隔离**（无属性可设：无 componentProperties 能力位 + 变体集做不出来），boolean 与 string 表现一致（都是 25s 悬挂），故文案继续只声明 typings 事实。附带发现未知属性名在 jsDesign 上悬挂 25s、错误不含原因，根因与修法候选已记入验证节（未修） |
