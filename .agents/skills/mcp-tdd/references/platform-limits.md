# 已知平台限制 / 语义陷阱

> 何时读：怀疑某现象属平台限制（引擎静默忽略、字段存在但不生效），
> 或已判定一条，要决定「代码兜 / 提示词 / 记账」。

处理口径（三档：**代码兜住 → 提示词 → 记账**，口诀「能代码化的别写提示词，能自动化的别让人记」）
见 `SKILL.md` 的「平台限制：三档处理」，本文件只维护**已知清单**。

## 怎么读这张表：先分两类

「平台不一样」有两种，**处理方式完全不同**，混在一张表里就会把能机器守的约束降级成人肉纪律：

| 类 | 判据 | 处理 | 谁守 |
|---|---|---|---|
| **A 类型系统事实** | typings 里就能看出来（取值域更窄、字段不存在、必填字段更多、字段名不同、形状不同） | 收进 `dicts/platform-value-domain.ts` 或平台门面；**改一条事实只需改一处** | **编译期断言**：三侧 `sync-guarantee.ts`，`tsc --noEmit` 即红 |
| **B 运行时引擎行为** | typings 里看不出来（回显成功实则没生效、不向上传播、静默丢弃） | 三档：能代码兜的兜、兜不住进 `warnings`、仍不行的写进工具描述 | 只能靠**回读证据**（`WriteOutcome`）与真机复验 |

分界的价值：A 类**永不**该出现在「调用方需自己记住」的位置 —— 它已经有编译器与人无关地守着；
B 类才是需要真机复验、需要写进工具描述的那一批。判不出来的现象先按 B 记，别急着升格成 A。

## A. 类型系统事实

> 逐项依据都写在 `dicts/platform-value-domain.ts` 与平台门面的注释里（带 typings 行号）。
> 断言清单与「双向核对」口径见 `docs/design-decisions/0022-*.md` 的「验证」。
> 「类型里有、运行时没有」也算一类（如 MG 的 `mainComponent` 有声明、运行时得用
> `mainComponentId`），写在 `docs/design-decisions/0017-*.md` 的复核表里，不混进本表。

| 现象 | 根因 | 处理口径 | 代码落点 |
|---|---|---|---|
| jsDesign：写 `blendMode: "PASS_THROUGH"` 无任何提示（渲染按默认处理） | jsDesign 的 `BlendMode` 联合只有 16 值，**没有** `PASS_THROUGH`（Figma/MG 都有） | **代码已兜住**：收进声明表的 `deny`；判定在 core 写路径，被拒进结果 `warnings` 并点名「本平台只接受 …」 | `shared/src/dicts/platform-value-domain.ts`、`core/props/platform-gate.ts`、`ui/src/code/jsdesign/sync-guarantee.ts`（断言） |
| MasterGo：`layoutAlign: "MIN"/"CENTER"/"MAX"` 回包成功、画布不变（此前**只打插件 console**，调用方拿到的是「成功」） | MG 的子项 `alignSelf` 只有 `STRETCH \| INHERIT`；同族的 `flexGrow` 是 `0 \| 1` 的**字面量联合**（Figma/jsDesign 都是 `number`） | **代码已兜住**：`deny` + `allow` 两种规则进声明表；判定归位到 core（门面里那份 console.warn 已删——它绕开了 `WriteOutcome`，正是 0007 要根除的静默失效） | 同上 + `ui/src/code/mastergo/sync-guarantee.ts`（断言） |
| MasterGo：给**椭圆**传 `cornerRadius` / `cornerSmoothing` 被静默忽略 | MG 的 `EllipseNode` 只 `extends DefaultShapeMixin, ConstraintMixin`，**不含 `CornerMixin`**（对照：同平台 Rectangle/Polygon/Star/Pen 都含）；且门面的 `has` 有「读得到就算存在」的兜底，`radiusWriter` 原来的 `'cornerRadius' in node` 守卫在 MG 上拦不住 | **代码已兜住**：适用性收窄表（`cornerRadius` / `cornerSmoothing` × `ELLIPSE`）；`radiusWriter` 的两道提前 return 已删（判定必须先于存在性守卫跑） | 同上 + `ui/src/code/mastergo/sync-guarantee.ts`（缺席断言 + 其它形状的存在断言） |
| MasterGo：写 `fills` / `strokes` 带透明度后**回读**是不透明的 | MG 读侧把 SOLID 的 alpha 归一成 1；写与渲染其实都对 —— **导出 PNG 实测中心像素 `a=128`**（#3366FF、alpha 0.5） | **是回读归一，不是写失败**：别据此判定「填充没生效」；要确认透明度请看画布或导出图。代码侧无解（没有别的读 alpha 的入口） | —— |
| 图片填充给 `imageHash` 却不给 `scaleMode`：三平台都可能判整条 paint 非法并丢弃（回读成默认灰） | 三平台 typings 里 `ImagePaint.scaleMode` 都是**必填**（Figma/jsDesign 无 `?`），而线格式曾允许缺省 | **代码已兜住**：`core/normalize` 补 `FILL`（与平台 UI 默认一致） | `shared/src/core/normalize.ts`（`DEFAULT_IMAGE_SCALE_MODE`） |
| 布局网格 `pattern: ROWS/COLUMNS` 缺 `count` / `gutterSize` 时整条网格被丢弃且不报错 | 三平台的 `RowsColsLayoutGrid` 把 `pattern` / `alignment` / `gutterSize` / `count` 全列为**必填** | **代码已兜住**：`count`/`gutterSize` 在 schema 边界就报错（不给猜的余地）；`alignment` 有公认默认（左/上）由 normalize 补 `MIN` | `shared/src/schemas/base.ts`（`layoutGridSchema.superRefine`）、`core/normalize.ts` |
| MasterGo：建矩形给 `GRADIENT_LINEAR` 回读成**默认灰** | MG 的渐变 paint 字段叫 `transform`（本仓线格式是 `gradientTransform`），名字不对 → 缺必填字段 → 整条 paint 被静默丢弃 | **代码已兜住**：门面写时 `gradientTransform→transform`、停靠点补 `a`；读时翻回 `gradientTransform` | `ui/src/code/mastergo/node-facade.ts` |
| MasterGo：组件属性传 `{type,value}` 对象会失效 | MG 的 `setProperties({[id]: string\|boolean})` 只收标量，而 core 的 override-sync 路径会传 `ComponentPropertyValue` 对象 | **代码已兜住**：门面调 `setProperties` 时取对象的 `.value` | `ui/src/code/mastergo/node-facade.ts` |
| MasterGo：实例的 `componentProperties` 项**没有 `id`** | 官方类型把 `id` 写成可选、运行时干脆不给 → 任何「按 propertyId 写属性」的策略在本平台都不成立 | **代码已兜住**：读投影的键取 `id ?? name`；写入时 `remapPropertyIds` 只改写「能对上 id」的键，其余原样（不猜） | `ui/src/code/mastergo/property-values.ts` |

