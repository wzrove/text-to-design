---
"text-to-design-mcp": patch
---

fix: 平台缺陷兜底 —— P22 batch 步骤回显摘要裁剪(丢 vectorPaths 等大字段,超预算降级为 id 清单,占位符解析不受影响)、P23 reparent 同时返回 moved 与 updated 并补全各 op 返回键速查、P24 combine_as_variants 全败时返回可执行出口(改用「族名 / 状态」多主件,保留引擎原文供上报)、P25-B 含结构变更的批次自动复核同层几何漂移(结果 warnings,checkDrift=false 可关)、P26 recursive 不再改目标节点自身(叶子除外),连自身改需显式 includeSelf 且结果带 warnings 点名;并修正 P25-A 文档:reparent 跨父级移动保持绝对位置(内部换算),不再写「需手动修正 x/y」
