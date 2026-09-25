# 0017. 第三平台 MasterGo 接入：节点门面投影 + 契约两处异步化

- **日期：** 2026-09-24
- **状态：** 已采纳（**代码已落地并通过类型检查 / 不变式测试 / 三平台构建**）；**运行期未联调** —— 本仓没有 MasterGo 客户端环境，下文「未联调清单」是首次联调前不可省的动作
- **影响范围：** `shared/`（`dicts/platform.ts`、`dicts/i18n/messages.{zh-CN,en}.ts`、`dicts/node-type.ts` 新增 `MASTERGO_ONLY_NODE_TYPES`、`core/host.ts` 两处契约成员改名、`core/execute.ts`、`core/export.ts`、`__tests__/fixtures.ts`）、`ui/`（新增 `src/code/mastergo/`（`entry.ts` / `host.ts` / `node-facade.ts` / `meta.ts` / `sync-guarantee.ts` / `tsconfig.json`）、`code/{figma,jsdesign}/host.ts` 加异步包装、两侧 `sync-guarantee.ts` 登记新缺口、`vite.config.ts`、`scripts/vite-plugin-manifest.ts`、`tsconfig.json`、`package.json`）、`mcp-server/`（`tools/create.ts`、`tools/nodes.ts` 加平台门控，`tools/platform.ts`、`config.ts` 文案）、`tests/i18n.test.ts`（Windows 路径分隔符归一，见「附带修复」）
- **相关记录：** 平台可移植边界沿用 0009（平台专属约定不进通用技能）；契约异步优先沿用 0010（本次是它第一次反向改动**既有**成员）；Access 层解析收口沿用 0011（MasterGo 无 dynamic-page，故不新增异步入口，走同步回退）；沙箱差异参考 0012（MasterGo 沙箱是否需要 `zodSandboxFix` **未实测**）；错误载荷不分层改动，沿用 0013；面板高度沿用 0014（`mg.ui.resize` 存在，无需新形状）

## 压力

第三个设计平台 MasterGo（莫高设计）要接进来，运行时全局是 `mg`，TypeScript 类型来自
`@mastergo/plugin-typings`（本次核对版本 **2.19.2**，声明文件 3629 行）。

压力不在「多一个平台」，而在**本仓现有平台接入方式在 MasterGo 上不成立**：

1. **既有接入方式是单点断言**：`packages/ui/src/code/jsdesign/host.ts` 与 `figma/host.ts` 都是一行
   `X as unknown as DesignHost` + 一份 `sync-guarantee.ts` 编译期证明「宿主确实有这些符号」。
   这套办法能成立，前提是**宿主与契约同构**（jsDesign 的 typings 本就是 Figma API 的 fork）。
2. **MasterGo 与契约不同构**：属性名、枚举取值、文本属性的存放位置、图片 paint 字段、节点类型名
   都不一样（证据见下）。照抄断言式接入 = 放一片幻影符号给 core 用：读恒 `undefined`、
   写静默无效果，症状会漂到序列化/布局深处。
3. **契约有两处同步成员在 MasterGo 只有异步变体**：`createNodeFromSvg` / `createImage`
   在 MG 分别是 `createNodeFromSvgAsync` / `createImage(...): Promise<Image>`。契约一旦保留同步签名，
   adapter 只能交出 Promise，调用方拿到的是「不是节点的东西」。

## 证据（`@mastergo/plugin-typings@2.19.2`，逐项实测，全文件 grep）