## B. 运行时引擎行为

> MasterGo 是第三平台(0017)：它的差异项与**首次联调必须逐条验**的清单在
> `docs/design-decisions/0017-*.md`，不在此表重复 —— 这里只放**已经在真机上撞到并定论**的现象。
>
> **字段名/参数名别猜**：MasterGo 的权威真源是 `@mastergo/plugin-typings` 的 `dist/index.d.ts`
> （pnpm 下 `node_modules/.pnpm/@mastergo+plugin-typings@<ver>/node_modules/@mastergo/plugin-typings/dist/index.d.ts`）。

| 现象 | 根因 | 处理口径 | 代码落点 |
|---|---|---|---|
| 调 `jsd_set_layout` 改容器 `layoutMode`（如 `VERTICAL`→`HORIZONTAL`）后，容器**自身**的 `primaryAxisSizingMode` 被改成 `AUTO`，显式尺寸随之缩到内容高 | 引擎在切换布局方向时重算容器自身 sizing（与 `insertChildAt` 的副作用同类） | **平台限制，调用方需重设**：改 `layoutMode` 的同批里显式回填 `primaryAxisSizingMode` + 目标尺寸，不要指望原值保留 | —— |
| 父容器 `primaryAxisSizingMode=AUTO` **不会**随子节点的 auto-resize 后高度变化而重算 → 子文本被父卡裁切（实例：子 TEXT 改 `textAutoResize=HEIGHT` 后高 42→105，父卡仍停在 104） | 引擎不向上传播内容尺寸变化，AUTO 撑高是「一次性」的 | **平台限制，调用方需重设**：改动子节点高度后显式 `resize` 父容器到目标高（或把父卡改 `FIXED` 给死高度），别信 AUTO 会自己跟上 | —— |
| `jsd_clone_node` 克隆 INSTANCE：回显的 `parentId` 与 `jsd_find` 都指向**源节点的父级**，副本**实际挂在页面根**；对副本 `jsd_reparent_nodes` 回显 `moved` 却不换父级 → 按父级相对坐标摆放全落到画布空白处 | 引擎 `node.clone()` 产出的副本父指针不更新（`page.appendChild` 只挂树不改指针）；reparent 见「父级已是目标」而静默跳过 | **不依赖克隆做布局**：用现有节点重排。必须克隆时：克隆后先用 `jsd_find 2:1` 看**页面 children 列表**（那才是真相，节点自报的 parentId 不可信），摆位用页面绝对坐标 | 待定：可在 `cloneNodes` 里落树后复核「页面 children 是否含该 id」，不一致就 `warnings` 点名或直接报错（台账未决 `d432b3e41058`） |
| `jsd_swap_component`（核心 `swapComponents`）报 `in swapComponent: Cannot read properties of undefined (reading 'type')` | 引擎的 `instance.swapComponent(component)` 内部读到 undefined——待查（组件与实例同页、id 有效，仍失败） | **暂不用它换状态**：改用既有实例摆位；确需换绑时先构造最小用例复现 | 台账未决 `0332b01901ad`（pending 排查） |
| MasterGo：组件/实例读不到 `children`（但 `findChildren()` / `findAll()` 可以） | `ChildrenMixin.children` 在组件/实例上运行时不给数据；同 mixin 的**遍历入口可用**：`findAll()` 含所有后代、`findChildren()` **只看直接子层**（嵌套时它会漏） | **用遍历入口，别用 children**：要后代用 `findAll`，只要一层用 `findChildren`；本仓已收口在 `mg_list_sublayers` | `ui/src/code/mastergo/ops.ts`（`listSublayers`） |
| MasterGo：容器主轴/交叉轴对齐写 `MAX`（MG `FLEX_END`）或 `SPACE_BETWEEN`（`SPACING_BETWEEN`）**回包成功、画布不变** | **类型里有、运行时没有**：MG typings 的 `mainAxisAlignItems`(index.d.ts:2594) 与 `crossAxisAlignItems`(2595) 取值域**都含** `FLEX_END`/`SPACING_BETWEEN`，但真机逐值实测（FRAME + `flexMode=HORIZONTAL` + 两个子节点，每次只写一个值再回读）只有 `MIN`/`CENTER` 生效 —— 写 `MAX`/`SPACE_BETWEEN` 时**回读保留上一个生效值**（不是归一化成 `FLEX_START`）。故不是类型收窄，正因如此它单独收在 `PLATFORM_RUNTIME_VALUE_DOMAIN`（那张表的断言方向与类型事实表**相反**：登记项必须**在** typings 里） | **代码已兜住**：写前按运行时表拦下，文案明说「运行时实测不接受（平台类型虽然声明支持）」并列出实测支持值；创建**与**回压两条路径都已收口到 `writeProp`（此前创建分支直写、`settle` 回压会把被拒的值再写一遍）。**退出条件**：引擎修好后删掉该表项（没有编译期信号会提醒，需真机复验） | `shared/src/dicts/platform-value-domain.ts`（`MASTERGO_RUNTIME_VALUE_DOMAIN`）、`core/props/platform-gate.ts`（`platformRejectsProp`）、`core/props/writers.ts`、`ui/src/code/mastergo/sync-guarantee.ts`（断言） |
| jsDesign：给 auto-layout 的**子节点**写 `layoutAlign: MIN/CENTER/MAX`，或 `layoutGrow` 写非 `0\|1` 的值 → 回包成功、画布不变、结果**零告警** | 引擎收窄，与 MG **同形**：jsDesign `LayoutMixin` 声明 `layoutAlign` 是 5 值、`layoutGrow: number`，而真机实测子项侧只认 `STRETCH`/`INHERIT` 与 `0\|1`（父设交叉轴 `MAX`、子节点默认贴右 `x=150` 时写 `layoutAlign: MIN` 毫无变化；写 `STRETCH` 立刻生效 `w` 40→180 ⇒ 写入路径本身是通的，是取值被吞）。**类型里有、运行时没有** | **代码已兜住**：收进 `JSDESIGN_RUNTIME_VALUE_DOMAIN`（与 MG 同一张运行时表；断言方向与类型事实表**相反**：登记项必须**在** typings 里），写前拦下并点名本平台接受值。**已知薄弱点**：`layoutGrow` 那条 `InTypings` 断言天然弱（typings 是 `number`，数值域收窄没有类型信号），属**实测冻结**；有信号的是 `RuntimeAlignInTypingsCheck`（字面量联合，塞错值 `tsc` 即红）与 `GrowStillNumberCheck`（官方一收成字面量联合就编译失败 → 挪回类型事实表） | `shared/src/dicts/platform-value-domain.ts`、`ui/src/code/jsdesign/sync-guarantee.ts`（`RuntimeAlignInTypingsCheck` / `GrowStillNumberCheck`） |
| jsDesign：`jsd_combine_as_variants` 恒失败，报 `in get_booleanOperation: Value is not a string`（**组件本身完全正常**：`create_component` / `create_instance` / `mainComponent` 都能用） | 引擎缺陷：合并路径把节点按 `BOOLEAN_OPERATION` 取属性，与组件结构无关（2026-09-24 真机复验：两个同尺寸同层级的合规 COMPONENT，**三种姿势全败**，报错逐字相同）。typings 里 `combineAsVariants(nodes, parent, index?)` 与 Figma **同形** ⇒ 不是「语义不同」，别这么写 | **代码已兜住**：按能力位 `inPlaceVariants` 分流（未声明者克隆优先 + 三姿势兜底），全败时抛富出口文案（附引擎原文 + 「每个状态各做一个 COMPONENT、按『族名 / 状态』命名」的替代做法），**不让调用方去改组件结构、也别重试** | `shared/src/core/component.ts`（`combineAsVariants` 尝试列表）、`shared/src/dicts/capability.ts`（`inPlaceVariants`）、`mcp-server/src/tools/components.ts`（工具描述） |
| jsDesign：给容器写 `layoutGrids` 回包成功、**结果零告警**，但后续 `jsd_find` 恒读不到（同节点同路径的 `effects` 即时回读正常） | **不落盘 + 同执行内无法验证**：写入后同一次执行里怎么读都读得到（含按 id 重新取数 —— 引擎收下的是**未提交状态**），提交后文档里没有它 ⇒ 判据在同一执行内不可能成立。类型面本身齐全（`BaseFrameMixin.layoutGrids` / 网格项字段与本仓线格式**逐字段同名**），故不是参数问题 | **代码已兜住**：该平台列入 `LAYOUT_GRID_UNVERIFIABLE_PLATFORMS`，写后**一律**点名「本平台无法在一次执行内验证」+ 目检出口 —— 既不写「已生效」（会让调用方当真）也不写「写失败」（会被拿去重试）；Figma 等真落盘的平台不受影响 | `shared/src/dicts/platform-value-domain.ts`、`core/props/writers.ts`（`verifyLayoutGrids`） |

