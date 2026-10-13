# 7165f370. 批量编排补上资源名字寻址与变量聚合绑定：一次调用绑多组，VARIANT 只能点名拒绝

- **日期：** 2026-10-13
- **状态：** 已采纳
- **影响范围：** `mcp-server/tools`（batch 编排、平台事实投影、配方文案）、`shared`（`schemas/{platform,batch}`、`core/component`、`core/host`、`dicts/{platform-knowledge,platform-value-domain,i18n}`）、`ui/code/{figma,mastergo}`（变量绑定 op 契约）、`ui/code/plugin`（写路径平台门）
- **相关记录：** 沿 0024（`boundVariables` 按引擎词汇原样透传）、0023（读形态 → 写形态单点映射）、0040（MG / Figma 变量 op 同形）、0032（平台差异只落声明表与投影点）、0022（判定归 core，门面 `console.warn` 不算）、0041（不确定就点名，绝不猜）、0007（不允许静默失效）

## 压力

1. **变量面「有库存、零使用」**：实测一份 Figma 文档建有 18 个 COLOR 变量（集合 `23:105`），节点填充逐个等于 token 值，`jsd_find` 回包却**一条 `boundVariables` 都没有** —— 建屏时走的是 `jsd_set_fill_color` 的字面 paint,而绑定是独立一步（`figma_variables_apply`）。仓库里没有任何一条路让「按已有 token 铺满整档」在一次调用里做完。
2. **一步只吃一组，50 步上限卡死**：`figma_variables_apply` 的形状是「一个 `variableId` × 一个 `boundProperty` × 一批 `nodeIds`」，18 变量 × fills/strokes ≈ 36 步，而 `batchSchema.calls` 上限是 50（`shared/src/schemas/batch.ts`）—— 再加 strokes 或 effects 就装不下，只能拆批、跨批又必须把 id 硬编码回来。
3. **批内无法寻址已存在的资源**：占位符只认**本批步骤结果**（步骤表随调用结束销毁），所以「用哪个组件建实例」「这个填充绑哪个变量」都得先在批次外 `jsd_get_page` / `figma_variables_list` 摸一次 id 再抄进 args。名字是本仓最稳的资源标识（`findLocalStyleId`、`jsd_find` 的 name 过滤都按名字工作），id 每次都要重摸。
4. **「变体变量」这个诉求本身是假的**：`VariableResolvedDataType` = `BOOLEAN|COLOR|EASING|FLOAT|STRING|TIMING`（`@figma/plugin-typings@1.139.0` `plugin-api.d.ts:11571`），MG 的 `VariableType` 十二项（`@mastergo/plugin-typings@2.19.2` `dist/index.d.ts:1832`）—— **两家都没有 VARIANT 类型变量**；`VariableBindableNodeField`（:6817-6844）也不含 `variantProperties`。真实存在的是另一件事：Figma `setProperties` 的值收 `VariableAlias`（:11123，官方还给了 `createVariableAliasByIdAsync` :2214 专门用于「属性值绑变量」），而 MG（:3097 只收 `string|boolean`）与 jsDesign（只收 `string`）不收。
5. **既有词汇谎言**：`figma_variables_apply` 的描述写着 `boundProperty(如 fills/strokes/effects/backgrounds)`。`backgrounds` 是即时设计词汇，Figma 节点无此字段；`effects` 不在 `setBoundVariable` 的字段表里（effect 的变量绑在**数组项**上，入口是 `setBoundVariableForEffect`）。按描述写的调用会把节点静默推进 `failed`，正是 0007 要根除的那类失效。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| apply op 一次吃 `bindings[]`，两种形状都收（旧的扁平字段 + 新的数组） | 排除 | 契约里同时住着一套词汇 = 一份事实写两处；调用方要猜哪个优先，文档、错误文案、配方三边都要各说一遍 |
| 在 `jsd_batch` 里特判 `jsd_platform_op` 并按 op 名扇出多组 | 排除 | 编排器从此持有平台 op 的语义（0032：平台差异只落声明表与投影点）；且直接调用 `jsd_platform_op` 的路径照样一步一组，覆盖面留洞 |
| 名字寻址做 daemon 级跨调用缓存 | 排除 | 本仓没有任何**文档级**失效事件（`platform-state.ts` 只在连接/断开时变），缓存会拿着旧资源表判新名字，命中失败与「名字确实不存在」再也分不开。改成**每批最多读一次、批内共用同一份快照**：新鲜度等于现读，成本等于一次往返 |
| 名字寻址支持模糊匹配 / 相似度取最近 | 排除 | 0041：能唯一确定才动手。名字不唯一时替调用方挑一个,等于把绑错的色板写满整档 |
| 组件属性值绑变量做进 `figma_variables_apply`（`boundProperty: 'componentProperties'`） | 排除 | 引擎的写入口不是 `setBoundVariable` 而是 `setProperties(VariableAlias)`,两个 op 各管各的入口，混进一个参数面就要在 apply 里重建实例属性表 |
| 只补文档与配方、不动契约 | 排除 | 「一次调用绑不满一档」与「批内取不到 id」是能力缺口，不是文案缺口 |