| 面 | 结论 | 证据 |
|---|---|---|
| 全局对象 | `declare global { const mg: PluginAPI }`（另有废弃别名 `mastergo`） | `dist/index.d.ts:1034` |
| `currentPage` / `root` | **`mg` 顶层没有**；`mg.document.currentPage`（`:2692`）、`mg.document.children`（`:2694`） | 全文件 `currentPage` 仅 1 处 |
| `createNodeFromSvg` | 只有 `createNodeFromSvgAsync(svg): Promise<FrameNode>` | `:1413` |
| `createImage` | `createImage(imageData, isSync?): Promise<Image>`；`Image{href, getBytesAsync}`（**不是 `{hash}`**） | `:1526`、`:1066-1069` |
| `createVector` | 不存在；对应 `createPen(): PenNode`，节点类型是 `'PEN'` 不是 `'VECTOR'` | `:1404`、`:3451` |
| `ungroup` | **两级都没有**（PluginAPI 与 GroupNode 全无该符号） | 全文件 0 命中 |
| `layoutMode` / `primaryAxisSizingMode` / `counterAxisSizingMode` | 不存在；实际是 `flexMode` / `mainAxisSizingMode` / `crossAxisSizingMode` | `:2591`、`:2596-2597` |
| 对齐取值 | `mainAxisAlignItems: FLEX_START\|FLEX_END\|CENTER\|SPACING_BETWEEN`（契约是 `MIN/MAX/CENTER/SPACE_BETWEEN`）；`crossAxisAlignItems` 同理 | `:2594-2595` |
| `layoutGrow` / `layoutAlign` | 不存在；`flexGrow: 0\|1`（值域被收窄）、`alignSelf: 'STRETCH'\|'INHERIT'`（**契约的 MIN/CENTER/MAX 无法表达**） | `:2475`、`:2474` |
| `visible` / `locked` / `dashPattern` / `cornerSmoothing` | 不存在；`isVisible` / `isLocked` / `strokeDashes` / `cornerSmooth` | `:2403-2404`、`:2531`、`:2558` |
| `absolutePosition` | 不存在（只有 `absoluteTransform`、只读 `absoluteBoundingBox`） | 全文件 0 命中 |
| `vectorPaths` | 不存在；矢量路径是 `penNetwork` 顶点模型（`VectorPath` 形状也不同） | `:2832`、`:2815-2823` |
| 文本属性 | `fontSize/fontName/lineHeight/letterSpacing/textCase/textDecoration/textStyleId` **不在 TextNode 上**，只有分段 `textStyles[]` + `setRangeXxx(start,end,…)` | `:2896-2950` |
| 混合哨兵 | `readonly mixed: string \| symbol` —— 契约 `MIXED='figma.mixed'` 直接 `===` 可能恒 false | `:1355` |
| 图片 paint | `ImagePaint.imageRef`（契约线格式是 `imageHash`）；paint 可见性是 `isVisible` | `:2263-2265` |
| 约束/网格取值 | `ConstraintType: START\|END\|STARTANDEND\|CENTER\|SCALE`（契约 `MIN/MAX/STRETCH`）；网格 `gridType ROWS\|COLUMNS` + `alignment LEFT\|RIGHT`（契约 `pattern` + `MIN/MAX`） | `:2206`、`:2608-2634` |
| 布尔/组合运算 | `union/subtract/intersect/exclude/flatten/combineAsVariants` **都没有 parent 参数**，`flatten` 可返回 `null` | `:1415`、`:1426-1430` |
| `componentProperties` / `variantProperties` | 存在但是**数组**，线格式是 `Record` | `:3096`、`:3056`、`:3092` |
| 能对上的 | `getNodeById`、四个 `getLocal*Styles()`（同步）、`clientStorage.*Async`、`ui.postMessage` / `ui.onmessage` / `ui.resize`、`showUI`、`viewport.scrollAndZoomIntoView`、`findAllWithCriteria`、`mainComponent` / `swapComponent` / `detachInstance` / `resetOverrides` / `outlineStroke` / `exportAsync` / `loadFontAsync` / `listAvailableFontsAsync` / `importComponentByKeyAsync`、`on('selectionchange', (ids: string[]) => …)` | 见 `mastergo/sync-guarantee.ts` 的逐条断言 |
| manifest | 字段集不同：无 `editorType` / `documentAccess` / `networkAccess`，`permissions` 只有 `currentuser`，`id` 可省（导入时系统生成） | 官方开发指南 |

## 候选与排除

