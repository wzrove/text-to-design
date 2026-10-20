---
"text-to-design-ui": patch
---

feat(jsdesign): 新增只读平台 op `jsd_component_facts` —— 按官方文档(ComponentNode / InstanceNode / ComponentSetNode)回读契约里缺的字段：COMPONENT 的 `instanceCount`（影响面）、`key` / `remote` / `description` / `expanded`，INSTANCE 的 `scaleFactor` / `mainComponentId`，COMPONENT_SET 的 `defaultVariantId` / `variantGroupProperties` / `members`；可写 `description`（回读校验）。`getPublishStatusAsync` 单列为 `withPublishStatus`（真机已验：21ms 返回、不永挂，但对非团队库节点回的是错误串 `Failed to get node publish status` 而非 PublishStatus 三值 ⇒ 三值才认，其余落 `publishStatusError`）
