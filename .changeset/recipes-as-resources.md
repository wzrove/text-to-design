---
"text-to-design-mcp": minor
---

feat(mcp): 配方经 MCP resource 暴露 + 创作纪律改写为「结构分层、调用分批」

配方原先只走 prompt 与 `mcp.instructions` 两条通路,对模型都不够用:`mcp.instructions` 实测被多数宿主读完即弃(不进上下文),MCP prompt 只落成用户侧的斜杠命令;工具描述里那句「完整配方见 prompt `chart-by-code`」对模型是个**不可执行**的指针。补上 resource 这一层才算闭环 —— 宿主把 `ListMcpResources` / `ReadMcpResource` 当普通工具给模型,资源本体按需读取、不占常驻上下文。

- 新增只读资源 `jsd://recipes`(索引:每条配方的「何时用」与参数)与 `jsd://recipes/{id}`(正文),共 10 条,与既有 prompt 一一对应。正文**只在** `tools/prompts.ts` 的 render 函数里写一份,`tools/recipe-catalog.ts` 只承载「何时用 / 参数占位」这类资源层元数据,不复制正文。
- 配方资源**不依赖插件连接**(插件离线时仍可读),与画布状态资源(jsd://page 等)分工不同。
- `jsd_create_svg` 的描述从硬编码字符串收进 i18n 键 `createSvg.description`,并把图表路由改成可执行的资源指针 `jsd://recipes/chart-by-code`。
- 创作纪律同步改口径:**层级要建够**(屏 → 语义分区 → 卡片 → 卡内图元), `children` 只用于「容器 + 其直属子节点」这类小结构,分层分批走 `jsd_batch` + `jsd_reparent_nodes`;并明确「元素不许直挂屏根」「name 必传且语义化」。落点三处同源:`mcp.instructions`、`jsd_batch` 描述、9 个 per-type create 工具描述,以及 `design-strategy` / `chart-by-code` 两条配方正文。
- 死路指针一并清掉:工具描述不再写「见 prompt `chart-by-code`」,改指向资源 URI —— 旧写法模型够不着,会退化成临场拼工具。

守门:`__tests__/recipe-resource.test.ts` 断言①目录与 prompt 注册表一一对应(漂开则模型读到不存在的配方,静默失效);②工具描述里的指针是可执行的资源 URI;③配方资源不读画布(否则插件离线时通路上一起废掉)。
