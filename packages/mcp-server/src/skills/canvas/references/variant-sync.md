---
title: "同类实例同步"
when: "当需要让同类实例继承全局修改或向选定实例套用样板覆盖时读取；区分改主件、复制覆盖与显式换绑。"
args: "可选 sourceId(样板实例 id)、targetType(目标节点类型过滤)"
---
# 同类实例同步

默认精简档把本配方的绘制与编辑操作放入 `jsd_batch`，工具名填 `calls[].tool`；用 `jsd_describe_tools` 的 names 查步骤参数。

用于统一一组实例的样式、文案或组件属性。先判断修改应影响哪些实例。通用失败处置与视觉验收按主技能「执行闭环」。

## 选择源头

- 同一主件的全部实例都要继承：修改主 COMPONENT 的相应子层，避免逐实例覆盖。
- 仅选定实例套用样板：用 `jsd_find` / `jsd_get_selection` 读源 INSTANCE 与目标列表，用覆盖同步。不要为补齐数量自动新增用户未要求的实例。
- 仅一个字段需统一：优先专责工具或 `jsd_set_instance_properties`，避免复制整套覆盖改变其他内容。

## 复制覆盖

1. 确认源为 INSTANCE，核对目标实例与主件关系。
2. 一次套用用 `jsd_sync_overrides({sourceId:源实例id, ids:目标ids})`。
3. 需复用快照时，先 `jsd_copy_overrides({sourceId:源实例id})`，再把返回 snapshotId 作为 `jsd_apply_overrides` 的 sourceId。
4. 检查 applied 中每项 ok/message 与 warnings；部分成功时仅处理失败项。

默认 `swapToSource:false` 保持目标组件身份，**跳过变体属性**。只有任务要求换绑源组件或变体时才显式设 true；换绑会丢弃既有覆盖，先确认所选目标与任务一致。不要为消除“跳过变体”警告擅自开启。

同步只覆盖工具支持的属性，不能假定复制了任意深度全部子层。平台不支持时按具体字段选择可用写入口；实例内部覆盖不渲染时，按全局或局部意图决定改主件或其他方式。

## 特有错误与验收

- `applied[].ok === false` 或 warnings 报失败：按 message 与 id 只补失败项，不重放整组同步；“跳过变体”属预期警告，不是失败。
- snapshotId 失效、sourceId 非 INSTANCE、目标类型不符：先用 `jsd_find` 核对身份再重建快照，不用相似名称猜目标。
- 独立回读关键属性与实际子层内容；抽查有代表性的目标用 `jsd_export` 检查换行、显隐、间距与尺寸。报告跳过的变体、失败项与尚未验证项。
