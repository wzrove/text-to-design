---
"text-to-design-mcp": patch
---

feat: 实例覆盖复制/套用工具——

- jsd_manage_components 新增 op: copy_overrides(复制源实例的变体/组件属性/可见样式文本为快照并缓存,返回 snapshotId=源实例 id)、apply_overrides(按快照批量套用,可 swapToSource,缓存 miss 报错需先 copy)、sync_overrides(无状态一次性复制+套用,适合 jsd_batch)
- componentProperties 仅 Figma 生效;jsDesign 自动降级为变体属性+可见样式;套用结果逐条 applied[] 含失败点名
- variant-sync 配方改为优先 sync_overrides / copy+apply,手工 jsd_update_node 降级兜底
