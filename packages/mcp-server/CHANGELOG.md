# text-to-design-mcp

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
