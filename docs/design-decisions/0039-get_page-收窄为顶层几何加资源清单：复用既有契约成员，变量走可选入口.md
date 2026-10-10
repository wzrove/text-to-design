# 0039. get_page 收窄为顶层几何加资源清单：复用既有契约成员，变量走可选入口

- **日期：** 2026-10-10
- **状态：** 已采纳（三包类型检查通过 + 单测通过；**2026-10-10 真机（即时设计）已验并据此修订**：① 样式清单那一半由 [0043](0043-样式枚举拆出独立能力位：get_page-与-jsd-styles-按平台声明返空.md) 接走，实测 11ms 返空；② 本记录「资源清单遍历各页」那一半**在即时设计上不成立** —— 触碰非当前页必挂 25s，已按能力位 `documentScopeRead` 收口为只扫当前页（符号判据那版被真机推翻），**第三轮真机已验：`get_page` 42ms、`find scope=document` 25ms、`list_styles` 8ms**，见「验证」节。Figma / MasterGo 的变量清单与「MG 是否也读不到非当前页」仍待验）
- **影响范围：** `shared/`（`schemas/results.ts`、`core/{host,access,assets,nodes,index}.ts`、`dicts/platform-knowledge.ts`）、`ui/`（`code/figma/host.ts`、`code/mastergo/{host,meta,sync-guarantee}.ts`、`code/jsdesign/sync-guarantee.ts`）、`mcp-server/`（`tools/{session,resources,platform-facts}.ts`、`README.md`）、i18n（`getPage.description` 两语言 + `resources` 页描述）
- **相关记录：** N/A（沿 0011 的页加载门控、0032 的平台事实表、0006 的目录体积取向、0010 的异步优先；drift-watch 对 `jsd_get_page` 的依赖见 0003）

## 压力

`get_page` 一份输出承担两条**变化轴不同**的事实：

1. **设计系统资源清单** —— 变化轴是平台能力面，三平台不对称：即时设计 typings
   全文无 variable 声明（`grep -in variable` 零命中）、MasterGo 有 `mg.variables`
   但本仓未接、Figma 读写都通。这条轴已由 0032 的声明表 + 编译期断言承载。
2. **当前页顶层几何** —— 变化轴是**页面规模**，而它没有上限。

两者挤在同一个方法里：成本由规模那条轴决定，能力那条轴却要求字段恒在。
后果有可观测的复发信号（daemon 日志）：

| 时间 | 症状 |
|---|---|
| 10-08T08:06 | `r38 get_page ok=false 耗时=25012ms error=forward_timeout` |
| 10-09T03:58 / 03:59 | `r53` / `r54` 同一签名，两次连击 |
| 10-10T01:41 / 01:42 | `r3` / `r5` 同一签名，两次连击（插件与 daemon 均为当日新产物） |

`forward_timeout` 是 **UI 侧** 25s 转发预算打满（`ui/src/bridge/router.ts:158`，
`UI_FORWARD_TIMEOUT_MS = 25_000`），不是掉线：同一时段 `ping`(4~63ms)、
`get_selection`(136ms)、`find`(48~65ms) 全部毫秒级返回，只有 `get_page` 挂死。
上一次修法（`lightTopLevel`，commit `59972f4`）只压了「单节点属性读次数」，
没给输出面**边界**：字段越多、顶层节点越多，引擎跨边界读就越多。

同时 `get_page` 是 load-bearing 的：`drift-watch` 的「当前页顶层」漂移复核走
`lookupExecutor('jsd_get_page')` 直调，靠返回的 `nodes[].id/x/y` 配对
（`mcp-server/src/tools/drift-watch.ts:114`；`session.ts:92` 已写明「改名/删名会静默打断它」）。
所以字段收窄可以，`id/x/y` 不能动。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 保持简单：只收窄输出面 + 复用既有契约成员 | 采用 | — |
| Strategy / Factory Method（按平台选枚举实现） | 排除 | 路由表「分支少且稳定」不宜用；三平台差异已由 0032 的声明表承载，再引策略对象会造出**第二份平台事实**（撞 0009/0032「一个事实一份」）。 |
| 拆成两个工具 / 两个方法（`get_page` + `get_assets`） | 排除 | 撞 0020「不按平台/语义重定义工具」的取向与 0006 的目录体积门禁；两次往返反而把超时暴露面乘二。 |
| Composite（资源与节点塞进同一棵树） | 排除 | 资源不是页面树成员，强行统一要造伪层级，读成本也不降。 |
| Facade（给资源枚举包统一入口） | 排除 | 只有一个消费方（`get_page`），Facade 会退化成无价值转发。 |

