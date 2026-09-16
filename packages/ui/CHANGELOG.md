# text-to-design-ui

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