| 候选 | 结论 | 理由 |
|---|---|---|
| 照抄单点断言（`mg as unknown as DesignHost`） | 排除 | 上文 12 项重命名 + 2 处同步/异步不匹配 → 断言通过、运行时全错（读 undefined、写静默无效果） |
| 把平台差异下沉进 core（加平台分支） | 排除 | 退化成平台判断散落 core，与既有 Port/Adapter（`DesignHost`）边界冲突；也违背 0002 的显式注入取向 |
| **adapter 内做节点门面投影** | **采用** | 差异收在 `ui/src/code/mastergo/` 两处（宿主层符号在 `host.ts`、节点层字段/取值/文本在 `node-facade.ts`），core 与线格式保持平台无关 |
| 用「原型委派对象」`Object.create(raw)` 做门面 | 排除 | 读够用，**写会落成门面自己的属性**（`node.fills = …` 宿主一无所知）—— 又是一类静默失效 |
| **Proxy 门面（只拦差异键，其余直通宿主、`this` 绑宿主、按 id 缓存保 identity）** | **采用** | 读写在同一个 trap 里收口；`has` 一起拦（core 有 `'layoutMode' in node` 的判定）；缓存避免同名节点两次包出不同对象 |
| 契约保留同步 `createNodeFromSvg` / `createImage` | 排除 | MG 无同步变体，adapter 交不出同步返回值；且 0010 的异步优先纪律正是为此设的 |
| 契约把 `createImage` 改名为 `createImageAsync` | 排除 | **名字撞车**：Figma（`plugin-api.d.ts:1701`）与 jsDesign（`plugin-api.d.ts:122`）已有 `createImageAsync(src: string)`，收的是**来源字符串**、语义不同 —— 沿用同名会让后来人静默错用 |
| **契约改名为 `createNodeFromSvgAsync` / `createImageFromBytesAsync`（按语义命名避开撞车）** | **采用** | 同步性写进名字；字节语义写在名字里 |
| 平台无法表达的能力照常放行、让宿主报错 | 排除 | 症状会变成「成功但空」（空矢量）或深层异常；按已有先例（`platforms` + `platformNote`）显式拒绝 |
| **`jsd_create_vector` / `jsd_ungroup_nodes` 加平台门控** | **采用** | MG 无解组 API；矢量路径模型不同形，建出来会是空矢量 |
| claim 一批能力（textTruncation / componentProperties / inPlaceVariants）显得「支持更多」 | 排除 | 逐项对不上（属性不存在 / 形状不同 / 是否原位合并未实测）。`meta.capabilities` 只留核对过的 `styles` |

## 结论

1. **第三平台走「门面投影」而不是「单点断言」**：`mastergo/host.ts` 显式实现 `DesignHost`（宿主层差异：
   `document.currentPage` / `document.children` 投影、组合运算补 `appendChild`、`createImage` 的
   `href` 当本地图片引用、`createVector → createPen`）；`mastergo/node-facade.ts` 用 Proxy 收口节点层
   差异（重命名表、枚举映射表、文本 `setRange*` 桥、`mg.mixed` 归一、paint 的 `imageRef↔imageHash`、
   `PEN→VECTOR`）。**只投影，不定策略**：调用顺序、事务边界、告警出口一律不动。
2. **契约两处成员改异步**：`createNodeFromSvgAsync`、`createImageFromBytesAsync`。figma / jsDesign 侧
   用 `Object.create(native, …)` 把同步原生方法包成 async（**不用对象展开**——展开会把宿主全局属性
   全部立即读出，`currentPage` / `viewport` 这类 getter 启动早期读会抛）。
3. **编译期证明映射表本身诚实**（`mastergo/sync-guarantee.ts`）：表里每个契约名必须在 MG typings 里
   **缺席**、每个 MG 名必须**存在**；文本字段在 `TextNode` 上必须缺席、对应 `setRangeXxx` 必须存在；
   枚举取值必须落在 MG 字段的值域内；登记为「MG 无法表达」的成员必须真的都不在 typings 里。
   表改了断言跟着走，不手抄第二份名单。
4. **无法表达的能力显式拒绝**，不静默降级：`jsd_ungroup_nodes`、`jsd_create_vector` 用
   `platforms: ['jsdesign','figma']` + `platformNote` 门控。
5. **平台专属约定仍不进通用技能**（0009 的边界不变）：平台差异只写在代码与本文，不写进
   `.agents/skills/software-design-patterns/`。

## 未联调清单（首次在 MasterGo 客户端跑起来时必须逐条验）

1. **Proxy 沙箱兼容**：MG 沙箱是否允许 `Proxy` 包宿主节点对象（jsDesign 的沙箱对全局标识符有拦截，
   见 0012）。若不允许 → 门面要退化成显式包装对象（写路径必须保留 setter，不能用原型委派）。
2. **`zodSandboxFix` 是否需要**：`vite.config.ts` 目前只给 jsdesign 挂。若 MG 沙箱也拦
   `globalThis.__zod_*`，插件一启动就会抛。（**已实测通过**：不挂该插件，MasterGo 里插件正常
   启动并响应 ping —— 见下方联调记录）