## 结论

三条独立的改动，各自守住一条既有纪律：

1. **聚合绑定**：`figma_variables_apply` / `mg_variables_apply` 的入参改成 `{ bindings: [...] }`，一组 = 一个变量 × 一个字段/槽位 × 一批节点。两家**同形**（0040），槽位词汇各按自家引擎原样（0024）。Figma 按 typings 把 `boundProperty` 分三档入口 —— 节点级字段走 `setBoundVariable`、`fills`/`strokes` 绑在 paint 自身（`index` 省略 = 全部 SOLID 项）、`effects`/`layoutGrids` 绑数组项（必填 `subField` + `index`）；表外字段**当场点名拒**并给原因（`backgrounds` 是别家词汇 / `variantProperties` 不可绑 / `componentProperties` 改走属性 op）。
2. **批内名字寻址**：占位符新增资源命名空间 `{{@comp:名称}}`（组件与变体集）与 `{{@var:名称}}`（变量），取值来自 `jsd_get_page` 的 `assets`，**每批最多读一次**、批内共用同一份快照。精确名优先、再退 trim + 忽略大小写（与 `findLocalStyleId` 同一条匹配纪律），零命中或多命中都点名中止整批并列出候选。
3. **组件属性值绑变量（只 Figma）**：写路径的入参形态扩到 `{type, value:{type:'VARIABLE_ALIAS', id}}`，别名**原样带上**引擎（`toComponentPropertyWrites` 不再把它摊平成 id 字符串 —— 摊平等于把「跟随变量」写成「值等于那串 id 文本」，是静默改语义）。收不收这种形态不手写：查 `dicts/platform-value-domain.ts` 第四类表（MG / jsDesign 早已 deny `variableAlias`），被拒时点名中止 —— 与 `core/props/platform-gate.ts` 同一个判据（0022）。

**「变体变量」不做**：两平台都没有 VARIANT 类型变量，`setBoundVariable` 也没有 `variantProperties` 这个字段，因此只在 op 描述与配方里把这条说死：切变体走 `jsd_set_instance_properties` / 集合级 op，别处都不存在。

## 实施方案

- **契约入口**：`ui/src/code/figma/ops.ts`（`bindingSchema` + `runBinding` / `applyVariables`、`NODE_BOUND_FIELDS` / `ITEM_BOUND_FIELDS` / `PAINT_BOUND_FIELDS` 三张档表、`rejectionReason`）、`ui/src/code/mastergo/ops.ts`（`mgBindingSchema` + `runMGBinding`）。op 描述是模型经 `jsd_ping.platformOps` 看到的唯一参数形状说明，故形状改动必须同处改文案。
- **依赖方向**：`shared/core/component.ts` 只依赖 `dicts/platform-value-domain.ts` 的判定函数（`platformMethodParamAllowed`）与 `dicts/platform` 的标签，不认识任何平台代码；平台门在写路径 `setInstanceProperties(host, ctx, params)` —— `ctx` 由 `ui/src/code/plugin.ts` 的 `registerPlugin(rawHost, platform, …)` 组装的 `runtimeContext(meta.capabilities, platform)` 提供。
- **读形态 / 写形态分界**：`componentPropertyValueSchema`（读回来的 `componentProperties` 值）保持标量；别名只进写形态 `componentPropertyAliasValueSchema`。这条分界由 `ui/src/code/figma/sync-guarantee.ts:229` 的编译期断言守着（曾把别名塞进读形态时被它当场拦下）。
- **名字寻址落点**：`mcp-server/src/tools/batch.ts` 的 `resolveRef` —— `ASSET_RE` 命中走 `resolveAssetRef`，否则走原有步骤表解析；`resolveRefs` 因此改为异步，`run()` 内以 `assetsPromise` 惰性持有本份快照。裁剪只影响回显、不影响解析，所以名字解析同样不受 `echoTrimmed` 牵连。
- **文案投影点**：`mcp-server/src/tools/platform-facts.ts`（`variableBindBulkText` 两平台各自的新形状；`componentWriteText` 的值形态从第四类表自动派生，Figma 出 `variableAlias`、另两家不出）+ `tools/prompts.ts`（`variableBindingRecipe` / `componentPropertyRecipe`）+ `dicts/i18n/messages.{zh-CN,en}.ts` 的 `batch.description`。事实表 `dicts/platform-knowledge.ts` 补 typings 证据。
- **本次不做**：`{{@style:名称}}`（Figma 早有 `figma_style_apply_by_name` 按名应用，再开一条名字通路等于两套检索入口）；`effects`/`layoutGrids` 的**批量**默认 index（数组项语义上必须指名哪一项，猜 0 会绑错阴影）；MG 的属性值绑变量（签名不支持）；Figma 变量值本身的生命周期（`setValueForMode` / rename / remove 仍在 `nativeUnwired`）；跨调用的资源缓存。

