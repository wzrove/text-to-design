# text-to-design-mcp

## 0.13.4

### Patch Changes

- [`69d92bd`](https://github.com/wzrove/text-to-design/commit/69d92bd0990e465fa62aca542017ccf86f3881f4) Thanks [@wzrove](https://github.com/wzrove)! - feat: add minimized pet component and activity phase handling

## 0.13.3

### Patch Changes

- [`29058ba`](https://github.com/wzrove/text-to-design/commit/29058bad2640be340e6a16c757befd9ae0de5f57) Thanks [@wzrove](https://github.com/wzrove)! - feat(ui): 面板最小化 —— 页头新增最小化入口,点击后窗口缩到 50×50(高度是**内容区**口径,外框另加宿主标题栏),最小化期间只显示 `logo.svg`,双击 logo 恢复原样。新增 `ui_minimize` 旁路消息(模式归 UI、尺寸归 code);宿主不支持 `ui.resize` 时不挂该入口(缩不下去的钮等于骗用户)。最小化同时清空宿主标题栏文字(`showUI` 的 `title` 选项 —— 这是标题的唯一入口;MasterGo 的 ShowUIOptions 没有该字段,如实只清 Figma / jsDesign),恢复时写回 `PANEL_TITLE`。恢复时窗口先回 `PANEL_WIDTH` × `PANEL_HEIGHT_DEFAULT`,再由 `PanelHeightSync` 重挂并推真实内容高。UI 侧另按视口宽度兜底最小化态:再次 `showUI` 若在某个平台重载 iframe,面板以最小化态重启而不是锁死。

## 0.13.2

### Patch Changes

- [`7803213`](https://github.com/wzrove/text-to-design/commit/78032131909b82513b02eaf9b861a2bae5e65244) - fix(jsdesign): 主组件读取改按平台声明选路 —— 新增 flow 能力位 `mainComponentSync`（即时设计声明），`resolveMainComponent` 不再 `?.` 探测 `getMainComponentAsync`。真机 2026-10-19：该符号在即时设计运行时存在但**永不 settle**，`jsd_copy_overrides`（只读快照、不写属性）25109ms 超时、`jsd_set_instance_properties` 同样超时；`detachInstanceNodes` / `copyInstanceOverrides` / `applyOverrides` 三个入口一并接上 `RuntimeContext`

- [`db5982d`](https://github.com/wzrove/text-to-design/commit/db5982d59a6902432d84f3c436ae7f0e841f323b) Thanks [@wzrove](https://github.com/wzrove)! - feat: enhance text properties handling and schema updates

- [`7803213`](https://github.com/wzrove/text-to-design/commit/78032131909b82513b02eaf9b861a2bae5e65244) - fix(jsdesign): 组件 / 变体 / 实例按**实际运行期类型**收口,不再按 typings 假设。真机 2026-10-20 逐条隔离出的四处「声明了但运行期不是那样」:
  
  1. **变体表取值形状** —— `variantGroupProperties.values` 元素不保证是字符串(多成员集合回 `[{name:"默认"}]`),撞穿线格式 `string[]` 会让 `get_page` / `jsd_find` **整条失败**。归一收进新模块 `core/variant.ts`,两个投影点(`serialize.ts` / `assets.ts`)与平台 op 共用一份实现;`serializeNode` 另加「getter 抛也省略该字段」保护。
  2. **两套变体键** —— 集合维度键(如 `状态`)与成员键(`分类1`)**不是同一套**,而引擎写入口只认成员键。`setInstanceProperties` 现在两边都收,集合键按**取值唯一匹配**映射成成员键(歧义/无匹配点名报错,绝不猜),并把键解析提到任何写入之前。
  3. **实例三通道运行期不可用** —— `setProperties` 不是函数、`swapComponent` 抛内部错误、`detachInstance` 原位返回 INSTANCE(静默 no-op)。三条通道改为**行为检测 + 写后回读**,失败逐条点名并给可执行出口;`createInstances` / `cloneNodes` 对**组件集成员**的引擎缺陷(createInstance 必抛、clone 返回 undefined)逐条收集而非整批崩。
  4. **事实与文案** —— `platform-knowledge.ts` 回填真机证据并**把 `jsd_set_instance_properties` 从 jsDesign 的 variants.write 里摘掉**(那条路径实测必败);`platform-facts.ts` 的三处投影改为取事实表判据,不再声称「切到已有取值」。`jsd_component_facts` 增补 `swapComponentAvailable`、`dimensionMismatch` 细分为 setOnly/memberOnly。

## 0.13.1

### Patch Changes

- [`0c44a82`](https://github.com/wzrove/text-to-design/commit/0c44a82576da19ac7d90d46b1bb5ee5c1433f1e0) Thanks [@wzrove](https://github.com/wzrove)! - feat: enhance component resizing behavior and serialization

## 0.13.0

### Minor Changes

- [`6f52b75`](https://github.com/wzrove/text-to-design/commit/6f52b75cf918711cf2440158e92329368ec16bea) - feat: 批量清单可落文件 —— `jsd_batch` 收 `callsFile`,新增 CLI `exec`
  
  - `jsd_batch` 入参新增 `callsFile`(与 `calls` 二选一):给一个 JSON 文件的**绝对路径**,文件内容为 `{"calls":[…]}`(可带 `stopOnError` / `checkDrift`)或直接一个数组,两种形状等价(多一条形状就多一份事实要维护)。整页批量改造时入参里最占地方的是 id 数组(一份 `bindings` 上千个 node id),放进文件后 id 不必进上下文 —— 也就不必**逐字转写**(转写错一个就是静默漏改)。读文件有体积上限(`TEXT_TO_DESIGN_MCP_MAX_CALLS_FILE_BYTES`,默认 8 MB)、只收 JSON、步骤数仍受单批 50 步上限,失败一律点名(路径 / 体积 / 第几步 / 哪个字段错),不截断不猜。
  - 新 CLI 子命令:`text-to-design-mcp exec <calls.json> [--json] [--dry-run]`。同一个文件形状,直接跑一次 `jsd_batch`;`--dry-run` 只校验清单不连 daemon,`--json` 把结果打成 JSON 供管道消费(计划与日志走 **stderr**,不污染 stdout),任一步失败退出码为 1。daemon 不在时按既有自检逻辑自己拉起 —— `spawnDaemon` 新增 `argvOverride`,exec 只把**入口路径**传过去,否则被拉起的 daemon 会带着 `exec` 子命令再跑一遍(递归)。
  - 配方 `script-ops` 扩写「整页/整档批量改造」一节:先摸底、定策略前确认现状形态(有渐变/多色的节点不能一次绑整组)、id 的三种来源、按块切批、回读复核必须单独调一次 `jsd_find`(batch 回显会被裁剪到 id/name/type/几何)、清单装不下走文件或 CLI、点名类错误不重试。并明确一条边界:**不要去连 daemon 的本地端口或 import 本仓内部模块** —— 那是 shim↔daemon 的内部传输契约(端口可被 env 改、SDK 安装路径属 pnpm 私有结构),把它写进配方等于把内部契约公开化;做成子命令后对外契约只剩 CLI + JSON 形状。`jsd_batch` 描述(zh/en)与配方目录的 `whenToUse` 同步补指针。
  - README 常见问题补一条「想用脚本批量改画布」的入口说明。
  
  验证:typecheck 全绿;`vitest run` 的 recipe-resource / catalog-budget / instructions-routing / i18n 四组 35 个用例通过;真机(Figma)`exec` 跑通 `--dry-run` / 相对路径点名 / 文件不存在点名 / 自动拉起 daemon / 成功执行退出码 0 / 失败退出码 1 / `--json` 的 stdout 纯净;`callsFile` 三态验过(只给文件 → 2/2 成功;两个都给 → 点名拒;都缺省 → 点名拒)。

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

## 0.12.1

### Patch Changes

- [`f911e51`](https://github.com/wzrove/text-to-design/commit/f911e5132f49e02ecbdcac0f9db0047b4850a1a8) - fix(ui): 悬浮提示气泡对齐改为量边界自动选,消除面板横向滚动条

## 0.12.0

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

## 0.11.0

### Minor Changes

- [`59972f4`](https://github.com/wzrove/text-to-design/commit/59972f4154b9b0b753eb18da86facfdbe778b7c7) Thanks [@wzrove](https://github.com/wzrove)! - feat(版本升级提示): 落后于 npm 最新版时,页头挂出升级入口,点开 Modal 给分步清单并支持复制给 AI 助手(见 0038)
  
  **谁去查**:面板 iframe 直连 npm registry 在 Figma 上必被 `networkAccess` 白名单挡住(只有 localhost),jsDesign 未声明、MasterGo 无该字段 —— 所以改由 **daemon 代查**:`mcp-server/src/version-check.ts` 带超时与进程内缓存(查询周期 `VERSION_CHECK_MS`),结果经新的推送帧 `version` 发给面板,投递跟心跳(30s)、查询按缓存周期,故面板刚连上就能拿到结论而 registry 不被心跳打。查不到(超时/非 200/无 version)一律返回 `null` 并 warn —— **不提示**,宁可闭嘴也不给错的升级建议。
  
  **比什么**:插件侧比自己(构建期 `define` 注入 `__APP_VERSION__`,比 `import package.json` 稳,避开 `resolveJsonModule`),服务侧比 daemon 自报的 status 帧版本;两侧独立,只升了一个也照常提示。比较走 `utils/version.ts` 的纯数字段比较(`0.9.0 < 0.10.0`),预发布后缀砍掉后与正式版同档。`latest` 为 `null` 的一侧不参与。
  
  **入口**:只在确有新版本时挂载(沿页头「重连」钮的纪律:常态面板里一颗点不出东西的按钮是噪声),纯图标不带文字以免页头抖动;气泡走既有 `Tooltip`。Modal 用 daisyUI 的原生 `<dialog>`(要它的 top-layer 盖住 `z-50` 的 toast,顺带有原生 Esc),遮罩仍是真 `<button>` + `form method=dialog`,Esc/关闭后焦点归还页头那颗钮(与日志抽屉同一条纪律)。复制走既有 `copyWithToast`,指令里带上两侧当前版本与最新版本。
  
  **不做**:不自动升级、不代跑命令、不做「忽略此版本」持久化、只认 `latest` dist-tag。

### Patch Changes

- [`59972f4`](https://github.com/wzrove/text-to-design/commit/59972f4154b9b0b753eb18da86facfdbe778b7c7) Thanks [@wzrove](https://github.com/wzrove)! - feat(ui): 页头提示改用 daisyUI tooltip,操作结果统一走 toast(见 0037)
  
  **提示**:页头五颗功能按钮(重连/夺回、相机锁、主题、语言、日志)的说明从原生 `title` 换成 daisyUI `tooltip` —— 原生提示延迟约一秒、样式由宿主定,而这几句都是长句(相机锁那句 26 个字),在 360 宽面板里会被 iframe 边缘裁掉半截。统一经新的 `Tooltip` 组件:`data-tip`、贴边方位(右侧工具簇贴右、左侧那颗贴左,居中放两头都会伸出面板)与包装元素的职责都收在一处;键盘可达沿用 daisyUI 的 `:has(:focus-visible)`,可访问名仍由各按钮自己的 `aria-label` 给出。气泡宽度在 `index.css` 收口到 12rem(daisyUI 默认 20rem 必然越界),那条规则写在层外,理由见文件内注释。
  
  **反馈**:操作成功后的提示原先有四种写法(选中卡 `✓`、连接引导 `✓ 已复制`、日志行 `✓`、能力表刷新不出声,`setTimeout` 时长还不一致),现在统一到一个出口:`utils/toast.ts`(模块级唯一状态源,同文案只留最新一条并重新计时)+ `components/Toast.tsx`(唯一挂载点,daisyUI `toast` 提供定位/堆叠/入场动画,条目沿用面板的「淡底组合」而非 `.alert-*` 的语义实心底)+ `copyWithToast`(复制成败 → 文案 + 级别的唯一映射)。
  
  尺子写死在 0037:只在**结果不可见或极易忽略**的操作上弹(复制、相机锁),界面本身已经变了的不弹(开合抽屉、切主题、清空日志、重连)。`fixed` 定位不进流,故弹提示不改变 `PanelHeightSync` 量出的内容高度。
  
  i18n:增 `toast.copy.done` / `toast.copy.failed`,删已无引用的 `conn.copied` / `selection.copied`(键化沿 0016,两键删净不留在表里)。mcp 侧只是 dist 里跟着换一份 catalog,行为不变,故 patch。

## 0.10.0

### Minor Changes

- [`87ba59c`](https://github.com/wzrove/text-to-design/commit/87ba59ce14d55758614c23e9e74c682b9a4f445d) - feat(mcp): 新增 jsd_get_page 工具,补齐「当前页顶层」这一层漂移复核
  
  `jsd_get_page` 把既有资源 `jsd://page` 同一个能力开成工具(资源给「客户端主动读上下文」,工具给「模型明确要读」,同 `jsd_get_selection` / `jsd://canvas/selection` 一对)。
  
  - 名字不是随便起的:结构变更复核(`drift-watch`)的「当前页顶层」这一层按 `jsd_get_page` 走 `lookupExecutor`。该工具此前**不存在**,`lookupExecutor` 返 `undefined` → 该层被判 `dead`,**复核从未执行过且日志里一个字都没有** —— 而 `jsd_batch` 的描述一直写着「含当前页顶层」。改名/删名会再次静默打断它。
  - 无参工具也显式给 `inputSchema`(不给会走 SDK 的 `callback(ctx)` 形态,工具目录里也看不出「这个工具不收参数」)。
  - `jsd://page` 资源的描述补一句「等价于 jsd_get_page」,避免两条通路被当成两件事。
  
  守门:`__tests__/drift-hook.test.ts` 新增一条不测「漂移能不能查出来」,而测「这条路真的走通了」—— 断言 `jsd_get_page` 已注册,且删节点后复核确实读了一次 `get_page`。

- [`69d6431`](https://github.com/wzrove/text-to-design/commit/69d64316b52c7247284de4d5b353530948c8c43a) - feat(mcp): 配方经 MCP resource 暴露 + 创作纪律改写为「结构分层、调用分批」
  
  配方原先只走 prompt 与 `mcp.instructions` 两条通路,对模型都不够用:`mcp.instructions` 实测被多数宿主读完即弃(不进上下文),MCP prompt 只落成用户侧的斜杠命令;工具描述里那句「完整配方见 prompt `chart-by-code`」对模型是个**不可执行**的指针。补上 resource 这一层才算闭环 —— 宿主把 `ListMcpResources` / `ReadMcpResource` 当普通工具给模型,资源本体按需读取、不占常驻上下文。
  
  - 新增只读资源 `jsd://recipes`(索引:每条配方的「何时用」与参数)与 `jsd://recipes/{id}`(正文),共 10 条,与既有 prompt 一一对应。正文**只在** `tools/prompts.ts` 的 render 函数里写一份,`tools/recipe-catalog.ts` 只承载「何时用 / 参数占位」这类资源层元数据,不复制正文。
  - 配方资源**不依赖插件连接**(插件离线时仍可读),与画布状态资源(jsd://page 等)分工不同。
  - `jsd_create_svg` 的描述从硬编码字符串收进 i18n 键 `createSvg.description`,并把图表路由改成可执行的资源指针 `jsd://recipes/chart-by-code`。
  - 创作纪律同步改口径:**层级要建够**(屏 → 语义分区 → 卡片 → 卡内图元), `children` 只用于「容器 + 其直属子节点」这类小结构,分层分批走 `jsd_batch` + `jsd_reparent_nodes`;并明确「元素不许直挂屏根」「name 必传且语义化」。落点三处同源:`mcp.instructions`、`jsd_batch` 描述、9 个 per-type create 工具描述,以及 `design-strategy` / `chart-by-code` 两条配方正文。
  - 死路指针一并清掉:工具描述不再写「见 prompt `chart-by-code`」,改指向资源 URI —— 旧写法模型够不着,会退化成临场拼工具。
  
  守门:`__tests__/recipe-resource.test.ts` 断言①目录与 prompt 注册表一一对应(漂开则模型读到不存在的配方,静默失效);②工具描述里的指针是可执行的资源 URI;③配方资源不读画布(否则插件离线时通路上一起废掉)。

## 0.9.0

### Minor Changes

- [`5369b80`](https://github.com/wzrove/text-to-design/commit/5369b806a98c372e027af6a443adf831bdcd211d) - feat(shared): 平台事实收敛为声明表,写路径补齐布局回读与适用性判定

- [`a3a0966`](https://github.com/wzrove/text-to-design/commit/a3a09664d8bf1a05fdfcc17fb00d9c61334752d9) - feat(mcp): 装配一次跨请求复用 + 声明面补齐 + 配方按平台分流

### Patch Changes

- [`927c618`](https://github.com/wzrove/text-to-design/commit/927c618b7037b3dfc21611e65fe769b82180049d) - 能力字典改为规格表:每条能力一条记录(带 `kind`),文案键收进表里。删掉两份无人消费的中文 label 表与 `ui/src/i18n/capabilityKeys.ts`,面板能力表少一行(不再展示 `platformOps` 能力位 —— 同回包里的 op 名单已经表达了这件事)。
  
  判定行为不变:`inPlaceVariants` 的策略顺序、字段门控结果与 warnings 文案均未改;`textTruncation` / `maxLines` 的类型判定改走 `dicts/prop-applicability.ts` 的同一张适用性表(行为等价)。
  
  **mcp 侧必须一起发版**:MCP 的 `dist` 会把 shared 的源码打包进去,能力枚举就在里面。线格式枚举(`hostCapabilitySchema`)与取值表**同宽**,明确不作跨版本容忍 —— 退役的 `platformOps` 位在两边都是非法值,**插件与 MCP 要同步升级/重载**(不同步时旧插件发来的 `capabilities` 过不了 `pingResultSchema`,`jsd_ping` 会回 `isError` 且**没有** `structuredContent` —— 症状是整个 ping 工具坏掉,不是少显示一行)。见 0029。

## 0.8.3

### Patch Changes

- [#31](https://github.com/wzrove/text-to-design/pull/31) [`b467b29`](https://github.com/wzrove/text-to-design/commit/b467b296206704a0329d6e37db47f70ad3653740) Thanks [@wzrove](https://github.com/wzrove)! - feat: add mastergo

## 0.8.2

### Patch Changes

- [`e40cb9d`](https://github.com/wzrove/text-to-design/commit/e40cb9def43f18689d2c34b83a7372ad59606875) Thanks [@wzrove](https://github.com/wzrove)! - Merge branch 'main' of github.com:wzrove/text-to-design

## 0.8.1

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

## 0.8.0

### Minor Changes

- [`5d84644`](https://github.com/wzrove/text-to-design/commit/5d84644f9ee219c82108206f3582d8dd956cc4fb) - feat: 平台能力表全面打通(字典真源 → core 判定 → MCP → 面板)

  - shared: 新增 `dicts/capability.ts` 作为能力唯一真源(取值 + 中文标签 + 能力门控的属性表),`dicts/node-type.ts` 增加读路径全表(`OBSERVED_NODE_TYPES`,含 Figma 独有的 20 类只读类型);capabilities 与 node type 的 zod 枚举改为从字典派生。core 的「字段是否生效」判定不再手写 `PLATFORM_SUPERSET_PROPS`,而是吃注入的能力表(优先级:能力表否决 → 运行时属性探测),创建路径同样点名跳过的门控字段。
  - mcp-server: daemon 新增平台状态缓存(插件上线自动探测、断开清空、失败 fail-open),`jsd_ping` 增加 `platformOps` 名单回传;新增只读资源 `jsd://platform/state`;工具支持 `platforms`/`platformNote` 声明,平台不适用时直接拦截并给出替代路径(`jsd_platform_op` 标注为仅 Figma)。
  - ui: 面板新增可折叠「能力」区块(核心能力 / 平台差异能力 / 平台特有 op 名单),数据经既有 ping 通路获取;两平台编译期契约断言补全(NodeSkeleton 成员存在性、Figma 独有类型登记、jsDesign 超集缺席)。
  - 修复: 读路径遇到 Figma 独有节点类型(如 SECTION)会让 `jsd_get_selection` / `jsd_get_page` 整条结果校验失败;`ungroup` 在 Figma 上因调用不存在的节点级方法而静默 no-op。
  - 文档: 修正 README 中「只读资源随连接门控隐藏」的过时描述(实际是目录恒定、离线调用快速失败)。

### Patch Changes

- [`0df225e`](https://github.com/wzrove/text-to-design/commit/0df225e694aab89dc8172951f1129a15edc32b58) Thanks [@wzrove](https://github.com/wzrove)! - feat: implement prop applicability dictionary and refactor property assignment logic

## 0.7.0

### Minor Changes

- [`29a0ab7`](https://github.com/wzrove/text-to-design/commit/29a0ab7963269edc6f78b30c1cb7f3866a392fcb) Thanks [@wzrove](https://github.com/wzrove)! - feat: split giant op-dispatch tools into single-purpose tools (jsd*set*\* / jsd_delete_node / jsd_reparent_nodes / jsd_create_component etc.), keep jsd_manage_nodes / jsd_manage_components / jsd_update_node as aggregate entries

### Patch Changes

- [`309b40b`](https://github.com/wzrove/text-to-design/commit/309b40b1598b7ab792c09bc7c4af6432de597d94) Thanks [@wzrove](https://github.com/wzrove)! - fix: 平台缺陷兜底 —— batch 步骤回显摘要裁剪(丢 vectorPaths 等大字段,超预算降级为 id 清单,占位符解析不受影响)、reparent 同时返回 moved 与 updated 并补全各 op 返回键速查、combine_as_variants 全败时返回可执行出口(改用「族名 / 状态」多主件,保留引擎原文供上报)、含结构变更的批次自动复核同层几何漂移(结果 warnings,checkDrift=false 可关)、recursive 不再改目标节点自身(叶子除外),连自身改需显式 includeSelf 且结果带 warnings 点名;并修正文档:reparent 跨父级移动保持绝对位置(内部换算),不再写「需手动修正 x/y」

## 0.6.1

### Patch Changes

- [`cffe325`](https://github.com/wzrove/text-to-design/commit/cffe3253a2f4352632e090e8ce4ed840cfa366f7) Thanks [@wzrove](https://github.com/wzrove)! - feat: enhance error handling and warnings for component operations and updates
- fix: 修掉 `jsd_get_selection` 等工具的 `Structured content does not match the tool's output schema` 报错

  - 根因:MCP SDK 固定按 draft-2020-12 生成 JSON Schema,`z.tuple` 会编译成 `{prefixItems:[...], items:false}`;而客户端
    `AjvJsonSchemaValidator` 用的是 **classic draft-07 Ajv**,不认 `prefixItems`,把 `items:false` 当「数组必须为空」,
    于是所有带渐变填充(GRADIENT_LINEAR/RADIAL/ANGULAR)的节点在校验 `gradientTransform` 时必然失败。
  - shared:`transformSchema` 由 `z.tuple([z.tuple(x3), z.tuple(x3)])` 改为 `z.array(z.array(z.number()).length(3)).length(2)`,
    只产出 minItems/maxItems,两个 draft 下语义一致。运行时校验强度不变。
  - 影响面:修复前 12 个工具的 inputSchema、48 个 outputSchema 含 draft-07 无法解析的关键字(共 53 个工具)。
  - 新增 `scripts/check-schema-draft07.mjs` 作为回归守卫:扫描全部工具的 input/output schema,
    发现 `prefixItems`/`items:false` 等 draft-2020-12 专有关键字即报错退出。

## 0.6.0

### Minor Changes

- [`c3f4c93`](https://github.com/wzrove/text-to-design/commit/c3f4c93574e5cdddf1933ec6ea27e5bc00a20417) Thanks [@wzrove](https://github.com/wzrove)! - feat: 新增 jsd*batch 批量编排工具 —— 一次请求顺序执行多个 jsd*\* 步骤,前步结果经双花括号占位符(步骤 id.字段路径)注入后步参数,中间 id 不回传模型;registry 抽出 ToolExecutor 供 MCP 回调与编排共用

### Patch Changes

- [`85e54d9`](https://github.com/wzrove/text-to-design/commit/85e54d9055565dfac810e05650186af3a40e09ca) Thanks [@wzrove](https://github.com/wzrove)! - feat: enhance design host interface and add local styles retrieval

- [`a476b01`](https://github.com/wzrove/text-to-design/commit/a476b018d54fba6bfcb2a4e6e932a88c2cd6118d) Thanks [@wzrove](https://github.com/wzrove)! - fix: 改写 jsd_batch 相关文案(工具描述/instructions/prompt/错误信息/changelog)中的占位符示例 —— 不再出现字面双花括号写法,避免宿主将其误解析为提示词变量而报 malformed reference

- [`85e54d9`](https://github.com/wzrove/text-to-design/commit/85e54d9055565dfac810e05650186af3a40e09ca) Thanks [@wzrove](https://github.com/wzrove)! - fix: 修掉 jsDesign 引擎侧 set_fills/set_effects 校验失败

  - shared: Paint/颜色/效果 schema 全面收紧 —— rgb/rgba/paint/effect 加 strict(多出的键直接报错而非静默剥离)、SOLID 的 blendMode 改用枚举、children 从 z.any 改为 z.lazy 递归校验节点树(嵌套坏 fills 在 MCP 层即被拦);
  - shared: 新增引擎赋值前归一化(buildNode/update 接入):0-255 色值自动转 0-1、SOLID color.a 移到 paint 级 opacity、阴影缺 blendMode/visible 补默认值、fills/effects 非数组容器报中文错、booleanOperation 白名单校验、vectorPaths 缺省 windingRule;
  - mcp: jsd_batch 直调 executor 补 inputSchema 校验,内层工具坏参数不再穿透到引擎;
  - ui: 插件错误日志带堆栈与请求摘要,便于定位 "not a function";
  - shared: clone 未命中节点报错附请求 ids 与 jsd_find 提示

- [`85e54d9`](https://github.com/wzrove/text-to-design/commit/85e54d9055565dfac810e05650186af3a40e09ca) Thanks [@wzrove](https://github.com/wzrove)! - feat: 实例覆盖复制/套用工具——

  - jsd_manage_components 新增 op: copy_overrides(复制源实例的变体/组件属性/可见样式文本为快照并缓存,返回 snapshotId=源实例 id)、apply_overrides(按快照批量套用,可 swapToSource,缓存 miss 报错需先 copy)、sync_overrides(无状态一次性复制+套用,适合 jsd_batch)
  - componentProperties 仅 Figma 生效;jsDesign 自动降级为变体属性+可见样式;套用结果逐条 applied[] 含失败点名
  - variant-sync 配方改为优先 sync_overrides / copy+apply,手工 jsd_update_node 降级兜底

- [`85e54d9`](https://github.com/wzrove/text-to-design/commit/85e54d9055565dfac810e05650186af3a40e09ca) Thanks [@wzrove](https://github.com/wzrove)! - feat: 页面结构总览——

  - 新增 jsd://page 只读资源:当前页顶层节点的轻量摘要(id/name/type/x/y/width/height/childCount,不递归子节点,失效节点给最小壳不扑灭),从头设计整页前先读它了解页面已有内容

- [`85e54d9`](https://github.com/wzrove/text-to-design/commit/85e54d9055565dfac810e05650186af3a40e09ca) Thanks [@wzrove](https://github.com/wzrove)! - fix: 面板日志与服务端全量对齐 —— 级别门槛只约束落盘,推送不再按级别过滤(debug 也可见);
  插件离线期间日志进 200 条环形缓冲,上线后按入队顺序回放;日志推送改走无日志发送通道,
  修掉「重入守卫」误吞「工具可用性同步 / 插件断开」等嵌套日志的问题

- [`85e54d9`](https://github.com/wzrove/text-to-design/commit/85e54d9055565dfac810e05650186af3a40e09ca) Thanks [@wzrove](https://github.com/wzrove)! - feat: 提示词与描述层优化(移植参考实现的策略资产)——

  - 新增策略类 prompt: design-strategy(设计策略总纲,含登录页示例结构树)、text-replace-strategy(文本批量替换: clone 留底 → 语义分块 → 逐块导小图复核)、variant-sync(同类实例样式批量同步);策略类以 assistant 身份下发,配方式保持 user
  - jsd_update_node / jsd_export 多 id 结果逐条点名「请求了但没更新/没导出」的节点(引擎静默跳过失效 id 时不再无感知)
  - jsd_platform_op 描述加 CRITICAL 守卫: 先取 jsd_ping 的 capabilities 再定 op/参数,不凭空猜测
  - jsd_create_nodes 描述指向 design-strategy(整页/整屏先取纪律再动手)

- [`85e54d9`](https://github.com/wzrove/text-to-design/commit/85e54d9055565dfac810e05650186af3a40e09ca) Thanks [@wzrove](https://github.com/wzrove)! - feat: 样式清单与选中滚动——

  - 新增 jsd://styles 只读资源(本地样式枚举:PAINT/TEXT/EFFECT/GRID,含 id/name/type),按名应用样式前可先读准确样式名;跨平台(jsDesign/Figma API 同构)
  - jsd_manage_nodes op=select 现在会滚动视口到选中节点(对齐参考实现的 set_selections/set_focus)

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

## 0.3.1

### Patch Changes

- [`6a56d6c`](https://github.com/wzrove/text-to-design/commit/6a56d6cfbde373e6018d43e3b0f8991a9c071e8a) Thanks [@wzrove](https://github.com/wzrove)! - fix: 去掉发布包中的 workspace:\* 依赖

## 0.3.0

### Minor Changes

- [`7bb67e4`](https://github.com/wzrove/text-to-design/commit/7bb67e4f6394920aeed3bd0c3ef53f3a23679035) Thanks [@wzrove](https://github.com/wzrove)! - feat: icon 别名 + npx 安装指南

## 0.2.0

### Minor Changes

- [`6ed97a6`](https://github.com/wzrove/text-to-design/commit/6ed97a68b79014e81677110a81060eecdd48e45d) Thanks [@wzrove](https://github.com/wzrove)! - 新增组件/变体操作与 SVG 原生导入

## 0.1.1

### Patch Changes

- [`f96b00f`](https://github.com/wzrove/text-to-desgin/commit/f96b00fb37d8a683297b78957ceb67d4d3e858e6) Thanks [@wzrove](https://github.com/wzrove)! - docs: 重写 README 安装说明,覆盖 npm/pnpm/yarn 三种包管理器

## 0.1.0

### Minor Changes

- [`47e502c`](https://github.com/wzrove/text-to-desgin/commit/47e502cb24059cf79c1bbbcae9f8189b0df657db) Thanks [@wzrove](https://github.com/wzrove)! - 首次发布到 npm
