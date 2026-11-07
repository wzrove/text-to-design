---
title: "变量绑定与批量套用"
when: "当需要创建或绑定语义变量、批量套用主题 token 时读取；按平台变量能力分流，区分解绑与删除。"
args: "参数 target(目标节点 id,留空用当前选中)"
role: assistant
---
# 变量绑定与主题 token

用于绑定已有变量、创建主题值或批量套用变量。先读当前平台能力，不把某个平台的缺省说明当跨平台事实。

## 选择入口

get_page 读取 assets.variables 与 assets.styles；平台未知时 jsd_ping，已知时可读 jsd://platform/state。每个 op 的参数与返回结构以 platformOps 描述为准。

| 平台 | 读写入口 |
| --- | --- |
| Figma | figma_variables_list/create/apply/remove；样式的变量关系用 figma_style_variables_list/apply |
| MasterGo | mg_list_variables、mg_variables_create/apply/remove；复合样式另查 assets.styles |
| 即时设计 | 当前无变量入口；颜色、排版等改用受支持的样式，间距与圆角用节点字段 |

只要固定视觉时优先复用样式；需要语义值随模式变化时再用变量。空列表也可能表示文档尚未建变量，是否支持看能力与 op 清单。

## 绑定流程

1. 读取准确变量 id、类型、集合与模式。缺少所需变量时才创建，记录返回 id；按平台支持类型选值。
2. 检查目标现状：填充是单个 SOLID、渐变还是多 paint，字段是否已绑定。只改指定槽位，保留其余内容。
3. 经 jsd_platform_op 调当前平台 apply。多组绑定用 bindings：一组为一个变量、一个槽位及一批 nodeIds，参数按该 op 描述。
4. 独立回读可用字段并导出受影响分区；不能仅凭创建或 apply 回显判定绑定渲染成功。

## 平台差异

- Figma 节点绑定可读 boundVariables，样式上的绑定需另读样式变量入口；组件属性 VARIABLE_ALIAS 写法见 [组件属性](component-property.md)。
- MasterGo 的 property/value 是配对的槽位词汇，不能照搬 Figma 字段；数组属性需 index。变量类型不含 VARIANT，SPACING 复用走平台支持的样式。
- MasterGo 无逐图层属性绑定的反读接口；集合使用关系不等于槽位证据。部分变量值读面不完整，STRING 等值缺失不能直接判写入失败，以导图确认实际效果。
- MasterGo 复合样式可能不在变量列表中；记录创建返回 id，结合 assets.styles 或支持的按 id 入口复核。pendingReadback 不应触发盲目重建。
- 无变量能力时报告替代结果，不声称已经建立主题或模式绑定。

解绑仅针对任务指定槽位；remove 删除变量影响所有引用，不把删除变量当作解绑步骤。