## 成本与退出条件

- 成本：`bindings[]` 是**破坏性入参改动**，旧扁平形状的调用会在校验层被打回并点名 `[bindings]`（`registry.ts` 的 `describeInvalidArgs` 已给可删动作）；批次里用名字取资源时多一次 `get_page` 往返（只读、且只在真用到 `@` 引用时发生）；Figma 侧三档字段表要跟 typings 抄（新增可绑字段时得手动补,漏了就是「表外点名拒」误伤,由 op 描述与 `platform-knowledge` 的证据行标住出处）。
- 退出条件：若 `calls` 上限 50 不再是瓶颈（例如聚合后一批普遍只用十几步），聚合绑定可以退化回一步一组；若某平台将来真引入 VARIANT 类型变量（Figma/MG 的变量类型表出现 `VARIANT`），本条的「不做」节作废，改按那张表重新分流；若名字寻址需要覆盖跨页资源（即时设计/MasterGo 只读当前页），出路是给 `jsd_get_page` 加 `scope:'document'` 的读法再复用同一份快照，而不是在 batch 里私自 `find`。

## 验证

- 不变量测试：无新增（`bindings` 的形状由 op 自身 zod 守；名字解析的「唯一命中才动手」由错误文案表达，不构成需要机器守的跨层不变量）。既有 `tests/i18n.test.ts` 的占位符奇偶校验只匹配单花括号 `{word}`，双花括号资源引用不进该集合，故中英两份不必同序。
- 边界/并发/重试用例（真机，按 AGENTS.md：`pnpm build` + 三平台各自重载插件 + 重启常驻 daemon）：
  1. Figma 一次调用带 3 组 `bindings`（fills / strokes / cornerRadius），回读节点应出现三条 `boundVariables` 且 id 与传入一致；
  2. `boundProperty: 'effects'` 不给 `subField` → 入参校验点名；`'backgrounds'` → 点名「别家词汇」；`'variantProperties'` → 点名「不可绑 + 替代路径」；
  3. `bindings: [{boundProperty:'fills'}]` 打在只有渐变的节点上 → 该节点进 `failed`（不许进 `applied`）；
  4. `{{@var:accent/blue}}` 命中并绑上；同档里再建两个同名组件 → `{{@comp:重名}}` 中止并列出候选 id；
  5. `jsd_set_instance_properties` 给 TEXT 属性传 `{type:'TEXT', value:{type:'VARIABLE_ALIAS', id}}`：Figma 生效且回读 `boundVariables.componentProperties` 出现该 id —— **别名变量须与属性同型**（TEXT 属性配 STRING 变量、BOOLEAN 属性配 BOOLEAN 变量；拿 COLOR 变量绑 TEXT 属性会被引擎当场拒 `in setProperties: Property value is incompatible with component property type`，见第三轮真机）；MG / jsDesign 当场点名「签名不收」，且不写半批（先判后写）；
  6. 同一实例先写标量再写别名，回读值与绑定态一致（验证别名没被摊平成字符串）。
- 指标与日志：`applied` / `failed` 逐组回显；`failed` 的判据写进 op 描述（字段不存在 / 非 SOLID / 引擎拒），避免下一个人把 `failed` 当成「引擎随机失败」。

### 真机结果（2026-10-13 Figma、2026-10-14 即时设计；每轮都 `pnpm build` + 重载插件，mcp-server 侧另重启常驻 daemon）