3. **文本桥**：整段 `setRangeFontName/FontSize/…` 是否需要先 `mg.loadFontAsync`；多段文本时读回的
   「分段不一致 → 混合哨兵」是否符合宿主实际；`characters` 写入后长度变化对 range 的影响。
4. **枚举映射回读**：`flexMode`/`mainAxisAlignItems`/`constraints`/`layoutGrids`/`strokeCap` 写入后
   回读是否与写入值一致（对齐类属性在 jsDesign 上就有「写→回读不一致」的同族问题）。
5. **图片链路**：`createImage(bytes)` 的 `href` 能否直接当 `imageRef` 写进 `fills`（IMAGE paint）。
6. **组合运算落点**：`mg.union/…` 产出的节点 `appendChild` 到目标父级后，坐标是否自动换算（若自动
   换算，`appendTo` 需要补一次绝对坐标还原）。
7. **`combineAsVariants` 是否原位合并**：决定 `inPlaceVariants` 能力能不能 claim（claim 了会改 core
   的合并首选顺序）。
8. **`ui.resize` / 面板高度**：MG `UIAPI.resize` 存在，但窗口下限与 `showUI` 的 `height` 语义未实测。
9. **桥接网络**：MG manifest 无 `networkAccess` 字段，UI iframe 到本机 daemon 的 WebSocket 是否
   受策略限制（Figma 侧要 `allowedDomains`，MG 侧未知）。（**已实测通过**：MasterGo 面板的
   webview 直连 `ws://localhost:47812` 成功，daemon 侧可见 `插件已连接`）
10. **`jsd_set_instance_properties`**：MG `setProperties` 只收 `string | boolean`，线格式允许
    `ComponentPropertyValue` 对象 —— 传对象时的行为未实测，需要时补门面转换或门控。

联调后按既有纪律把「平台限制」补进 `.agents/skills/mcp-tdd/references/platform-limits.md`
（三档口径：代码兜住 → 提示词 → 记账），把实际报错补进台账。

## 联调记录（2026-09-24，首次接通）

环境:MasterGo 客户端(桌面端)加载 `packages/ui/dist/mastergo/manifest.json`,daemon 为本仓
`packages/mcp-server/dist/index.js`(0.8.2),MCP 侧用 stdio 客户端按协议走
`initialize → tools/list → tools/call`。

**已验通过**

| 项 | 证据 |
|---|---|
| 面板 → daemon 的 WS 直连(清单 9) | daemon 日志 `插件已连接(peer=::1:…)`;UI 的 `ui-probe` 探测收到 `pong` |
| 不挂 `zodSandboxFix` 也能启动(清单 2) | 不挂该插件,插件正常 load 并响应 ping |
| daemon → UI → code → 回包 全链路 | `jsd_ping` 返回 `{connected:true, platform:"mastergo", capabilities:["styles"], coreCapabilities:[…6 项]}` |
| 第三平台贯通 MCP 侧 | `jsd://platform/state` 缓存 `platform: "mastergo"`;平台显示名走 i18n(`MasterGo`) |
| 平台门控 | `jsd_create_vector` / `jsd_ungroup_nodes` 返回「仅适用于 即时设计 / Figma,当前插件平台是 MasterGo,已拒绝执行(未向插件发起请求)」+ `platformNote` |
| 读路径门面(真机) | `jsd_get_selection` → `{selection:[], pageName:"页面 2"}`;`jsd://page` → `{pageName, nodes, count, pages:[{name, childCount}]}`;`jsd://styles` → `{styles:[], count:0}`;`jsd_find` → `{nodes:[], total:0}`。即 `mg.document.currentPage` / `selection` / `name` / `root.children` / 四个 `getLocal*Styles` 投影都按预期工作 |

**撞到并修掉的 bug:宿主信封差异(最值得记的一条)**

症状:插件面板已连上 daemon、`ui-probe` 有回包,但 daemon 发起的 `jsd_ping` **5 秒超时**,
两侧都不报错。日志时间线把根因钉死了:`r1 ping` 发出(16:43:16.934)→ 5 s 超时(16:43:21.948)
→ **+25.003 s** 出现 `未匹配响应: id=r1`(16:43:41.937)。25 s 正是 `UI_FORWARD_TIMEOUT_MS`
(`connection.ts`)—— 即 UI 把请求转发给 code 后一直没等到可用回包,直到自己的转发预算耗尽才回错。

