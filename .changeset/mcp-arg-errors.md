---
"text-to-design-mcp": patch
---

fix(mcp): 参数校验报错补归属与归一化,减少无效重试

create 工具注入 fieldOwnership:越界字段全部属于另一 create 工具时点名该工具;
jsd_export 接受单数 id 并在校验前归一化为 ids;ids 数组空位收成一条顶层 issue 并给出
成因(用 superRefine 而非 transform,保住 toJSONSchema);arcData.innerRadius 描述明确
必填;图标别名归一化后二次查表、目标缺失继续走模糊层,未知图标报错带图标库规模与
lucide-static 版本;取消错误区分「尚未发出」并带已耗时。
