# text-to-design-shared

## 0.1.0

### Minor Changes

- [`c3f4c93`](https://github.com/wzrove/text-to-design/commit/c3f4c93574e5cdddf1933ec6ea27e5bc00a20417) Thanks [@wzrove](https://github.com/wzrove)! - feat: 新增 jsd*batch 批量编排工具 —— 一次请求顺序执行多个 jsd*\* 步骤,前步结果经双花括号占位符(步骤 id.字段路径)注入后步参数,中间 id 不回传模型;registry 抽出 ToolExecutor 供 MCP 回调与编排共用

### Patch Changes

- [`a476b01`](https://github.com/wzrove/text-to-design/commit/a476b018d54fba6bfcb2a4e6e932a88c2cd6118d) Thanks [@wzrove](https://github.com/wzrove)! - fix: 改写 jsd_batch 相关文案(工具描述/instructions/prompt/错误信息/changelog)中的占位符示例 —— 不再出现字面双花括号写法,避免宿主将其误解析为提示词变量而报 malformed reference

## 0.0.1

### Patch Changes

- feat: 类型对齐 plugin-typings, GROUP/FRAME 支持 auto-layout, 新增 find by id 与 update_node 工具

  - 重构 ExecuteOp/SerializedNode 字段名对齐 runtime NodeType (op→type, w/h→width/height 等)
  - 统一 Paint/Effect/LayoutGrid 类型, 消除 SerializedStroke/SerializedGradient
  - GROUP 内部用 Frame 实现, 支持 auto-layout (layoutMode/itemSpacing/padding\*)
  - jsd_find 新增 ids 字段按 id 精确查找
  - 重命名 jsd_update_selection → jsd_update_node
  - jsd_manage_nodes group 支持 auto-layout 参数
  - effect blendMode 默认值 'NORMAL', 修复运行时校验错误
  - 提取共享 schema (transform/stroke/corner/text/autoLayout/visual)
