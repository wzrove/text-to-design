# text-to-design-ui

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