## 结论

**不引入模式**，做两件事：

1. **输出面收窄**：`get_page` 改为 `nodes`（当前页顶层，字段 `id/name/type/width/height/x/y`）
   + `assets`（资源清单）两段；删掉 `z` / `childCount`。
2. **资源清单不新造读路径**：组件与变体集走**契约里已有的**
   `PageSkeleton.findAllWithCriteria`（`core/host.ts:195`，挂在 `host.root.children` 上逐页调用）；
   颜色样式复用 `core/export.ts:139` 的 `listStyles`（只取 PAINT 一类）；
   变量走**新增可选契约成员** `getLocalVariablesAsync?`，形制照抄 `getLocalPaintStylesAsync`
   的先例（0011/0017）：契约可选 + 缺口登记 + Access 层探测回退，取不到就恒空数组。

不引模式的依据就是路由表的停止条件：分支只有「这个平台有没有这个符号」一种，
且是**探测**不是分类（`typeof host.x === 'function'`）—— 引任何模式都只是把一行
`if` 换成一行注册表。

## 实施方案

- **目标形状（全量）**
  - **依赖方向**：平台专属符号只出现在 `ui/src/code/<平台>/host.ts` 的 adapter 里；
    core 只认 `DesignHost` 的可选成员并按 `typeof` 探测，不猜平台、不读平台名（沿 0022）。
  - **调用时序**：`get_page` → `getPageStructure(host)` → `ensurePagesLoaded`（0011 门控，幂等）
    → ①逐页 `findAllWithCriteria` 取 COMPONENT / COMPONENT_SET；②`listStylesAsync` 过滤 PAINT；
    ③`listVariablesAsync`；④当前页 `children` 逐节点只读几何。
  - **扩展点**：资源清单固定在 `core/assets.ts` 一个函数里。将来接新资源面（如 MG 变量）
    只改该函数 + 平台 adapter，schema 与 MCP 侧不动。
  - **枚举失败不连坐**：`findAll*` 会因**文档里任何一个坏节点**整页抛（`nodes.ts:302`
    记的实测：Figma 残留一个出错的组件集 → 整页一个节点都查不到）。故枚举**按页** try/catch：
    失败页跳过、页名收进 `note` 点名（`note` 由「单一的成本标注」扩成「本次读取的附加说明」
    通道，两个来源各成一句 —— 这是本批唯一一处动了 0011 的字段语义，理由是不给降级另开
    字段会让出参多一个只有异常时才出现的键）。
  - **版本错位容错**：`assets` 在 schema 里声明为**可选**，当前插件恒发。这一条不是
    为了语义模糊 —— `structured()` 对过不了 schema 的结果一律判 `isError` + 返回空结构
    （`mcp-server/src/core/response.ts`），若把它写成必填，旧插件（发不出该键）会让
    `get_page` **整条失败**。于是约定：键缺席 = 产物错位，键在但数组空 = 本平台没这个面
    （同 `listFontsResultSchema` 的 `total`/`offset`/`truncated` 为什么可选）。
    反方向（旧 MCP + 新插件）安全：zod 对象默认剥掉多余键，且本批**删字段**的方向天然兼容。
- **本批做**：`assets.{summary,components,variants,styles,variables}` 五键（组件 / 变体集 /
  样式 / 变量四类内容 + 派生计数）；`nodes` 字段收窄到
  `id/name/type/width/height/x/y`（7 次跨边界读/节点，与原来的四十几次差一个量级 ——
  顶穿预算的是那个量级差，`type` 这一次读换来「一眼看出顶层是容器还是文本」）；
  Figma 与 MG 两侧各投影一个 `getLocalVariablesAsync`（Figma 是 `figma.variables.getLocalVariablesAsync`，
  MG 是命名空间下的 `mg.variables.getVariables()`）；即时设计登记为该符号的缺口 ——
  它是**接不了**（typings 里没有任何变量声明），不是「还没接」。
