---
"text-to-design-mcp": minor
"text-to-design-shared": minor
---

feat: 新增 jsd_batch 批量编排工具 —— 一次请求顺序执行多个 jsd_* 步骤,前步结果经双花括号占位符(步骤id.字段路径)注入后步参数,中间 id 不回传模型;registry 抽出 ToolExecutor 供 MCP 回调与编排共用