根因:MasterGo **不拆** `pluginMessage` 信封。官方开发指南里 UI 发
`parent.postMessage({ count: 3 }, '*')`,代码侧 `mg.ui.onmessage = (msg) => console.log(msg)`
直接打出 `{ count: 3 }`;而 Figma / jsDesign 会替调用方拆开。本仓两端都按 Figma 约定写死:
UI 发 `{pluginMessage: <载荷>}`、UI 只认 `event.data.pluginMessage`。于是 MasterGo 上
code 侧收到的 `msg.method` 是 `undefined`(回的「未知方法」其 `id` 也是 `undefined`),
UI 侧 `if (!pm.id) return` 又把这条回包丢掉 —— 两侧同时错位,表现为**纯超时**。

修法(两端容错,不赌宿主实现):`bridge/codeChannel.ts` 增加 `readCodeMessage`(有信封取载荷、
没有就用原始值,且仍要求是带字符串 `type` 的对象,免得把 iframe 里其它来源的 message 当协议帧);
`mastergo/envelope.ts` 的 `unwrapHostMessage` 在 code 侧入口收口拆包(接在 `host.ts` 的
`ui.onmessage` setter 上,`null` 按宿主要求换算成 `undefined`)。回归守卫:
`packages/ui/src/bridge/codeChannel.test.ts`(两种形状都要认)。

**新发现(真机观测,尚未处理)**:`jsd_list_fonts` 在 MasterGo 上回包 **321,995 字符 / 约 1900
个家族**(MG 的字体库比 jsDesign 大一个量级),而该工具入参 schema 是 `z.object({})` —— 没有筛选或
分页参数,整表必然进模型上下文。口径未定:可选「工具加 `family` 过滤 / 分页」(代码兜住)或
「先在工具描述里点名体积、要求调用方按需取用」(提示词档)。这条要单独定,不在本次改动范围内。

**写路径冒烟(2026-09-24,真机)**

| 项 | 结果 |
|---|---|
| 建容器(布局/内边距/对齐) | ✅ `layoutMode:"VERTICAL"`、`itemSpacing:12`、`paddingTop/Left:16`、`primaryAxisAlignItems:"MIN"`、`counterAxisAlignItems:"CENTER"` **全部回读正确** → 清单第 4 条(枚举映射回读)通过 |
| 建矩形 + 圆角 | ✅ `cornerRadius:8` 与四角 8 回读正确 |
| 建文本(内容/字体/字号) | ⚠️ `characters` 写入正常;`fontSize`/`fontName` **读不回** → 根因:MG 的分段样式是嵌套结构(`seg.textStyle.fontSize`),门面按顶层读。**已修** |
| 改文本字号(仅传 fontSize) | ❌ 报 `Cannot use unloaded font "PingFang SC Regular"` → 根因:MG 要求该段当前字体已加载,而读不到当前字体、其默认字体又不在可用清单(1850 族 0 命中 `PingFang`)。**已修**:`loadFont` 不再吞失败,加载不成功就跳过并点名,且删掉了旧的 `PingFang SC` 兜底假设 |
| 写矩形 fills | ❌ 回包「已更新」但**回读仍是默认灰** → 根因:MG 的 `SolidPaint.color` 是 `RGBA`(要 `a`),本仓把透明度折在 paint 级 `opacity`、颜色只有 `{r,g,b}` → 缺 `a` 被静默丢弃。**已修**:写时折 `opacity→color.a` 并补 `a:1`,读时 `a<1` 折回 `opacity` |
| Proxy 沙箱(清单 1) | ✅ **通过**:建节点/读写属性全程走 `Proxy` 门面,MG 沙箱未拦 |
| `jsd_ungroup_nodes` / `jsd_create_vector` 门控 | ✅ 已在平台层被拒(见上表) |

**复验(2026-09-24,插件重载新 bundle 后)**