- Figma 全过：一次调用绑三组（fills 两组 + strokes 一组）回读 `boundVariables` 给别名数组；六个表外字段各给点名原因（`backgrounds` / `variantProperties` / `componentProperties` / 未知字段 / `effects` 缺 `subField`+`index` / 缺 `variableId`）；只有渐变的节点进 `failed` 且渐变 paint 原样保留；`{{@comp:…}}`、`{{@var:card/inset}}` 命中，`{{@var:不存在的色}}` 列出候选并中止；`figma_variables_create` 建出 `STRING` / `FLOAT` / `TIMING`（旧枚举只有四种）。
- 即时设计全过：`jsd_platform_op` 被 daemon 平台门拦下并写明「未向插件发起请求」；组件属性写别名被 core 门当场拒（`setProperties` 签名不收别名），且一个属性都没写；`jsd_create_style` → `jsd_delete_style` 闭环成（走同步 `getStyleById` + `Style.remove()` 退路），`textStyleId` 绑定读得回；假 id 进 `failed` 不连坐。
- 三条测试期间新发现并已修：① `componentProperties[].boundVariables` 被 zod 输出 schema strip 掉，别名「写完读不回」→ 补进读形态（分界线由 `ui/src/code/figma/sync-guarantee.ts:229` 守着：别名只属于写侧，读侧 `value` 仍是标量）；② `*StyleId` 同步赋值在 dynamic-page 下当场抛，即 `jsd_create_style` 建得出却绑不上 → `writeStyleRefProp` 优先 `set*StyleIdAsync`，MG / jsDesign 无反向断言证明它们没有异步入口，故走同步退路；③ 取值检查跑在引擎工厂之后，失败路径留下空样式 → `createStyle` 改先判再建（实测探针节点建 EFFECT，报错且样式清单不增）。
- MasterGo 侧仅静态依据（typings 行号 + `sync-guarantee` 断言），未跑真机 —— 客户端没连。`{type:'VARIABLE_ALIAS'}` 在 MG 应被拒这条只由 `PLATFORM_METHOD_PARAM_DOMAIN` 的 deny 表 + core 门保证。

### 第二轮真机（2026-10-14 MasterGo + Figma，插件与 daemon 均已换新）

- MasterGo 全过：`mg_variables_create` 建 `NUMBER` 64 / `COLOR`，`mg_variables_apply` 两组一次调用成功且**渲染值可证**（节点宽 120→64、填充等于 COLOR 变量 —— 本平台无反读接口，渲染即证据）；错槽位在入参层点名（路径已嵌套成 `bindings.0.value`）；组件属性写别名被 core 门拒并点名 `MasterGo`；`jsd_create_style`（引擎从图层整体抄）与 `jsd_delete_style` 闭环成。
- 三家门对齐：别名写组件属性在 Figma 生效、在 MasterGo / 即时设计各自点名拒绝 —— 判据只有一处（`PLATFORM_METHOD_PARAM_DOMAIN` 的 deny + `platformMethodParamAllowed`）。
- **两条 MG 特有的坑，都是真机测出来的**：
  1. `mg.getStyleById` 连**变量**都解析得出来，而运行时变量对象也有 `remove()` —— 我拿变量 id 调 `jsd_delete_style`，回包 `removed`，那个变量真没了。上一版按「有没有 `remove`」判存在性挡不住，也不能按 `type` 判（`VariableType:1832` 与 `StyleType:1810` 在 PAINT/TEXT/EFFECT/GRID/… 上大面积重名）；唯一可靠的区分是 `collectionName`（`BaseStyle:1990` 有、`Variable:1874` 没有）。现按它判并回指 `mg_variables_remove`。
  2. 两家的 binding schema 没 `.strict()`，误塞一个拼错的键会被**静默吞掉**（我实测塞了 `boundProperty:""` 到 MG 那组，照常成功）；Figma / MG 两边逐组收紧后都当场点名 `bindings.0: Unrecognized key: "…"`。
- 「先判再建」覆盖不足，补成**失败即回滚**：Figma 建 TEXT 样式时 `loadFontAsync` 拒了机器上没有的 PingFang SC，而 `figma.createTextStyle()` 已执行 —— 回包是失败，文档里留下一条空样式（实测 `探针/回归样式`）。取值缺失只是这类失败的**一种**，所以回滚做在 `fillStyleFromNode` 外层：灌值途中任何异常都 `style.remove()` 再抛，与 `figma_variables_create` 的「失败整体回滚」同一口径。漏下的那条已用 `jsd_delete_style` 清掉。
- Figma 回归：`letterSpacing` 在 Figma 侧一直是平的，`unwrapLetterSpacing` 没改坏正常形状；`jsd_find` / `jsd_set_fill_color` 在即时设计上曾因那条双层被判成失败，现已 `ok:true`。

### 第三轮真机（2026-10-14 Figma；`pnpm build` + 重载插件，并把 daemon 从 npm 包换成本地产物）

