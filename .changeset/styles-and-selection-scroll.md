---
"text-to-design-mcp": patch
---

feat: 样式清单与选中滚动——

- 新增 jsd://styles 只读资源(本地样式枚举:PAINT/TEXT/EFFECT/GRID,含 id/name/type),按名应用样式前可先读准确样式名;跨平台(jsDesign/Figma API 同构)
- jsd_manage_nodes op=select 现在会滚动视口到选中节点(对齐参考实现的 set_selections/set_focus)