| 项 | 结果 |
|---|---|
| `jsd_list_fonts {family:"source", limit:4}` | ✅ 只回 `["Source Code Pro","Source Han Sans","Source Han Serif CN","Source Sans 3"]` —— 过滤与分页都生效 |
| 建文本带 fontName | ✅ 回读 `fontSize:24` + `fontName:{Inter,Black}` —— 嵌套读修复生效 |
| 仅改字号(不传 fontName) | ✅ `jsd_set_text {fontSize:40}` 成功,回读 40 —— 字体加载前置修复生效 |
| 建矩形 `fills:#ff6600` / 圆角 8 | ✅ 回读 `fills:[{type:"SOLID",color:{r:1,g:0.4,b:0}}]`、四角 8 —— paint 修复生效 |
| 透明度(`#3366ff80` / `color.a:0.5`) | ⚠️ **写进去了、渲染也对**:导出 PNG 中心像素 `r=50 g=102 b=255 a=128`;但**回读**拿不到(`color.a` 被 MG 归一成 1)。已按「回读归一 ≠ 写失败」记进 platform-limits |

**又一个仓库级缺陷(非平台差异,已修)**:`jsd_list_fonts` 与 `jsd_get_selection` 声明了 `method` 却**没挂 `inputSchema`** —— 没有它时 MCP 侧按空对象校验,入参被**静默丢弃**(实测:`family`/`limit` 传了等于没传,`depth` 永远走默认值)。两处已补 schema,并加了入参非法值会被拒的验证(`limit must be <= 500`、`depth must be number`)。审计了全部 53 个工具:除 `jsd_ping`(本就无参)外无其它遗漏。

三处修复的判定口径也补进了 `.agents/skills/mcp-tdd/references/platform-limits.md`(「撞一个坑补一行」)。
修复后的复验要等 MasterGo 里**重跑插件**(面板保持着旧 bundle)。

**冒烟 #3/#4(2026-09-24,覆盖剩余项)**

| 项 | 结果 |
|---|---|
| `jsd_create_svg` | ✅ 建出 80×80 FRAME(`createNodeFromSvgAsync` + SVG 树门面化都正常) |
| 渐变填充 | ❌→✅ 初测回读成**默认灰**;根因:MG 字段叫 `transform`(本仓 `gradientTransform`)+ 停靠点要带 `a` 的 RGBA。门面双向映射后回读正确 |
| 阴影 + 模糊 | ❌→✅ 初测 `effects` 不落盘;根因:MG 必填 `isVisible`/`spread`/`blendMode`/`showShadowBehindNode`,模糊另有必填 `gradient`。门面补默认值后 `DROP_SHADOW` + `LAYER_BLUR` 都落盘 |
| 建组(带布局) | ✅ `FRAME` + `layoutMode:"HORIZONTAL"` + `itemSpacing:20` + `AUTO` sizing 回读正确 |
| 属性写:改名/移动/缩放/隐藏 | ✅ `WB4-改名后` / `x,y=400,350` / `90×70` / `visible:false` 全部回读正确(`isVisible` 双向都通) |
| reparent | ✅ 换父后 `parentId` 与相对坐标正确 |
| flatten | ✅ 两矩形合并为一个 **VECTOR** 节点(`PEN→VECTOR` 映射生效,原件被吸收) |
| 图片填充 | ✅ `fills` 回读 `{type:"IMAGE", imageHash:"109361601717249/…png", scaleMode:"FILL"}` —— `href→imageRef` 与回读反向映射都通 |
| 组件:建组件 / 建实例 / 脱钩 | ✅ `COMPONENT` / `INSTANCE` / 脱钩回 `FRAME` 都对 |
| 组件属性对象值 | ⚠️ `jsd_set_instance_properties` 的**工具 schema 只收字符串**(`z.record(z.string(), z.string())`,与平台无关);core 的 override-sync 路径会传 `ComponentPropertyValue` 对象 → 门面取 `.value` 兜住 MG |
| 变体集 | ⚠️ `combine_as_variants` 建出了 `COMPONENT_SET`,但**是否原位合并仍未定论**(页面同时留有原节点);因此 `inPlaceVariants` 能力**继续保持不 claim**(不 claim 只会走保守顺序,claim 错会改 core 的首选姿势) |

