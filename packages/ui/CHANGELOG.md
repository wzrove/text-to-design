# text-to-design-ui

## 0.11.2

### Patch Changes

- [`7803213`](https://github.com/wzrove/text-to-design/commit/78032131909b82513b02eaf9b861a2bae5e65244) - feat(jsdesign): 新增只读平台 op `jsd_component_facts` —— 按官方文档(ComponentNode / InstanceNode / ComponentSetNode)回读契约里缺的字段：COMPONENT 的 `instanceCount`（影响面）、`key` / `remote` / `description` / `expanded`，INSTANCE 的 `scaleFactor` / `mainComponentId`，COMPONENT_SET 的 `defaultVariantId` / `variantGroupProperties` / `members`；可写 `description`（回读校验）。`getPublishStatusAsync` 单列为 `withPublishStatus`（真机已验：21ms 返回、不永挂，但对非团队库节点回的是错误串 `Failed to get node publish status` 而非 PublishStatus 三值 ⇒ 三值才认，其余落 `publishStatusError`）

- [`7803213`](https://github.com/wzrove/text-to-design/commit/78032131909b82513b02eaf9b861a2bae5e65244) - fix(jsdesign): 主组件读取改按平台声明选路 —— 新增 flow 能力位 `mainComponentSync`（即时设计声明），`resolveMainComponent` 不再 `?.` 探测 `getMainComponentAsync`。真机 2026-10-19：该符号在即时设计运行时存在但**永不 settle**，`jsd_copy_overrides`（只读快照、不写属性）25109ms 超时、`jsd_set_instance_properties` 同样超时；`detachInstanceNodes` / `copyInstanceOverrides` / `applyOverrides` 三个入口一并接上 `RuntimeContext`

- [`7803213`](https://github.com/wzrove/text-to-design/commit/78032131909b82513b02eaf9b861a2bae5e65244) - fix(mastergo): 变量删除回包加 `pending` 档 —— 单值类型的 `deleteVariable` 跨执行才生效，同执行内回读仍见不再报 failed；复合样式类型（PAINT 等）实测 no-op，改为动手前就拒并点名走 `jsd_delete_style`。`mg_variables_create` 回包的 `values` 降级为原样透传（引擎回包时有时无、STRING 任何读面都不带值），不再当验收判据

- [`db5982d`](https://github.com/wzrove/text-to-design/commit/db5982d59a6902432d84f3c436ae7f0e841f323b) Thanks [@wzrove](https://github.com/wzrove)! - feat: enhance text properties handling and schema updates

- [`7803213`](https://github.com/wzrove/text-to-design/commit/78032131909b82513b02eaf9b861a2bae5e65244) - fix(jsdesign): 组件 / 变体 / 实例按**实际运行期类型**收口,不再按 typings 假设。真机 2026-10-20 逐条隔离出的四处「声明了但运行期不是那样」:
  
  1. **变体表取值形状** —— `variantGroupProperties.values` 元素不保证是字符串(多成员集合回 `[{name:"默认"}]`),撞穿线格式 `string[]` 会让 `get_page` / `jsd_find` **整条失败**。归一收进新模块 `core/variant.ts`,两个投影点(`serialize.ts` / `assets.ts`)与平台 op 共用一份实现;`serializeNode` 另加「getter 抛也省略该字段」保护。
  2. **两套变体键** —— 集合维度键(如 `状态`)与成员键(`分类1`)**不是同一套**,而引擎写入口只认成员键。`setInstanceProperties` 现在两边都收,集合键按**取值唯一匹配**映射成成员键(歧义/无匹配点名报错,绝不猜),并把键解析提到任何写入之前。
  3. **实例三通道运行期不可用** —— `setProperties` 不是函数、`swapComponent` 抛内部错误、`detachInstance` 原位返回 INSTANCE(静默 no-op)。三条通道改为**行为检测 + 写后回读**,失败逐条点名并给可执行出口;`createInstances` / `cloneNodes` 对**组件集成员**的引擎缺陷(createInstance 必抛、clone 返回 undefined)逐条收集而非整批崩。
  4. **事实与文案** —— `platform-knowledge.ts` 回填真机证据并**把 `jsd_set_instance_properties` 从 jsDesign 的 variants.write 里摘掉**(那条路径实测必败);`platform-facts.ts` 的三处投影改为取事实表判据,不再声称「切到已有取值」。`jsd_component_facts` 增补 `swapComponentAvailable`、`dimensionMismatch` 细分为 setOnly/memberOnly。

## 0.11.1

### Patch Changes

- [`0c44a82`](https://github.com/wzrove/text-to-design/commit/0c44a82576da19ac7d90d46b1bb5ee5c1433f1e0) Thanks [@wzrove](https://github.com/wzrove)! - feat: enhance component resizing behavior and serialization

## 0.11.0

### Minor Changes

- [`6f52b75`](https://github.com/wzrove/text-to-design/commit/6f52b75cf918711cf2440158e92329368ec16bea) - feat: 批量编排支持名字寻址资源、变量一次绑多组、组件属性值绑变量
  
  - `jsd_batch` 占位符新增资源寻址:`{{@comp:名称}}` 取组件/变体集 id、`{{@var:名称}}` 取变量 id,按 `jsd_get_page` 的资源清单每批最多读一次;零命中或多命中同名都点名中止整批,不猜。
  - `figma_variables_apply` / `mg_variables_apply` 改为一次吃 `bindings: [...]`,一组 = 一个变量 × 一个字段/槽位 × 一批节点(旧的单组扁平入参**不再收**);Figma 的 `boundProperty` 按 typings 分三档入口,表外字段(`backgrounds` / `variantProperties` / `componentProperties`)当场点名拒并给替代路径。
  - 组件属性的值可跟随变量:Figma 下 `jsd_set_instance_properties` / `figma_component_properties_set` 的 value 支持 `{type:'VARIABLE_ALIAS', id}`;MG / jsDesign 的 `setProperties` 签名不收别名,按 `dicts/platform-value-domain.ts` 第四类表点名拒绝(不写半批)。
  - 变量类型面放到引擎全表:`figma_variables_create` / `figma_variables_list` 的 `type` 从 4 种补齐为 `VariableResolvedDataType` 的 6 种(多 `EASING` / `TIMING`),建变量时 `value` 可传 `{type:'VARIABLE_ALIAS', id}` 让一个变量引用另一个(值形态,不是新类型)。
  - 新工具 `jsd_create_style`:从**既有节点**建一条本地样式(PAINT / TEXT / EFFECT / GRID),回 id;三类平台的原生形状不同(Figma / jsDesign 无参工厂 + 灌值、MG `createFillStyle({name, id})` 由引擎从图层抄),契约只留一条 `host.createStyle(init)`。PAINT 取值 fills 优先、无填充时退到 strokes,两者都无 / 文本混值(mixed)都当场报错,不建空样式。建完用 `fillStyleId` / `strokeStyleId` / `textStyleId` / `effectStyleId` 绑 —— 这是没有变量面的即时设计上统一色板的正路(`jsd://styles` 从此不再是只读)。
  - 删除面接上,`jsd_create_style` 不再是单向门:新工具 `jsd_delete_style`(按 id 删、逐条给 `removed`/`failed`,契约新增 `DesignHost.removeStyle`,三平台各自实现 —— Figma 必须 `getStyleByIdAsync`,MG/jsDesign 只有同步 `getStyleById`;MG 的 `Style` 联合类型里混进了 `Variable`(无 `remove()`),故按存在性守卫收窄)+ 平台 op `figma_variables_remove`(`Variable.remove()`)与 `mg_variables_remove`(`deleteVariable(id)`,同步且不回报告,故先查存在性再删)。
  - 真机复验(Figma,插件已重载两次):一次调用绑三组变量 ✓、渐变节点进 `failed` ✓、表外字段六种点名 ✓、`{{@comp:}}` / `{{@var:}}` 命中与未命中候选清单 ✓、组件属性写 `{type:'VARIABLE_ALIAS', id}` 后改那个 STRING 变量的值实例跟着变 ✓(并补上了此前被 zod strip 掉的 `componentProperties[].boundVariables` 读出口)、异步 `fillStyleId` / 按名应用 ✓。测出的第三个 bug:取值检查跑在引擎工厂之后 → 失败路径留下空样式,已改成**先判再建**(待第三次重载复验)。
  - 修掉两处输出层的既有缺陷(即时设计真机 2026-10-14 复现):① 组件内文本节点的 `letterSpacing` 运行时是双层 `{unit, value:{value,unit}}`,此前 `serialize.ts` 用 `as unknown as` 原样透传 → 撞 `outputSchema` → **一条只读查询被判失败**;现按 `unwrapLetterSpacing` 取内层。② `core/response.ts` 在结果过不了 schema 时只回原始 JSON + `isError`,zod 详情没有任何出口(于是 `jsd_batch` 把正常数据当错误文案截断呈现);现在先给「结果未通过本工具的输出校验 —— <路径: 原因>」,原始返回附在后面。
  - 名字寻址补一条平台语义:`{{@comp:…}}` 的名字一律照 `assets` 原样写 —— 即时设计会把带 `/` 的组件名拆成「集合 / 成分」,`assets.components[].name` 只剩叶子名。写进 `variable-binding` 配方、`reuseGuideText` 的即时设计行与 `jsd_batch` 描述(zh/en)。
  - MG 的 `jsd_delete_style` 守到「是不是样式」这一层:`mg.getStyleById` 连变量都解析得出来、运行时变量对象也有 `remove()`,故按存在性判不够(真机用它删掉过一个变量)。改按 `collectionName` 判(样式有、变量没有),误传变量 id 时点名并指回 `mg_variables_remove`。
  - 建样式改成**失败即回滚**:引擎工厂先执行,灌值途中任何异常(如 Figma 加载不了本机没有的字体)都会留下空样式。现在 `fillStyleFromNode` 捕获后 `style.remove()` 再抛,与 `figma_variables_create` 同一口径。
  - 两平台 `*_variables_apply` 的 binding 逐组 `.strict()`:拼错的键不再被静默吞掉。
  - 明确不做:VARIANT 类型变量在 Figma 与 MG 的变量类型表里都不存在,变体取值切换仍走 `jsd_set_instance_properties` / 集合级 op。变量的 `rename` / `setValueForMode` 与集合的模式增删改名仍未接。
  
  决策见 `docs/design-decisions/7165f370-*.md`。真机待验(三平台各自重载插件 + 重启常驻 daemon)。

### Patch Changes

- [`5ca3e91`](https://github.com/wzrove/text-to-design/commit/5ca3e91a6abdc409bd4699ac7122ca6a42cece86) - feat: 更新插件配置，移除 manifest.json 文件，改为从环境变量读取插件 ID

## 0.10.1

### Patch Changes

- [`f911e51`](https://github.com/wzrove/text-to-design/commit/f911e5132f49e02ecbdcac0f9db0047b4850a1a8) - fix(ui): 悬浮提示气泡对齐改为量边界自动选,消除面板横向滚动条

## 0.10.0

### Minor Changes

- [#43](https://github.com/wzrove/text-to-design/pull/43) [`151e129`](https://github.com/wzrove/text-to-design/commit/151e129e0dc3926e1e884a796cfe9d0c50db18ec) Thanks [@wzrove](https://github.com/wzrove)! - feat: `jsd_get_page` 收窄为「当前页顶层几何 + 设计系统资源清单」(见 0039)
  
  **为什么要动**:`get_page` 自称「轻量摘要」,却按 25s 转发预算顶着读。daemon 日志里同一签名反复出现 —— `r38`(10-08)、`r53`/`r54`(10-09)、`r3`/`r5`(10-10,插件与 daemon 都是当日新产物)全是 `ok=false 耗时=25001xms error=forward_timeout`。同一时段 `ping`/`get_selection`/`find` 都是毫秒级返回,只有它挂死:不是掉线,是这条输出面的成本随页面规模涨、却没有任何边界(字段越多、顶层节点越多,引擎跨边界读越多)。上一次的 `lightTopLevel` 只压了单节点读次数,没解决这个。
  
  **输出改成两段**(`nodes` 字段是 `id/名称/类型/宽高/x/y`;`z` 与 `childCount` 在 0039 之后没有消费方):
  
  - `nodes` —— 当前页顶层节点的几何,不递归。
  - `assets` —— 资源清单,四项在**当前产物里恒在**:`summary`(四类计数)、`components`(组件)、`variants`(变体集,**带「维度 → 可选值」**)、`styles`(样式,**全量四类** PAINT/TEXT/EFFECT/GRID,各自带 `type`)、`variables`(变量)。某面在本平台不存在时该项是**空数组**,不报错 —— 三平台能力面不对称是常态,让缺口把整条只读调用打成错误没有收益。`variants[].properties` 在平台读不到该字段时**整个键省略**(不写空对象 —— 空对象会被当成「确实没有维度」)。要看资源细节按 id 走 `jsd_find`。
  
  **这张清单的存在理由是「设计前先复用」**:工具描述、`jsd://page` 资源描述、全局 instructions 与 `design-strategy` 配方(新增第 0 条)四处都写死了同一条纪律 —— 设计类任务第一步读它,命中同名/同用途的组件、变体取值、样式、变量**一律复用,禁止新建重复件**,清单里确实没有才允许新建。变体展开维度取值与样式收全量,都是为了不让调用方因为「看不到」而退回新建;四类各自怎么复用(平台入口名不同)由 `platform-facts.ts` 的 `reuseGuideText` 按平台给,配方只做拼接。
  
  `assets` 整块在 schema 里声明为**可选**,只为产物错位容错:MCP 与插件各自升级,旧插件发不出这个键,而 `structured()` 对过不了 schema 的结果一律判 `isError` + 空结构 —— 写成必填会让「插件旧了」表现为整条调用失败(同 `fonts` 的 `total/offset/truncated` 为什么可选)。约定:键缺席 = 产物错位;键在但数组空 = 本平台没这个面。反方向(旧 MCP + 新插件)天然安全,本批只删字段。
  
  **枚举失败不连坐**:引擎的 `findAll*` 会因文档里**任何一个坏节点**整页抛(实测 Figma:残留一个出错的组件集 → 整页一个节点都查不到)。所以枚举按**页** try/catch:失败页跳过、页名写进 `note` 点名(该页清单可能不全),不让一个坏节点把 `get_page` 又打成错误。`note` 因此由「单一的成本标注」扩成「本次读取的附加说明」通道 —— 全量加载成本与枚举降级各占一句。
  
  **资源清单不新造读路径**:组件与变体集走契约里已有的 `findAllWithCriteria`(引擎原生过滤,一次调用遍历全文档,不是逐节点跨边界读);颜色样式复用 `core.listStyles`;变量走**新增的可选契约成员** `getLocalVariablesAsync`,形制照抄 `getLocalPaintStylesAsync`(契约可选 + 平台缺口/投影登记 + Access 层 `typeof` 探测回退)。两侧各一个投影点:Figma 是 `figma.variables.getLocalVariablesAsync`(同步入口在 dynamic-page 下必抛,故只接异步那条);MasterGo 是命名空间下的 `mg.variables.getVariables()`(契约名字在顶层,故在 `code/mastergo/host.ts` 投影)。**即时设计 typings 全文无 variable 声明,结构上接不了** —— 它的资源清单里变量恒为空数组,不是「还没接」。三条平台缺口/投影登记都在 `sync-guarantee.ts` 里配了成对的编译期断言(登记的必须真不在 typings 里;投影项的来源必须真在子命名空间上)。
  
  `dicts/platform-knowledge.ts`(0032 的变量/组件/变体三域事实表)同步更新 MG 那一格:`variables.read` 从 `null` 改成 `mg.variables.getVariables()`、`readShape: 'array'`,并给 `DomainFact.read` 补一句「也可以是本仓已接的枚举 API」。**MG 的变量能力位 claim 仍关着**、写入口仍不接(建集合/建变量/绑值)——claim 的含义是「这个平台有变量能力面」,会连「能改变量」的预期一起放出去;0033 那两个别名 op 也仍在等写侧。变量面文案(`variableFaceText`)据此把「本仓没接」改成「只接了只读枚举,写入口一个都没接」。
  
  **不动的东西**:`jsd_get_page` 的工具名与 `nodes[].id/x/y` 保持原样 —— 结构变更复核(`drift-watch`)的「当前页顶层」那一层靠它配对节点,改名/删字段会静默打断复核(`drift-hook.test.ts` 已守)。`pages`(各页名与顶层节点数)与 `note`(全量加载成本)保留:两者是页级元数据,成本与节点数无关。
  
  真机待验(需 `pnpm build` + 重载插件):① `jsd_get_page` 耗时回到毫秒级、不再出现 `forward_timeout`;② 即时设计上 `assets` 取到组件/变体集/颜色样式,变量为空数组(该平台无变量面);③ Figma 与 MasterGo 上变量清单非空。

- [#43](https://github.com/wzrove/text-to-design/pull/43) [`151e129`](https://github.com/wzrove/text-to-design/commit/151e129e0dc3926e1e884a796cfe9d0c50db18ec) Thanks [@wzrove](https://github.com/wzrove)! - feat(mg): MasterGo 变量读写接入 platformOps(见 0040)
  
  此前 MG 的变量面是半截的:0039 只接了只读枚举(`jsd_get_page` 的 `assets.variables` 能列出变量),但没有任何写入口 —— 而变量的价值全在「建出来、绑到图层、画布跟着变」。现在补齐三个 op,走既有的 `jsd_platform_op` 通道(不新增工具,目录体积不受影响):
  
  - `mg_list_variables` —— 摸底 / 回读:集合(含模式)+ 变量(类型 / 所属集合 / 描述 / 各模式的值)。
  - `mg_variables_create` —— 批量建变量。**参数形状刻意对齐 Figma 的 `figma_variables_create`**,两个平台共用一套调用纪律;同名集合复用、同名同类型变量就地更新值,失败回滚**本次新建**的集合(复用既有集合时不删,避免连坐删掉用户变量)。初值:单值类型直接给(BOOLEAN/NUMBER/STRING/COLOR,COLOR 用 `{r,g,b,a}` 0-1 浮点),复合样式类型走部分更新语义。
  - `mg_variables_apply` —— 绑定 / 解绑变量到图层属性(`unbind: true` 解绑)。
  
  **槽位取值以官方文档为唯一依据**:`mg.variables` 这片 API 在 typings 里只有签名、没有一个字的说明,`setVariableReferenceInLayer({strokeProperty: 'all'})` 这类槽位的取值全是裸 `string` —— 照类型猜会写出不存在的槽位而静默不生效。故按官方文档的「属性参数一览」逐值落表(`baseProperty` / `strokeProperty` / `radiusProperty` / `paddingProperty` / `dimensionProperty` / `effectProperty` / `gridProperty` / `textProperty`),并在入参校验就点名(传错立刻报可选项清单,不落到引擎)。文档与 typings 的两处不一致已就地注明:文档的变量类型表少一个 `SPACING`、`setVariableValue` 的 `modeId` 文档可选而 typings 必填(本仓按 typings 走,并加了双向同宽断言)。
  
  **回读纪律**:`create` 回读变量是否都在(缺一个就抛 —— 本平台有「回包成功、值没变」的前科);`apply` 回读 `getLayerVariableModes`,拿不到变量所属集合时在结果里点名 `unverified` + `warning`。⚠ MG **没有**「图层属性 ↔ 变量」的反读接口,所以绑数组属性(fills / effects / grids)必须自己给 `index`,视觉结论要 `jsd_export` 目视 —— 这条写进了 op 描述与配方。
  
  **顺带修掉一个会喂错模型的坑**:`variable-binding` 配方的「批量绑定」那段此前硬写着 Figma 的字段词汇(`nodeIds` + `boundProperty` + `variableId`)。MG 一旦有了写入口,按「有写入口」拼接的同一段文案就会落到 MG 调用方身上 —— 参数名全错且不报错,只会静默绑不上。现在把三段平台句子挪进 `platform-facts.ts`(平台差异只落声明表与投影点),配方只做拼接;`variableFaceText` 的装配期那半句也改成按表逐平台派生(原来硬写 Figma 的读路径)。
  
  `platform-knowledge.ts` 的 MG `variables` 随之更新:`write` = 两个新 op,`nativeUnwired` 缩到旁支(模式管理 / 分组管理 / 变量引用变量 / 作用域与代码语法 / 复合变量补子项 / 一步建绑);`meta.ts` 声明 `variables` 能力位(此前不 claim 正是因为只有 typings 没有接线);MG 的 `platformOps` 11 → 14。
  
  真机待验(MasterGo 客户端):① 建四种单值变量并回读值;② 建复合样式变量;③ `strokeProperty:'all'` 等槽位各绑一次确认画布真的变;④ `unbind` 能解开;⑤ 传错槽位时错误里出现可选项清单。

### Patch Changes

- [#43](https://github.com/wzrove/text-to-design/pull/43) [`151e129`](https://github.com/wzrove/text-to-design/commit/151e129e0dc3926e1e884a796cfe9d0c50db18ec) Thanks [@wzrove](https://github.com/wzrove)! - fix: 组件属性两处静默缺口 —— 写侧键归一回 core，读侧暴露图层引用（见 0041）
  
  两处都在「组件属性」这条读写链上，由用 Figma 真机搭一个通讯录页（复用「会话行」组件铺 3 行联系人）的同一批操作暴露。
  
  **① 写侧：键形态从没归属，文档却承诺已归一。**
  
  `jsd_set_instance_properties` 把键原样透传给引擎，中间零归一。而引擎对**组件属性**（BOOLEAN / TEXT / INSTANCE_SWAP）只认带 `#` 后缀的完整键 —— 真机四连测，短名一律 `in setProperties: Could not find a component property with name: '标题'`（TEXT / BOOLEAN / INSTANCE_SWAP 三类都一样）。免后缀只对**变体属性**成立，那是另一张表。
  
  三处文档（输入 schema 的 describe、`component-property` 配方 §4、工具描述）长期写着「门面会自动归一，传名字即可」，实现里只有 MasterGo 门面做了，且那里自承只兜得住 BOOLEAN/TEXT。现在在 `core/component.ts` 补齐三个平台，四条纪律：精确命中保留 → 基名**唯一**命中补成完整键 → 命中 0 个原样透传（变体属性不在 `componentProperties` 里、MG 的实例属性表实测常为空，按「查不到就拒」会把这两类合法调用一起打死）→ 命中 ≥2 个报错并列出候选。
  
  歧义在**任何一次写入之前**报出来（先把每个实例要写的键算完再统一下笔），不留下半批覆盖。三处文档同步改成「变体属性传名字，组件属性传完整键，core 只在基名唯一时补全」。
  
  **② 读侧：看不见「哪个属性驱动哪个图层」，于是同一件事能做错而不自知。**
  
  `会话行` 的 12 个属性成对存在（`摘要`/`摘要2`、`显示铃铛`/`显示铃铛2`…），只有一组连着可见图层。改错那组时 `componentProperties` **全部回读为新值**、回包 `ok=true`，画布上摘要/时间/铃铛纹丝不动 —— 纯静默失效，且没有任何信号提示哪一组是活的。
  
  引擎有一手事实（Figma `plugin-api.d.ts:6545`、MG `dist/index.d.ts:2406` 的 `componentPropertyReferences`），仓库此前只用在写侧绑定，没进读路径。现在加进序列化：`NodeSkeleton` 与线格式各加一个**可选**字段（无引用或平台不支持时整个键缺席，「键在 = 至少有一条引用」可直接依赖），槽位键**归一到一套词汇** `visible` / `characters` / `mainComponent` —— MG 原生的显隐槽叫 `isVisible`，原样透传等于把 0025 刚决定藏起来的两套词汇重新暴露到读路径。`jsd_find` 读组件子层即可看到 `R_摘要 → { characters: "摘要2#32:7" }`，据此一次选对属性。
  
  jsDesign 的 `plugin-api.d.ts` 全文零命中该声明（属**接不了**，与「未接」不是一回事），已登记进 `jsdesign/sync-guarantee.ts` 的缺席清单，由编译期断言守。
  
  **顺带修掉一个会喂错模型的坑**：`component-property` 配方 §6「复核」只教了「回读 `componentProperties` 比对」，而这恰好是上面那个静默失效骗得过的判据。现在补一条：回读通过 ≠ 画面变了，写完要 **jsd_find 深度读节点的实际内容 / 可见性**复核，选键阶段先读 `componentPropertyReferences`。
  
  新增 9 例单测（`component-property-keys.test.ts`）：精确键不改写 / 基名唯一命中补全 / 多头命中报错列候选 / 未知键透传 / 混合三类键 / 布尔值形态不变、读路径槽位归一 / 无引用时键缺席 / 回包能过线格式校验。
  
  真机待验（Figma）：① 用短名 `头像` 调 `jsd_set_instance_properties` 应命中 `头像[#32](https://github.com/wzrove/text-to-design/issues/32):6`；② `jsd_find` 读「会话行」组件子层应能看到 `componentPropertyReferences`；③ MasterGo 侧同一字段应输出 `visible`（不是 `isVisible`）。

- [#43](https://github.com/wzrove/text-to-design/pull/43) [`151e129`](https://github.com/wzrove/text-to-design/commit/151e129e0dc3926e1e884a796cfe9d0c50db18ec) Thanks [@wzrove](https://github.com/wzrove)! - fix(figma): 变量面补上「清单」与「解绑」,与 MG 对齐(见 0040)
  
  对账 MG 的 14 个 op 时发现 Figma 的变量面缺两块 —— 不是漏写,是当初只按「建 + 绑」最小闭环做的:
  
  - **`figma_variables_list`**(新):列出变量集合(含模式)与变量(类型 / 所属集合 / 描述 / 各模式的值),与 MG 的 `mg_list_variables` **同形**。此前 Figma 的变量读路径只有节点上的 `boundVariables` —— 读到的是**绑定**,不是**库存**;「有哪些变量、值是多少、有哪些模式」在画布上根本没有出口,选变量绑定前只能猜 id。与 `jsd_get_page` 的 `assets.variables` 不是两件事:那条是不分平台的概览(只有 id + 名称)。
  - **`figma_variables_apply` 支持 `unbind: true`**(解绑):两个入口都收 `null`(`setBoundVariable(prop, null)` / `setBoundVariableForPaint(paint, 'color', null)`),语义是「把该字段上绑着的东西摘掉」,此前只能绑不能解。
  
  顺带修掉一个两个平台共有的形状问题:`variableId` 改成**可选**。解绑根本不需要变量(Figma 的入口收 `null`、MG 的 `unlinkVariableReferenceInLayer` 不收 id),而此前两边的 schema 都把它写成必填 —— 那会让「解绑」这个动作凭白要求一个用不上的 id。绑定方向改由入参校验守:没给 `variableId` 且不是解绑时报「绑定时必须给 variableId(解绑才不用给)」。
  
  `platform-knowledge.ts` 的 Figma `variables` 随之补上读出口与 `nativeUnwired`(`Variable.setValueForMode/rename/remove`、集合的模式增删改名 —— 平台有 API、本仓未接);`figma_variables_list` 也进了配方第 2 节(`variableBindShapeText('figma')`),与 MG 的对应句子对称。
  
  真机待验(Figma,`pnpm build` + 重载插件):① 清单能列出集合/模式/值;② 绑一个 paint 类字段后 `unbind` 能解开(回读 `boundVariables` 里该键消失);③ 不给 `variableId` 调绑定时报「绑定时必须给 variableId」。

- [#43](https://github.com/wzrove/text-to-design/pull/43) [`151e129`](https://github.com/wzrove/text-to-design/commit/151e129e0dc3926e1e884a796cfe9d0c50db18ec) Thanks [@wzrove](https://github.com/wzrove)! - fix: 跨页读按平台声明收口 —— 读不到非当前页的平台只扫当前页（0039 修订，两轮真机实测）
  
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

- [#43](https://github.com/wzrove/text-to-design/pull/43) [`151e129`](https://github.com/wzrove/text-to-design/commit/151e129e0dc3926e1e884a796cfe9d0c50db18ec) Thanks [@wzrove](https://github.com/wzrove)! - fix: 样式枚举拆出独立能力位，`get_page` 与 `jsd://styles` 按平台声明返空（见 0043）
  
  0042 把样式枚举拆成了四次独立调用，但没解决根因：core 判断「能不能问样式」靠 `typeof host.getLocalPaintStyles === 'function'`，而即时设计**四个 getter 全都在** —— 只是引擎侧永不返回。存在性探测答的是「有没有这个东西」，而这里的问题是「问了没回音」，判据类型不对。
  
  **本批把判据换成平台声明**：新增能力位 `styleEnumeration`（「能不能列出有哪些样式」），与既有的 `styles`（「能不能**按 id 应用**样式」）分开 —— 合成一位正是这次事故的机制：即时设计 claim 了 `styles` 且它真的能按 id 应用，于是「能列清单」被隐含出来，`get_page` 因此全废（25s `forward_timeout`）。
  
  - **未声明 ⇒ 恒空，且一个 getter 都不调。** 闸在 `core/access.ts`（两个消费方共用：`list_styles` ← `jsd://styles`，`listDocumentAssets` ← `get_page`）。断言的是**调用记录** —— 只看返回值会放过「取回来再丢掉」，而那照样冻死线程。
  - **变量面同规则**（用既有的 `variables` 位）：资源清单四个面此前是「两个靠声明、两个靠探测」，同一份清单两套判据，正是漏判的土壤。
  - **能力表未注入时 fail-open**（退回 `typeof` 探测，沿 0002 与写路径同口径）。
  - **空数组必须点名成因**（0007）：`jsd://styles` 回包加 `note`，`get_page` 的 `note` 多第三种来源 —— 「清单读不出来」不能被读成「文档里没有样式」。
  
  平台声明：Figma / MasterGo 声明 `styleEnumeration`，即时设计只声明 `styles`。MasterGo 这一条**未真机验过**，是按现状声明（此前 MG 就是在枚举样式的，不为未验证的怀疑砍掉它的清单）—— 真机一测不对，改 `meta.ts` 那一行即可，机制不动。
  
  **顺带清掉 0042 的探针**：`list_styles` 的 `kinds` 入参与单类资源 `jsd://styles/{kind}` 一并删除。它的存在前提是「还要靠分开问来定位哪一类坏」，而现在不该问的平台在能力闸处一个 getter 都不会调 —— 「按类少问」不再承载判断，长期养一个入口没有收益；真要取证，临时放开声明即可。四类仍保留为**四次独立调用**（任一类失败不连坐，这条独立成立），`STYLE_KINDS` 也留着 —— `styles[].type` 的取值域还需要它一处。
  
  真机待验：① 即时设计上 `get_page` 与 `jsd://styles` 回到毫秒级且 `note` 点名；② MasterGo 上 `jsd://styles` 仍列得出样式。

## 0.9.0

### Minor Changes

- [`59972f4`](https://github.com/wzrove/text-to-design/commit/59972f4154b9b0b753eb18da86facfdbe778b7c7) Thanks [@wzrove](https://github.com/wzrove)! - feat(ui): 页头提示改用 daisyUI tooltip,操作结果统一走 toast(见 0037)
  
  **提示**:页头五颗功能按钮(重连/夺回、相机锁、主题、语言、日志)的说明从原生 `title` 换成 daisyUI `tooltip` —— 原生提示延迟约一秒、样式由宿主定,而这几句都是长句(相机锁那句 26 个字),在 360 宽面板里会被 iframe 边缘裁掉半截。统一经新的 `Tooltip` 组件:`data-tip`、贴边方位(右侧工具簇贴右、左侧那颗贴左,居中放两头都会伸出面板)与包装元素的职责都收在一处;键盘可达沿用 daisyUI 的 `:has(:focus-visible)`,可访问名仍由各按钮自己的 `aria-label` 给出。气泡宽度在 `index.css` 收口到 12rem(daisyUI 默认 20rem 必然越界),那条规则写在层外,理由见文件内注释。
  
  **反馈**:操作成功后的提示原先有四种写法(选中卡 `✓`、连接引导 `✓ 已复制`、日志行 `✓`、能力表刷新不出声,`setTimeout` 时长还不一致),现在统一到一个出口:`utils/toast.ts`(模块级唯一状态源,同文案只留最新一条并重新计时)+ `components/Toast.tsx`(唯一挂载点,daisyUI `toast` 提供定位/堆叠/入场动画,条目沿用面板的「淡底组合」而非 `.alert-*` 的语义实心底)+ `copyWithToast`(复制成败 → 文案 + 级别的唯一映射)。
  
  尺子写死在 0037:只在**结果不可见或极易忽略**的操作上弹(复制、相机锁),界面本身已经变了的不弹(开合抽屉、切主题、清空日志、重连)。`fixed` 定位不进流,故弹提示不改变 `PanelHeightSync` 量出的内容高度。
  
  i18n:增 `toast.copy.done` / `toast.copy.failed`,删已无引用的 `conn.copied` / `selection.copied`(键化沿 0016,两键删净不留在表里)。mcp 侧只是 dist 里跟着换一份 catalog,行为不变,故 patch。

- [`59972f4`](https://github.com/wzrove/text-to-design/commit/59972f4154b9b0b753eb18da86facfdbe778b7c7) Thanks [@wzrove](https://github.com/wzrove)! - feat(版本升级提示): 落后于 npm 最新版时,页头挂出升级入口,点开 Modal 给分步清单并支持复制给 AI 助手(见 0038)
  
  **谁去查**:面板 iframe 直连 npm registry 在 Figma 上必被 `networkAccess` 白名单挡住(只有 localhost),jsDesign 未声明、MasterGo 无该字段 —— 所以改由 **daemon 代查**:`mcp-server/src/version-check.ts` 带超时与进程内缓存(查询周期 `VERSION_CHECK_MS`),结果经新的推送帧 `version` 发给面板,投递跟心跳(30s)、查询按缓存周期,故面板刚连上就能拿到结论而 registry 不被心跳打。查不到(超时/非 200/无 version)一律返回 `null` 并 warn —— **不提示**,宁可闭嘴也不给错的升级建议。
  
  **比什么**:插件侧比自己(构建期 `define` 注入 `__APP_VERSION__`,比 `import package.json` 稳,避开 `resolveJsonModule`),服务侧比 daemon 自报的 status 帧版本;两侧独立,只升了一个也照常提示。比较走 `utils/version.ts` 的纯数字段比较(`0.9.0 < 0.10.0`),预发布后缀砍掉后与正式版同档。`latest` 为 `null` 的一侧不参与。
  
  **入口**:只在确有新版本时挂载(沿页头「重连」钮的纪律:常态面板里一颗点不出东西的按钮是噪声),纯图标不带文字以免页头抖动;气泡走既有 `Tooltip`。Modal 用 daisyUI 的原生 `<dialog>`(要它的 top-layer 盖住 `z-50` 的 toast,顺带有原生 Esc),遮罩仍是真 `<button>` + `form method=dialog`,Esc/关闭后焦点归还页头那颗钮(与日志抽屉同一条纪律)。复制走既有 `copyWithToast`,指令里带上两侧当前版本与最新版本。
  
  **不做**:不自动升级、不代跑命令、不做「忽略此版本」持久化、只认 `latest` dist-tag。

## 0.8.0

### Minor Changes

- [`5369b80`](https://github.com/wzrove/text-to-design/commit/5369b806a98c372e027af6a443adf831bdcd211d) - feat(shared): 平台事实收敛为声明表,写路径补齐布局回读与适用性判定

- [`079dbef`](https://github.com/wzrove/text-to-design/commit/079dbef2e07cf13a780d4286a822dbfc6c64fd0a) - feat(ui): 三平台门面与取值域编译期断言 + MG 集合级变体管理

### Patch Changes

- [`927c618`](https://github.com/wzrove/text-to-design/commit/927c618b7037b3dfc21611e65fe769b82180049d) - 能力字典改为规格表:每条能力一条记录(带 `kind`),文案键收进表里。删掉两份无人消费的中文 label 表与 `ui/src/i18n/capabilityKeys.ts`,面板能力表少一行(不再展示 `platformOps` 能力位 —— 同回包里的 op 名单已经表达了这件事)。
  
  判定行为不变:`inPlaceVariants` 的策略顺序、字段门控结果与 warnings 文案均未改;`textTruncation` / `maxLines` 的类型判定改走 `dicts/prop-applicability.ts` 的同一张适用性表(行为等价)。
  
  **mcp 侧必须一起发版**:MCP 的 `dist` 会把 shared 的源码打包进去,能力枚举就在里面。线格式枚举(`hostCapabilitySchema`)与取值表**同宽**,明确不作跨版本容忍 —— 退役的 `platformOps` 位在两边都是非法值,**插件与 MCP 要同步升级/重载**(不同步时旧插件发来的 `capabilities` 过不了 `pingResultSchema`,`jsd_ping` 会回 `isError` 且**没有** `structuredContent` —— 症状是整个 ping 工具坏掉,不是少显示一行)。见 0029。

## 0.7.2

### Patch Changes

- [`9039a4a`](https://github.com/wzrove/text-to-design/commit/9039a4ab20db304319cba9d258c1fbcb8df5e783) Thanks [@wzrove](https://github.com/wzrove)! - refactor: 三处展开面板收口为受控组件 CollapsibleSection（图标触发器 + 正文常驻，见 0026）

- [`80e05bc`](https://github.com/wzrove/text-to-design/commit/80e05bce09a347d7bcd70645ef6160238cedc214) Thanks [@wzrove](https://github.com/wzrove)! - feat: implement camera lock functionality and theme toggle in UI

- [`9039a4a`](https://github.com/wzrove/text-to-design/commit/9039a4ab20db304319cba9d258c1fbcb8df5e783) Thanks [@wzrove](https://github.com/wzrove)! - fix: 面板高度夹取上限与建议收缩点分离，新增 PANEL_HEIGHT_CEILING

- [`9039a4a`](https://github.com/wzrove/text-to-design/commit/9039a4ab20db304319cba9d258c1fbcb8df5e783) Thanks [@wzrove](https://github.com/wzrove)! - fix: 自适应高度下窗口底部的区块被裁掉一截（`SelectionCard` / `CapabilityCard` 下沿不可见）。`ui.resize(width, height)` 的 `height` 在三个平台都是**外框**高度，外框里含着宿主自绘的标题栏，而测量侧只发了内容高度。现把「装饰高」提升为 `ui_env` 契约成员 `chromeHeight`：**只有 MasterGo 有真源**（`ui.viewport.headerHeight`）并实现上报；Figma / jsDesign 的 typings 里没有该符号，故不实现，缺省 `0` = 不补偿（行为与改前一致）。`PanelHeightSync` 按「内容高 + 装饰高」请求，缺字段与不可信值统一走 `normalizeChromeHeight` 收成 0（见 0028）

- [`9039a4a`](https://github.com/wzrove/text-to-design/commit/9039a4ab20db304319cba9d258c1fbcb8df5e783) Thanks [@wzrove](https://github.com/wzrove)! - fix: 面板高度夹取不再截断超限内容，测量改用 scrollHeight 断掉自锁（见 0014 修订）

- [`9039a4a`](https://github.com/wzrove/text-to-design/commit/9039a4ab20db304319cba9d258c1fbcb8df5e783) Thanks [@wzrove](https://github.com/wzrove)! - fix: 三平台插件加载即崩于 zod 顶层裸 `BigInt()`（`ReferenceError: 'BigInt' is not defined`）。插件沙箱不提供 `BigInt` 全局，而 `zod@4.6.x` 的 `BIGINT_FORMAT_RANGES` 是模块顶层 export const、初始化表达式里裸调 `BigInt(...)`。把 `vite-plugin-zod-sandbox` 从「globalThis 单点替换」扩写为三平台通用的沙箱适配器：注入 `typeof BigInt === 'function' ? BigInt : (v) => v` 探测桩并把模块体内裸 `BigInt` 改指向它；同时把 zod 路径正则从锁死 `4.5.4` 改为按包名匹配（见 0027）

## 0.7.1

### Patch Changes

- [#31](https://github.com/wzrove/text-to-design/pull/31) [`b467b29`](https://github.com/wzrove/text-to-design/commit/b467b296206704a0329d6e37db47f70ad3653740) Thanks [@wzrove](https://github.com/wzrove)! - feat: add mastergo

## 0.7.0

### Minor Changes

- [`5bc86bb`](https://github.com/wzrove/text-to-design/commit/5bc86bb9bf6c7b31c54e446d1c8f3abd4041afc7) Thanks [@wzrove](https://github.com/wzrove)! - feat: 日志改为按需抽屉、面板高度改为贴合内容

  两件事一起做，因为前者直接制造了后者要解决的问题：日志不再占位之后，固定 520 的面板底部空出一大片。

  **日志：常驻面板 → 按需抽屉**

  日志是纯诊断信息，却拿了主视线资源：原 `LogPanel` 挂 `flex-1`，在面板里常态吃掉一半以上高度，且与「选中节点」同级做成了实心卡（`border` + `shadow-sm` + `bg-base-100`），顶上还有一排 4 个过滤按钮，空态是一个 emoji 加两行文案。

  - 出口改成 header 上的幽灵图标（`LogTrigger`）：无文字、`/50` 灰，只在有未读 error 时染成 error 色并露出条数。
  - 打开时从底部滑出固定 `72%` 高的抽屉（`LogDrawer`）；默认档位由 `info+` 提到 `warn+` —— 健康状态下打开就该是空的，满屏 info 只是把「太显眼」换了个地方犯。
  - 未读水位按**错误条数累计**记，而不是最大 id：同一行日志会被 `pushLog` 合并成计数（id 不变），按 id 记会让复发的同一错误永远不算未读 —— 偏偏复发才最该被看见。清空后水位随之归零。
  - 可达性：`role=dialog` + `aria-modal`；ESC 与点遮罩都能关（遮罩用真 `button`，键盘可达且不必给 `div` 挂 `onClick`）；关闭后焦点还给入口钮；新错误数经 sr-only live region 播报；`prefers-reduced-motion` 下入场动效由全局兜底压掉。

  **面板高度：固定 520 → 贴内容（宿主支持时）**

  宿主 `ui.resize` 两平台都有（Figma `figma.ui.resize`、jsDesign `UIAPI.resize`），但 `showUI` 不接受 `height: 'auto'`，所以「自动高度」只能是由 UI 量出来再推给窗口。见 `docs/design-decisions/0014`。

  - 尺寸常量、夹取函数与两条旁路消息收进 `shared/src/panel.ts`；旁路消息**不进 `PluginRequest` 契约**（那条契约的 schema 给 MCP 工具用、会进工具目录，改高度不过 MCP）。
  - code 侧用 `ui_env` 上报「`typeof host.ui.resize === 'function'`」，UI 据此二选一：有则窗口贴内容；**没有则退回「选中节点吃满剩余高度」**（`SelectionCard.fill`），与历史行为一致。缺消息按「没有」处理。
  - 防抖与夹取：测量值只在变化 ≥ 8px 时才发，且**向上**吸附到该步长；取整固定**向上**并留 1px 余量，`html/body` 再加 `overflow: hidden` —— 三者共同保证「请求高度 ≥ 内容高度」。差一点点都不行：窗口只要比内容矮，视口就冒出 Scrollbar → 内容宽度少 4px → 中文重排 → 内容变高 → 再请求 → 滚动条消失 → 变矮……这条回环的表现就是面板持续抖动。触发源是 `ResizeObserver` 而不是 `selectionchange` —— 后者高频，窗口会跟着每次画布点选变高变矮。
  - 面板高度**只由内容决定**：开合日志抽屉不改变窗口尺寸（抽屉自己取窗口的 85%）。抽屉同时由 `absolute` 改 `fixed`：自适应下根元素高度即内容高度，按根元素定位会矮一截，遮罩外会露出未变暗的那部分。
  - `index.css` 给 `html/body` 补上主题底色，窗口暂高于内容时露出的那一段与面板同色。

  文件：`LogPanel.tsx`（删）→ `LogDrawer.tsx`、`LogTrigger.tsx`、`PanelHeightSync.tsx`（新）；`App.tsx` 收口布局二选一与未读水位；新增 `shared/src/panel.ts`、`ui/src/bridge/codeChannel.ts`（信封单点，此前 `router.ts` 手写两遍）。`COLORS.md` / `tailwind.config.js` / `router.ts` / `CapabilityCard.tsx` 的 `LogPanel` 指路注释同步更名。

## 0.6.3

### Patch Changes

- [`e40cb9d`](https://github.com/wzrove/text-to-design/commit/e40cb9def43f18689d2c34b83a7372ad59606875) Thanks [@wzrove](https://github.com/wzrove)! - Merge branch 'main' of github.com:wzrove/text-to-design

## 0.6.2

### Patch Changes

- [`ab50ec9`](https://github.com/wzrove/text-to-design/commit/ab50ec99a6721bdc564c87af39be7de35f9689f5) Thanks [@wzrove](https://github.com/wzrove)! - fix: 「回显成功却没生效」不再静默：创建路径补齐 WriteOutcome 回收 + 修正返回键文案与漂移复核覆盖面

  - shared（写后回收，见 `docs/design-decisions/0007`）：
    - 创建路径此前只回收能力门控，`WriteOutcome.readback(ok:false)` 与 `outcome.warnings` 被静默丢弃；现由新增的 `core/props/outcome.ts` 统一搬运/组装，`buildNode` 与 `executeOps` 补齐回收，字段级修法文案收进 `dicts/unapplied-prop.ts`（唯一真源，两条写路径共用）。
    - 引擎实测新发现（见 0001 变更历史）：`resize()` 会把 TEXT 的 `textAutoResize` 重置为 `NONE`，而创建路径的尺寸回压跑在文本字段之后 —— 调用方显式声明的 `"HEIGHT"` 被吃掉（实测传 `width:200 + HEIGHT` 回读 `NONE`、`height` 停在 15）。新增 `textStabilizeWriter` 在尺寸之后把声明值再压一遍（与既有的 sizingMode 回压同族）。
    - 新增三类点名，全部**以回读为证**（引擎真按请求落了值就一个字都不报）：`fontName` 回读不一致、TEXT `width/height` 被改写、**未声明 `textAutoResize` 却被置 `NONE`**（宽度生效、文本会换行，但文本框高度不随内容重算，父容器按旧高度算会裁切）；根节点 `x/y` 被 `placement`（缺省 center）覆盖 —— 此前只能靠肉眼发现位置不对。
    - `jsd_list_fonts` 增补 `fonts:[{family,styles}]`：写 `fontName` 时 family 用 `fonts[].family` 原样、style 用同一项的**全名**（如 `SourceHanSansCN-Bold`）—— 实测把 style 写成简称（`"Bold"`）会被引擎**静默忽略**（回读照抄请求值、渲染退回默认字面；用对全名后 Bold 与 Regular 的导出 PNG sha1 不同＝字重确实生效）。此前只回 family 列表，调用方只能猜，且不会报错。
    - `fontName` 的判定**挪到结果装配期**：引擎的规范化只在序列化后的值上可见（同一调用里写入期读到的是原样回显），在写入/结算期判会把合法写法误报成没生效（重载后实测踩到）。判据是两条可证的形态：请求带 `_family` 而结果**仍带** `_family` ⇒ 未解析；结果里的族与请求不同 / style 落成 `@@` 哨兵 ⇒ 整族回退。短名对（`{SourceHanSansCN, Bold}`）与 family 不带 `_family` 的少数族不判 —— **宁可漏报不误报**。告警随之带上 `detail`（本次实测到的形态）。
  - 测试门禁（两台既有假失败，本机环境所致，非回归）：
    - `tests/engine-api-compat.test.ts`：`core.autocrlf=true` 下 `//.*$` 剥不掉行尾注释（`.` 不吃 `\r`、`$` 要求串尾），注释里提到的 API 名被当违规；读取时归一化 CRLF。
    - `tests/plugin-prop-dispatch.test.ts`：`new URL(...).pathname` 在 Windows 给 `/D:/...`，拼成 `D:\D:\...` ENOENT；改用 `fileURLToPath`。
  - mcp-server：
    - `jsd_manage_nodes` 挂上漂移复核钩子：聚合入口此前没挂，`drift-watch.ts` 里为它写的 op 判断是死代码 —— 走 `jsd_batch` 的 `jsd_manage_nodes{op:"remove"}` 不复核，而固定 op 小工具有复核（0003 的覆盖面缺口）。
    - 修正返回键文案：`group`/`flatten` 返回 `created` **单对象**（`clone`/`outline_stroke` 才是数组），此前 batch/manage 两处都写成 `created[]`，按它写占位符会报「无法解析占位符引用」并掐断整批；README、`server.ts` INSTRUCTIONS 同步。
    - 补三条边界纪律（三处同源：工具描述 + `prompts.ts` 总纲 + `server.ts` INSTRUCTIONS）：占位符只在同一批次内有效（跨批次须硬编码真实 id）、根节点 `x/y` 由 placement 决定、结果 `warnings` 一律读（它点名的都是「回显成功但没生效」）。
  - 插件侧需重新构建并重载：本次改了 `shared/`，插件跑旧产物时新 warnings 不会出现。

## 0.6.1

### Patch Changes

- [`2f73afe`](https://github.com/wzrove/text-to-design/commit/2f73afeaa54a719b30081f2b3f11cc76ae87e1c2) Thanks [@wzrove](https://github.com/wzrove)! - fix: 「连接中」不再牵动面板结构,未连接时提示条不重载

  - ui(StatusBadge): 「连接中」的反馈收拢成徽章上的一个转圈(`.badge-spin`,900ms linear,`prefers-reduced-motion` 下由全局规则压为静态)。它只是进行时,不是另一种面板形态,因此其余区块不再为它改结构。徽章文字与颜色仍如实跟随 status,不做时间维度修饰。
  - ui(ConnectionHint): 形态空间从四态收成三态(connected / superseded / disconnected),`connecting` 并入「还没连上」共用引导卡 —— 连接期间「后台服务尚未连接」依然是事实,卡上两条路径也依然可执行。同时形态切换改为只切显隐、不重建 DOM:此前 `createMemo` 按 status 分支返回新 JSX,Solid 每次都把整块提示条卸载重建(`hint-enter` 重播、按钮焦点与「已复制」反馈丢失、live region 重播播报),表现为「组件在重载」。播报改用常驻 sr-only live region,按真实 status 播报(含 connecting),文案压到一行。
  - ui(ConnectionHint): 顺带删掉与页头重复的信息 —— 原「连接中」那行复述的端口(`ws://localhost:<port>`)与「点右上角重试」,页头已常驻 `:<port>` 与「重试」按钮。

## 0.6.0

### Minor Changes

- [`5d84644`](https://github.com/wzrove/text-to-design/commit/5d84644f9ee219c82108206f3582d8dd956cc4fb) - feat: 平台能力表全面打通(字典真源 → core 判定 → MCP → 面板)

  - shared: 新增 `dicts/capability.ts` 作为能力唯一真源(取值 + 中文标签 + 能力门控的属性表),`dicts/node-type.ts` 增加读路径全表(`OBSERVED_NODE_TYPES`,含 Figma 独有的 20 类只读类型);capabilities 与 node type 的 zod 枚举改为从字典派生。core 的「字段是否生效」判定不再手写 `PLATFORM_SUPERSET_PROPS`,而是吃注入的能力表(优先级:能力表否决 → 运行时属性探测),创建路径同样点名跳过的门控字段。
  - mcp-server: daemon 新增平台状态缓存(插件上线自动探测、断开清空、失败 fail-open),`jsd_ping` 增加 `platformOps` 名单回传;新增只读资源 `jsd://platform/state`;工具支持 `platforms`/`platformNote` 声明,平台不适用时直接拦截并给出替代路径(`jsd_platform_op` 标注为仅 Figma)。
  - ui: 面板新增可折叠「能力」区块(核心能力 / 平台差异能力 / 平台特有 op 名单),数据经既有 ping 通路获取;两平台编译期契约断言补全(NodeSkeleton 成员存在性、Figma 独有类型登记、jsDesign 超集缺席)。
  - 修复: 读路径遇到 Figma 独有节点类型(如 SECTION)会让 `jsd_get_selection` / `jsd_get_page` 整条结果校验失败;`ungroup` 在 Figma 上因调用不存在的节点级方法而静默 no-op。
  - 文档: 修正 README 中「只读资源随连接门控隐藏」的过时描述(实际是目录恒定、离线调用快速失败)。

## 0.5.2

### Patch Changes

- [`85e54d9`](https://github.com/wzrove/text-to-design/commit/85e54d9055565dfac810e05650186af3a40e09ca) Thanks [@wzrove](https://github.com/wzrove)! - feat: enhance design host interface and add local styles retrieval

- [`85e54d9`](https://github.com/wzrove/text-to-design/commit/85e54d9055565dfac810e05650186af3a40e09ca) Thanks [@wzrove](https://github.com/wzrove)! - fix: 修掉 jsDesign 引擎侧 set_fills/set_effects 校验失败

  - shared: Paint/颜色/效果 schema 全面收紧 —— rgb/rgba/paint/effect 加 strict(多出的键直接报错而非静默剥离)、SOLID 的 blendMode 改用枚举、children 从 z.any 改为 z.lazy 递归校验节点树(嵌套坏 fills 在 MCP 层即被拦);
  - shared: 新增引擎赋值前归一化(buildNode/update 接入):0-255 色值自动转 0-1、SOLID color.a 移到 paint 级 opacity、阴影缺 blendMode/visible 补默认值、fills/effects 非数组容器报中文错、booleanOperation 白名单校验、vectorPaths 缺省 windingRule;
  - mcp: jsd_batch 直调 executor 补 inputSchema 校验,内层工具坏参数不再穿透到引擎;
  - ui: 插件错误日志带堆栈与请求摘要,便于定位 "not a function";
  - shared: clone 未命中节点报错附请求 ids 与 jsd_find 提示

## 0.5.1

### Patch Changes

- [`dbd7b10`](https://github.com/wzrove/text-to-design/commit/dbd7b10e3e3c27ca16f5a23c4fc0ad71b53f657f) Thanks [@wzrove](https://github.com/wzrove)! - refactor: jsd_execute 更名 jsd_create_nodes, 加固 reparent/detachInstance 边界校验

## 0.5.0

### Minor Changes

- [`26666ca`](https://github.com/wzrove/text-to-design/commit/26666cac32046f61f422c517cd0e9265921944cb) Thanks [@wzrove](https://github.com/wzrove)! - refactor: executeNodeSchema 按 type 拆分为 discriminatedUnion,增强 LLM 参数理解

  - executeNodeSchema 从 50+ 字段平铺改为按 type 拆分的 discriminatedUnion,LLM 只需关注当前 type 相关字段
  - letterSpacingSchema 支持 PERCENT 单位(对齐 plugin-api)
  - blendModeSchema 移除引擎不存在的 LINEAR_BURN/LINEAR_DODGE
  - 新增 superRefine 跨字段校验(layoutMode/placement/layoutGrid/children)
  - 增强各字段 description(RGB 0-1 范围、SVG path 示例、gradientTransform 示例等)
  - tool description 重构(jsd_execute 分段、manage_nodes/manage_components 分条)

## 0.4.0

### Minor Changes

- feat: 类型对齐 plugin-typings, GROUP/FRAME 支持 auto-layout, 新增 find by id 与 update_node 工具

  - 重构 ExecuteOp/SerializedNode 字段名对齐 runtime NodeType (op→type, w/h→width/height 等)
  - 统一 Paint/Effect/LayoutGrid 类型, 消除 SerializedStroke/SerializedGradient
  - GROUP 内部用 Frame 实现, 支持 auto-layout (layoutMode/itemSpacing/padding\*)
  - jsd_find 新增 ids 字段按 id 精确查找
  - 重命名 jsd_update_selection → jsd_update_node
  - jsd_manage_nodes group 支持 auto-layout 参数
  - effect blendMode 默认值 'NORMAL', 修复运行时校验错误
  - 提取共享 schema (transform/stroke/corner/text/autoLayout/visual)

## 0.3.0

### Minor Changes

- [`7bb67e4`](https://github.com/wzrove/text-to-design/commit/7bb67e4f6394920aeed3bd0c3ef53f3a23679035) Thanks [@wzrove](https://github.com/wzrove)! - feat: icon 别名 + npx 安装指南

## 0.2.0

### Minor Changes

- [`6ed97a6`](https://github.com/wzrove/text-to-design/commit/6ed97a68b79014e81677110a81060eecdd48e45d) Thanks [@wzrove](https://github.com/wzrove)! - 新增组件/变体操作与 SVG 原生导入

## 0.1.0

### Minor Changes

- [`47e502c`](https://github.com/wzrove/text-to-desgin/commit/47e502cb24059cf79c1bbbcae9f8189b0df657db) Thanks [@wzrove](https://github.com/wzrove)! - 首次发布到 npm