- **本轮真正卡住的地方是产物来源，不是代码**：MCP 服务端跑的是 `npx text-to-design-mcp@latest` 拉的 npm 包（`0.12.1`，与本地 `package.json` 同号但构建早于本决策：其 dist 里没有 `ASSET_RE`、没有 `bindings`、没有 `figma_component_properties_set`），而插件的 `platformOps` 已是本地新构建。于是出现「一半对一半错」的假象：`bindings[]` 聚合绑定走 `jsd_platform_op` 全部通过，`jsd_batch` 的 `{{@var:…}}` 却被当成步骤引用，报「占位符引用的步骤不存在或未成功」。把 MCP 配置改成 `node packages/mcp-server/dist/index.js`、并杀掉占着 47812/47820 的旧 daemon（版本号相同 ⇒ shim 不会替换它，只重载插件或只重连都测不出）后复跑全过。**教训：验证前先确认服务端产物来源；shim 与 daemon 的版本号相同不等于产物相同 —— 只有 `git` 之外的「同号不同构建」会造出这类假象。**
- 六条用例全过：① 一次调用绑三组（fills→`VariableID:23:117`、strokes→`23:112`、cornerRadius→FLOAT 变量），回读 `boundVariables` 逐条与传入一致；② 表外字段六个各给点名原因；③ 纯渐变节点绑 fills 进 `failed`（`applied` 为空），渐变 paint 与 `gradientTransform` 原样保留；④ `{{@var:accent/cyan}}`→`23:118`、`{{@comp:AppShell/侧栏}}`→`23:124` 命中，`{{@var:不存在的色}}` 列 21 个候选并中止整批（后续步骤未执行），`{{@comp:重名}}` 撞两个同名列出两个 id，`{{@var:  "  ACCENT/CYAN  "}}` 经 trim + 忽略大小写命中；⑤ 组件属性别名：BOOLEAN 属性绑 BOOLEAN 变量、TEXT 属性绑 STRING 变量均生效，`jsd_set_instance_properties` 与 `figma_component_properties_set` 两条路都回读 `componentProperties[<完整键>].boundVariables.value = {VARIABLE_ALIAS, id}`；⑥ 同一实例先写标量再写别名，回读 `value` 是变量实际值而非 id 字符串（别名没被摊平）。
- **测出验证节第 5 条写漏一条约束（已补进上文）**：给 TEXT 属性传别名时**变量类型必须与属性类型同型**。原文只写「Figma 生效」，照原文拿一个 COLOR 变量去绑 TEXT 属性会得到引擎的 `Property value is incompatible with component property type`，极易被读成「TEXT 属性不支持别名」。
- 本轮测试件（`T/*` 节点与组件、`测试/*` 变量）跑完已全部删除，页面回到 16 个顶层节点 / 2 组件 / 18 变量。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-13 | 初次决策 | 三条一起落：聚合绑定 + 批内名字寻址 + 属性值绑变量；VARIANT 变量确认不存在，只点名不做 |
| 2026-10-13 | 追问「jsDesign 的统一色板有没有写进配方」，查出 `jsdesign.variables.fallback` 是 null、且 `variableFaceText` 从不渲染 fallback（等于给了个不存在的出口）；随后要求接上 `createFillStyle` | 结论**扩大**：新增 `jsd_create_style`（契约 `DesignHost.createStyle` 一条成员，三平台各自实现）+ fallback 补真内容并接进投影点。原「本次不做」清单不变 |
| 2026-10-13 | 真机复验（插件重载两轮）测出三处：① 组件属性绑变量的证据被 zod 在读出口 strip 掉；② `*StyleId` 同步赋值在 dynamic-page 下当场抛（样式建得出来绑不上去）；③ 取值检查跑在引擎工厂之后，失败路径留下空样式 | 三条都修：读形态补 `componentProperties[].boundVariables`；新增 `writeStyleRefProp`（与 `writeProp` 共用同一组守卫，优先 `set*StyleIdAsync`）+ op 侧同样改异步；`createStyle` 改**先判再建**。并接上删除面（`jsd_delete_style` + `figma_variables_remove` / `mg_variables_remove`）——「建了撤不回」本身就是这类单向门 bug 的根因 |
| 2026-10-14 | 复跑真机（Figma）验名字寻址与聚合绑定；途中发现 MCP 服务端跑的是 npm 已发布包（与本地同版本号、构建更早），插件却是本地新构建 | 代码无改动：`bindings[]` / 名字寻址 / 属性别名六条用例全过。验证节第 5 条补「别名变量须与属性同型」这一条被写漏的约束（COLOR 变量绑 TEXT 属性被引擎拒）|