- **本批不做**：MG 变量的**写侧**接入（建集合 / 建变量 / 绑值，形状与 Figma 不同，属独立决策；
  0033 那两个别名 op 仍在等它）；因此 MG 的 `variables` 能力位 claim 继续关着 ——
  claim 的含义是「这个平台有变量能力面」，会把「能改变量」的预期一起放出去；
  资源清单分页/上限（资源条目比节点数低一两个量级，先不设闸）；
  **`nodes` 段的上限/分页** —— 用户口径要的是完整顶层列表，砍掉一半得先有点名的动作
  （要补就照 `findNodes` 的 `slice(0, 100)` + `total` 形制）；
  删 `pages` / `note`（两个页级元数据，成本与节点数无关，0011 决定的，本批保留）。

## 成本与退出条件

- **成本**：core 多一个文件（`assets.ts`）与一个可选契约成员；三平台各多一行缺口登记；
  `get_page` 出参多一层 `assets`（4 个数组）。
- **退出条件**：若资源清单在某平台也打成 25s 超时（例如超大文档的 `findAllWithCriteria`），
  回退到「只上报名单长度、不列 id/name」，或按平台把 `assets` 降级为空 + `note` 点名成本 ——
  届时 `nodes` 段的收窄结论不受影响。若 `nodes` 段本身仍顶穿预算（顶层节点上万个时，
  单节点 6 次跨边界读 × n 依旧可观），补上限/分页（形制见「本批不做」），不改回宽字段。

## 验证

- 不变量测试：`pnpm run typecheck` + `__tests__/document-scope.test.ts`（4 例，断言
  **遍历了哪些页**）。新增契约成员的缺席判定由三侧 `sync-guarantee.ts`
  的编译期断言守（登记的必须真不在 typings 里）。
- **真机（即时设计，2026-10-10，三轮）**
  - 第一轮（0043 后，跨页未收口）：`jsd://styles` **11ms** 返空带 `note`（原 25008ms 超时）；
    `jsd_find` 当前页 44ms；`jsd_find scope=document` 25425ms / 25466ms `forward_timeout`；
    `jsd_get_page` 25634ms `forward_timeout`。
  - 第二轮（按 `loadAllPagesAsync` 符号收口）：`get_page` 25016ms、`find scope=document`
    25008ms —— **没救回来**，由此把判据换成能力声明。
  - 第三轮（按 `documentScopeRead` 声明收口）：✅ `jsd_get_page` **42ms** `ok=true`
    （返回当前页 14 个顶层 FRAME + `assets` 四键 + `pages` 一条 + 两句 `note`）；
    ✅ `jsd_find scope=document` **25ms** 带「已退回当前页」`note`；
    ✅ `list_styles` **8ms** 返空带 `note`。
- **仍待验**：Figma / MasterGo 的变量清单；MG 是否真读不到非当前页（当前按保守默认也收口为只扫当前页）。
- 边界用例：`assets` 任一类在某平台读不到时不得让整条结果判非法 —— 恒空数组；
  插件/MCP 产物错位时 `assets` 缺席同样不得判非法 —— 该字段可选，沿用 `fonts` 的
  「旧产物不发该字段不能连坐只读调用」纪律。
- 指标与日志：daemon 日志里 `get_page` 的 `耗时=` 回到毫秒级；`forward_timeout`
  不再出现该方法名；drift-watch 的「当前页顶层」复核仍读得到 `jsd_get_page`
  （`drift-hook.test.ts` 已守）。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-10 | 初次决策。用户口径：只拿「变体 / 变量 / 颜色样式 / 组件」这层资源 + 当前页第一层的名称、宽高、x、y；变量有就有、没有就空；节点字段含 id；资源条目带 id + 名称 | 采用「保持简单」：不引模式，输出面收窄 + 复用既有契约成员 |