| MasterGo：给容器写 `layoutGrids` 回包成功、回读为空（**参数已核实过**） | 引擎不收节点级网格：按 jsDesign 同款规则补齐 `sectionSize` / `offset` 后，五种合法形态（ROWS 默认 STRETCH / ROWS MIN / ROWS CENTER / COLUMNS MIN / GRID）在该平台上**全部零落盘**；同一套参数、同一条写路径在 jsDesign 上**五种全通** ⇒ 排除参数问题。早期「8 帧成 1 条」是**旧参数**时期的观测，别再据此重试；**对照 Figma（2026-09-24 真机）：同一套参数在 Figma 上五种形态全部跨调用回读到、零告警**，甚至在 `layoutMode=VERTICAL` 的 auto-layout 容器上也照样收下并落盘 ⇒ 「布局网格与自动布局互斥」只属 MG，别当三平台通用规律去拦调用方 | **代码已兜住**：MG 列入 `LAYOUT_GRID_UNVERIFIABLE_PLATFORMS`，写后点名「不必然代表写失败」+ 画布目检出口 + 建议在 MG 界面手动添加（自动布局容器不能有网格）。**退出条件**：哪天引擎开始落盘就撤出该名单（无编译期信号，需真机复验） | `shared/src/dicts/platform-value-domain.ts`、`core/props/writers.ts`（`verifyLayoutGrids`） |

