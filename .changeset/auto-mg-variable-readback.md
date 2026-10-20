---
"text-to-design-ui": patch
---

fix(mastergo): 变量删除回包加 `pending` 档 —— 单值类型的 `deleteVariable` 跨执行才生效，同执行内回读仍见不再报 failed；复合样式类型（PAINT 等）实测 no-op，改为动手前就拒并点名走 `jsd_delete_style`。`mg_variables_create` 回包的 `values` 降级为原样透传（引擎回包时有时无、STRING 任何读面都不带值），不再当验收判据