上面那张表里 193 / 194 两行的**存疑项已在下一节解决**(工具 schema 已放宽;变体集已验证原位并 claim)。
清单里的 1 / 3 / 4 / 5 / 6 / 7 也都已验过(见「写路径冒烟」「复验」「冒烟 #3/#4」各表)。

变体值的**写入**路径在下一轮又发现问题(两条原生入口运行时静默无效),已另立 0018 改为「集合内换绑 + 回读校验」——
本文件里凡提到 `setVariantPropertyValues` 作为写入入口的段落,以 0018 的结论为准。

**当前仍未验**(截至 2026-09-24):MG 侧**布尔/文本/换绑**组件属性的真机写入 ——
实测「带文本子节点的组件」在 MG 上 `componentPropertyValues` 是**空的**(MG 不会像 Figma 那样
把子文本自动暴露成 TEXT 属性),必须先 `addComponentProperty`。**该入口已补上**:见 0019 的平台 op(`mg_add_component_property` 等),**加/改/删已真机通过**。
「写实例值」的验证路径也打通了:用 `mg_list_sublayers` 读**绑定的图层**
(`characters`/`isVisible` 跟随即生效)—— 详见 0019 的四次复验结论。

**另一处观察(联调时反复撞到)**:`jsd_delete_node` 的 `ids` 列表里只要有一个 id 已不存在,
整次调用就报错且**不部分执行** —— 批量清理时要先按 `jsd_find` 过滤出仍存在的 id。

## 按 typings 复核(2026-09-24 第三轮:把「找不到的字段/参数」回类型里找)

口径:**MasterGo 的字段名、参数名、必填项一律以 `@mastergo/plugin-typings` 的
`dist/index.d.ts` 为准**(本地 pnpm 路径
`node_modules/.pnpm/@mastergo+plugin-typings@2.19.2/node_modules/@mastergo/plugin-typings/dist/index.d.ts`),
按符号 grep 出行号后回代码落映射;不靠记忆、不靠猜。本轮据此改掉三处「靠形状猜」的实现。

| 符号(typings 行号) | 类型声明 | 我们原来的做法 | 改法 |
|---|---|---|---|
| `VariantProperty{property, value}`(2958) / `InstanceNode.variantProperties: Array<VariantProperty>`(3092) | 数组 | 投影(上一轮已做) | 抽成纯函数 `readVariantProperties`(可单测) |
| `InstanceNode.componentProperties: Array<ComponentProperties>`(3096),项 `{name, id?, type, value, preferredValues?, alias?, isDefaultValue?}`(3020) | 数组 | **一律判「读不到」**(注释写「未建模」) | 投影成契约的 `Record<string, ComponentPropertyValue>`,键取 `id ?? name`,只透传契约认得的三个字段 |
| `setProperties(properties: { [propertyId: string]: string \| boolean }): void`(3097) | 键是 **propertyId** | 直接把「名字键」透传 | 新增 `remapPropertyIds`:名字能对上 `componentProperties[].id` 就改写键,对不上原样(不猜) |
| `setVariantPropertyValues(property: Record<string, string>): void`(3057 / 3094,`ComponentNode` 与 `InstanceNode` **都有**) | 同步 void | 已分流(上一轮) | 断言补一条「`ComponentNode` 上也有」 |
| `PluginAPI.variables: VariableAPI`(1522) | 完整变量 API | 工具面完全不可达(platformOps 只有 Figma) | **不动**:见下「变量」 |

**连带修掉的一处契约收窄(与平台无关)**

`DesignHost.setProperties` 的值类型原本是 `string | ComponentPropertyValue` —— **漏了 `boolean`**,
而两平台原生入口都收 `string | boolean`(Figma `setProperties({[名]: string|boolean})`、
MG 同上但键是 propertyId)。也就是说**布尔组件属性在两个平台都设不了**,工具 schema
(`z.record(z.string(), z.string())`)把限制又抄了一遍。本轮一起放宽:

- 契约:`shared/src/core/host.ts` 的值类型补 `boolean`;
- 入参 schema:新增 `componentPropertyInputSchema = string | boolean | {type,value,preferredValues?}`
  (`shared/src/schemas/platform.ts`),`split-ops.ts` 的 `setInstancePropertiesSchema` 与
  `inputs.ts` 的聚合 op 同宽;
- core:`setInstanceProperties` 的形参同步放宽(`core/component.ts`);
- 工具描述:`jsd_set_instance_properties` 不再指向 Figma 专有的 `variantGroupProperties`,
  改指向本仓线格式的 `variantProperties` / `componentProperties`。

**变量(MasterGo)**

`mg.variables: VariableAPI` 确实存在,能力不小:`createCollection`(Promise)、`createVariable`
(Promise<Variable|null>)、`getVariables(options?)`、`setVariableValue({id,value,modeId})`、
`setVariableReference({id,reference,…})`、`unlinkVariable`、`createVariableInComponent` /
`createVariableInLayer`(见 1098–1280 行)。但:

- 本仓的变量能力挂在 **platformOps**(`jsd_platform_op`),而 platformOps 目前只有 Figma 有实现,
  MasterGo 的 `meta.platformOps` 是空数组 → **工具面完全不可达**(真机验过:daemon 直接拒绝并给出替代路径);
- MG 的变量模型与 Figma 也不同形(集合/模式/`setVariableReference` 的 `textProperty`/`strokeProperty` 等
  按属性分片的入参),照搬 Figma 的 op 参数会错。

故本轮**仍不 claim 变量能力**。要做的话是新功能(决策记录 + 实现 + 真机验),不是接线的余量。

**本轮改动的落点**:`ui/src/code/mastergo/property-values.ts`(新,纯函数 + 7 条单测)、
`node-facade.ts`(读路径改调投影)、`sync-guarantee.ts`(补 `VariantProperty` 字段检查、
`setVariantPropertyValues` 双节点检查、`setProperties` 只收标量的断言)、`shared/core/host.ts`、
`shared/schemas/{platform,split-ops,inputs}.ts`、`shared/core/component.ts`、
`mcp-server/src/tools/components.ts`。

## 附带修复（本次顺带，不是 MasterGo 引入的）

`tests/i18n.test.ts` 的中文棘轮在 **Windows 上一直失效**：白名单写的是 POSIX 风格前缀
（`packages/shared/src/core/`），而 `path.join` 在 Windows 产出反斜杠，`startsWith` 永不匹配，
整段白名单被绕过（表现是数百条误报，`pnpm run test` 常红）。修法是把相对路径归一成 `/` 再比较
—— 断言规则与白名单**一字未改**。

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-24 | 新建；第三平台接入落地（门面投影 + 两处契约异步化 + 两处工具门控） |
| 2026-09-24 | 首次联调接通：修掉宿主信封差异（`pluginMessage` 拆包，两端容错 + 回归测试）；清单 2、9 验过；清单 1 部分验证 |
| 2026-09-24 | 真机只读冒烟：读路径门面（currentPage / selection / root.children / 本地样式）全通；发现 `jsd_list_fonts` 在 MG 上 322 KB（口径待定） |
| 2026-09-24 | `jsd_list_fonts` 加 family 过滤 + 分页（默认 50 / 上限 500，带 total/truncated）+ 回归测试；真机写路径冒烟抓到并修掉三个 MG 差异（文本嵌套读、字体加载前置、SOLID paint 的 `a`）；Proxy 沙箱与容器布局映射验过 |
| 2026-09-24 | 插件重载后复验全绿；另修两处「漏挂 inputSchema 导致入参被静默丢弃」（`jsd_list_fonts` / `jsd_get_selection`）并审计其余工具；透明度判定为「回读归一、写与渲染正常」 |
| 2026-09-24 | 冒烟 #3/#4：再修三处字段形状差异（渐变 `transform`、效果必填字段、`setProperties` 标量）；SVG 导入/属性写/reparent/flatten/图片填充/组件链路全通；变体集原位语义仍未定论（故不 claim `inPlaceVariants`） |
| 2026-09-24 | 变体/变体属性/变量三项：变体集验证为**原位**（claim `inPlaceVariants`）；变体属性读投影、写经 `setVariantPropertyValues` 分流；`mainComponent` 回退 `mainComponentId`；变量工具面不可达（不 claim） |
| 2026-09-24 | 按 `@mastergo/plugin-typings` 复核：`componentProperties` 数组→Record 投影、`setProperties` 键归一到 propertyId（纯函数 + 单测）；连带把 `setProperties` 的值类型从 `string\|对象` 放宽为 `string\|boolean\|对象`（契约 + 两处 schema + core 形参 + 工具描述），修掉「布尔组件属性两平台都设不了」 |
| 2026-09-24 | 真机复核通过：`variantProperties`/`componentProperties` 读投影生效、`mainComponentId` 回退生效（`copy_overrides` 拿到快照）、变体集**再次确认原位**（claim `inPlaceVariants`）；另发现变体**写入**静默无效 → 另立 0018（其换绑方案已真机复验通过） |
