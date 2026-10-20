---
"text-to-design-mcp": patch
"text-to-design-ui": patch
---

fix(jsdesign): 主组件读取改按平台声明选路 —— 新增 flow 能力位 `mainComponentSync`（即时设计声明），`resolveMainComponent` 不再 `?.` 探测 `getMainComponentAsync`。真机 2026-10-19：该符号在即时设计运行时存在但**永不 settle**，`jsd_copy_overrides`（只读快照、不写属性）25109ms 超时、`jsd_set_instance_properties` 同样超时；`detachInstanceNodes` / `copyInstanceOverrides` / `applyOverrides` 三个入口一并接上 `RuntimeContext`