| 2026-10-10 | 用户补一句「变量 Figma / MasterGo 都有」→ MG 从「本批不做」提到「本批做（只读侧）」：MG 的 `mg.variables.getVariables()` 经投影实现同一成员，缺口登记从「缺席项」改到「命名空间投影」（顶层不许有 + 来源必须真在 `PluginAPI['variables']` 上，两条成对）；0032 的 MG 变量事实随之把 `read`/`readShape` 从 `null` 改成 `mg.variables.getVariables()` / `array`，并给 `DomainFact.read` 补一句「也可以是本仓已接的枚举 API」 | 结论不变（仍是不引模式 + 复用可选契约成员），只是把「本批不做」里最没理由的那一半做了：MG 的**读**侧。写侧与能力位 claim 仍不做 |
| 2026-10-10 | 用户补一句「顶层节点的类型也加上吧」→ `nodes[].type` 加回 | 结论不变。字段集从 6 项变 7 项，仍比原来的四十几次读低一个量级；`type` 是 `observedNodeTypeSchema` 里的可观察类型，回包方向也因此对旧产物更宽容（旧插件本来就发它） |
| 2026-10-10 | **真机（即时设计）推翻本记录的一句前提**：「jsDesign 无 dynamic-page、文档常驻，直接遍历即可」不成立 —— 实测 `find scope=document` 25425ms / 25466ms `forward_timeout`（`findAllWithCriteria` 与 `findAll` 都挂），而当前页 find 只要 44ms；`get_page` 因此仍是 25634ms 超时（样式那一半已由 0043 修掉，剩下的是**跨页读**） | 修订「资源清单遍历各页」这一半：未声明 `documentScopeRead` 的平台 ⇒ 资源清单、`pages` 元数据、`find scope=document` 一律**只覆盖当前页**，并在 `note` 点名（「不等于文档只有一页」）。判据放在**调用前**（`canReadDocumentScope`），不放 try/catch —— 同步调用不可中断，失败根本走不到 catch。不另开新编号：这是本记录第 2 条实施方案的收口，不是新决策 |
| 2026-10-10 | 用户提「这个名字是不是得换一个，希望它给的是**当前页**的组件/变体/样式/变量 + 第一层节点基础信息」 | **工具标识符 `jsd_get_page` 与资源 URI `jsd://page` 都不动**（0003：drift-watch 按该名直调配对 `nodes[].id/x/y`；改名还要同步配方/CHANGELOG/README 等 10 处已发布引用），只改**展示名**：`getPage.title` 与 `resources.title4` 改为「当前页概览：第一层节点 + 可复用资源清单」，描述钉死范围语义。顺带校正一处口径：**样式与变量是文档级**（引擎枚举 API 本身就是文档级，与页面无关），能按页收口的只有组件与变体 —— 这点写进工具描述与 `jsd://page` 描述 |
| 2026-10-10 | 上一行的第一版判据（「有没有 `loadAllPagesAsync`」）**被真机推翻**：按符号收口后 `find scope=document` 照样 25008ms `forward_timeout`。原因与 0042 的样式 getter 是同一个坑 —— jsDesign 的 host 是 `Object.create(native)`，typings 里没有的符号**运行时照样透出来**，于是 `loadAllPagesAsync` 存在且**永不返回** | 判据换成**平台声明**（新增能力位 `documentScopeRead`，形制同 0043）；并连 `ensurePagesLoaded` 一起跳过 —— 它 await 的正是那个永不返回的调用。Figma 声明（真有 dynamic-page 且会返回），即时设计 / MG 不声明（MG 未真机验，按保守默认收口，验过能跨页再放开） |
| 2026-10-10 | 用户提出「重新组织资源：做设计前得知道这页/文档有没有定义好组件、变体、样式、变量，要求复用这些重复内容」→ 资源清单改为**面向复用**的形状：加 `summary` 计数；`variants` 展开「维度 → 可选值」；样式由「仅 PAINT」改为**全量四类**并改名 `paintStyles` → `styles`（带 `type`）；并新增**复用纪律**（工具描述 / `jsd://page` 描述 / `mcp.instructions` / `design-strategy` 配方第 0 条四处同源，入口句按平台由 `reuseGuideText` 投影） | 结论不变（仍不引模式、仍复用既有通路）。变了两处的**口径**：① 键数：`paintStyles` → `styles` 是**改名**（未发布，随本批一起走），四类键恒在的约定不变；② `variants[].properties` 在平台读不到时**整个键省略**，不写空对象 —— 「空对象」会被当成「确实没有维度」，那是谎话。用户明确否掉了「每项带 page」：只要文档级清单，不要页归属 |