| Figma：给 auto-layout 子节点写 `layoutGrow: 3` 直接抛 `in set_layoutGrow: Property "layoutGrow" failed validation: … Invalid literal value, expected 0 / expected 1` | 引擎校验只接受 **0 \| 1**（Figma 的「Fill container」是布尔语义），typings 声明的却是 `number`（`AutoLayoutChildrenMixin`，`plugin-api.d.ts:8281`）—— 而**同一段 JSDoc 的 `@remarks` 自己写了**「0 and 1 are currently the only supported values」(`:8277`) ⇒ 收窄活在文档 + 运行时，不在类型里。与 MG（类型里就是 `0\|1`，`index.d.ts:2475`）、jsDesign（运行时只认 `0\|1`，`plugin-api.d.ts:750`）**三平台结果一致**，依据不同（MG 是类型事实，jsDesign/Figma 是运行时事实） | **代码已兜住**：收进 `FIGMA_RUNTIME_VALUE_DOMAIN`，**写前**拦下并点名本平台接受 `0 / 1`，不再让引擎抛工具级错误；`0`/`1` 照常放行。**断言诚实标注**：数值域的 `InTypings` / `Meaningful` / `Coverage` 三条**天然弱**（登记项必然落进 `number`，填错也判不出），有信号的是 `…StillNumberCheck`（官方哪天收成字面量联合 ⇒ `tsc` 红，退出条件）；值域本身仍靠**真机实测冻结** | `shared/src/dicts/platform-value-domain.ts`、`ui/src/code/figma/sync-guarantee.ts`（`FigmaRuntimeGrowStillNumberCheck`）、`__tests__/write-path.test.ts` |
| Figma：`setProperties` 只收**标量值**，把 `componentProperties` 读回来的 `{type, value}` 原样回喂会被整条拒（`in setProperties: … Unrecognized key(s) in object: 'value'` / `Expected string, received object`），且 `SLOT` 属性明确不收（`cannotSetSlotProperty`） | 读形态 ≠ 写形态：`plugin-api.d.ts:11115` 写侧签名是 `{[名]: string \| boolean \| VariableAlias}`，带 `type` 的对象只是**读**侧形状（同文件 9573-9589 的示例）。本仓四个出口曾直接回喂读形态，而 `jsd_set_instance_properties` 的入参 schema 还明写着「需要显式类型时传 `{type,value}`」⇒ 调用方照文档传必错。MG 门面早有 `unwrapPropertyValues`，所以只在 Figma 爆 | **代码已兜住**：`shared/core/component.ts` 的 `toComponentPropertyWrites` 做唯一映射（裸值原样 / 取 `value` / `SLOT` 跳过并点名），四个出口共用。附带语义：覆盖套用时 `swapToSource=false` **不再**写变体身份（换变体＝换绑，会丢目标既有覆盖），跳过项进 `warnings` —— 完整口径与退出条件见决策 0023 | `shared/src/core/component.ts`、`ui/src/code/figma/ops.ts`、`schemas/results.ts`、`__tests__/write-path.test.ts`、`docs/design-decisions/0023-*.md` |
| Figma：文档里存在「带错误的组件集」时，`jsd_find` **按 type 查找整次报错** `in get_variantProperties: Component set for node has existing errors`，好节点也一起拿不到 | `variantProperties` 是引擎 getter，节点/组件集处于错误状态时会抛；`findNodes` 逐节点调 `serializeNode` **没有单节点保护**，一个坏节点把整次查询掀翻 | **代码已兜住**：① 序列化里该字段改为 try 包裹（取不到就省略，属摘要字段）；② `findNodes` 逐节点降级 —— 单节点序列化失败时回落最小摘要（`id/name/type/x/y`），其余节点照常回传 | `shared/src/core/serialize.ts`、`core/nodes.ts`（`minimalOrFull`） |
| Figma：往**实例**里加子节点被引擎拒（`in insertChild: Cannot move node. New parent is an instance or is inside of an instance`） | 引擎禁止改实例的子结构 ⇒「组件里放占位图标、每个实例插入自己的图标」这类变通不成立 | **需要调用方决策**：`jsd_reparent_nodes` 描述已写明「实例不能当 parentId，要加东西先 detach」；图标插槽的正路是组件属性，见决策 0025 | `tools/nodes.ts`、`0025-*.md` |
## 用法

