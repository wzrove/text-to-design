---
"text-to-design-mcp": patch
---

feat: 提示词与描述层优化(移植参考实现的策略资产)——

- 新增策略类 prompt: design-strategy(设计策略总纲,含登录页示例结构树)、text-replace-strategy(文本批量替换: clone 留底 → 语义分块 → 逐块导小图复核)、variant-sync(同类实例样式批量同步);策略类以 assistant 身份下发,配方式保持 user
- jsd_update_node / jsd_export 多 id 结果逐条点名「请求了但没更新/没导出」的节点(引擎静默跳过失效 id 时不再无感知)
- jsd_platform_op 描述加 CRITICAL 守卫: 先取 jsd_ping 的 capabilities 再定 op/参数,不凭空猜测
- jsd_create_nodes 描述指向 design-strategy(整页/整屏先取纪律再动手)
