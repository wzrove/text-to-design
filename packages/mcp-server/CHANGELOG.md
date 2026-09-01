# text-to-design-mcp

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