先把现象在本表对一遍——**命中就照「处理口径」走，别重新发明**；没命中再按三档判断。
判定后**必须补一行进本表**，否则下次还要重新查一遍。

补行时先判类：**能落到 typings 上的放 A 区并同时补一条编译期断言**（只写文档不写断言等于放着一份会漂移的手抄）；
只有真机才看得出、typings 表达不了的才放 B 区。

只有限制**必须由调用方决策**（例如「需要实例级差异时请重建为静态节点」）时才写进工具描述，
且保证**工具描述 + `prompts.ts` 总纲 + `server.ts` 的 `INSTRUCTIONS` 三处一致**。

## 体积治理

本表按「撞一个坑补一行」增长，**上限 20 KB**（由 `tests/skill-doc-budget.test.ts` 守着）。
超限时把「**代码已兜住**且长期未复发」的行滚进 `references/platform-limits-history.md`（冻结只读），
主表只留现行有效的行 —— 不要删行，也不要调高阈值。

> 这是**文档行**的滚动归档，与台账的 `archive` 命令（把已终结的报错事件搬出主库）是两件事，别混。
> 新建 `platform-limits-history.md` 时**必须同时写进 `SKILL.md` 的加载路径**，否则
> `tests/skill-doc-budget.test.ts` 的孤儿检查会判红。历史行滚在 `references/platform-limits-history.md`（只读）。
