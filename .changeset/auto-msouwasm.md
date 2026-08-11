---
"text-to-design-mcp": minor
"text-to-design-ui": minor
---

refactor: executeNodeSchema 按 type 拆分为 discriminatedUnion,增强 LLM 参数理解

- executeNodeSchema 从 50+ 字段平铺改为按 type 拆分的 discriminatedUnion,LLM 只需关注当前 type 相关字段
- letterSpacingSchema 支持 PERCENT 单位(对齐 plugin-api)
- blendModeSchema 移除引擎不存在的 LINEAR_BURN/LINEAR_DODGE
- 新增 superRefine 跨字段校验(layoutMode/placement/layoutGrid/children)
- 增强各字段 description(RGB 0-1 范围、SVG path 示例、gradientTransform 示例等)
- tool description 重构(jsd_execute 分段、manage_nodes/manage_components 分条)
