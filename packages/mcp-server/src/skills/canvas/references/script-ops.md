---
title: "多步与批量编排"
when: "当需要编排多步依赖或批量改造多块画布内容时读取；覆盖 ids 批改、batch 引用、50 步上限、文件清单与失败后回读。"
args: "可选 task(要完成的任务，留空只返回脚本化调用纪律)"
---
# 多步与批量编排

默认精简档的画布写入统一走 `jsd_batch`，单项操作也提交一个步骤。已知名称就用 `jsd_describe_tools({names:[工具名]})` 取 schema，每次最多 3 个；名称未知才先按 group/query 搜索。步骤写成 `{id, tool, args}`。兼容档的独立单步也可直接调用。通用失败处置与视觉验收按主技能「执行闭环」。

同值属性批改在一个步骤里合并 ids，不同字段或取值按组拆步骤。有依赖的步骤尽量留在同一批。画布 MCP 请求串行执行，插件单线程排队会消耗转发超时预算。

## 先读、定范围、再执行

1. `jsd_get_page` 看顶层与资源，按屏或分区用 `jsd_find` 读相关子树。仅在平台支持文档范围读取时跨页，不把当前页结果称为整档结果。
2. 确认目标类型与现状形态，例如多层填充、渐变、实例、已绑变量等。更改一个槽位不应抹掉其余内容。
3. 按语义块列步骤，检查目标 id、参数形态、前后依赖与输出键。单批最多 50 步；callsFile 与内联 calls 共用上限。按分区切批，给修复留余量。
4. 串行执行，检查每步成功状态、failed/applied 明细及 warnings。`jsd_batch` 不是事务，失败前的写入可能保留；只恢复或补做未完成部分。

## 结果引用

占位符只在同一次 `jsd_batch` 内有效。下批使用上批返回的真实 id，不能沿用旧步骤名。

| 结果类型 | 示例 |
| --- | --- |
| per-type create、clone、`jsd_create_instance`、detach_instance 的数组 | `{{create.created[0].id}}` |
| `jsd_create_svg`、`jsd_create_icon`、group、`jsd_create_component` 的单对象 | `{{icon.created.id}}` |
| 属性更新数组 | `{{edit.updated[0].id}}` |
| `jsd_find` 节点数组 | `{{find.nodes[0].id}}` |
| selection 节点数组 | `{{selection.selection[0].id}}` |
| selected、removed 等字符串数组 | `{{select.selected[0]}}` |
| `jsd_platform_op` 返回 | 直接按该 op 的返回结构取值，没有额外 .data 层 |

已有资源可用 `{{@comp:名称}}` / `{{@var:名称}}`。名称照 `jsd_get_page` 清单原样；即时设计可能只保留组件叶子名。零命中或重名会中止，不取相似项猜测。新建资源仍用本批步骤结果。

示例批次先建容器和文字，再用两步返回的真实 id 归组。按 names 查三个步骤的 schema，把下面的 JSON 保存为批次清单。

```json
{
  "calls": [
    {"id":"card","tool":"jsd_create_frame","args":{"name":"账户设置卡片","width":320,"height":120}},
    {"id":"title","tool":"jsd_create_text","args":{"name":"卡片标题","characters":"账户设置"}},
    {"id":"nest","tool":"jsd_reparent_nodes","args":{"ids":["{{title.created[0].id}}"],"parentId":"{{card.created[0].id}}"}}
  ]
}
```

文件写入后，把实际绝对路径传给 `jsd_batch` 的 `callsFile`，例如 `{"callsFile":"D:/workspace/canvas-batch.json"}`。服务读不到文件时，可把同一 JSON 对象作为内联参数提交。

## 文件清单与回读

- 能写文件且 MCP 服务可读时，优先用 `callsFile`，单步也可用。文件接受 `{"calls":[...]}` 或步骤数组。宿主无法写文件，或服务无法访问该路径时，用内联 `calls`。每次只传其中一种。
- 同文件可走 `text-to-design-mcp exec <calls.json> --json`；`--dry-run` 仅校验清单，不能证明节点仍在、平台可执行或视觉正确。
- 不连 daemon 内部端口，不 import 仓库内部模块绕过工具契约。
- `jsd_batch` 回显会裁剪 children、characters、fills、样式与路径等字段；需要核实的内容单独 `jsd_find`。过大的完整结果按回包 path/line 读落盘明细，不把整树塞进上下文。
- 结构变更的漂移检测默认开启；warnings 若报告兄弟节点漂移，按给出的原值恢复。不要为消掉警告关闭检测。
- SVG 导入可能耗时较长，单独提交一个 `jsd_create_svg` 步骤的批次，成功后用真实 id 编排装配。含图标或矢量的改动另用 `jsd_export` 目检。

## 批量特有失败处置

- 字段不支持、名字歧义、占位符错误：修正参数或策略；原样重试无效。通用错误分级见主技能「错误处置」。
- 写入超时或连接中断：先 `jsd_find` 回读。`jsd_create_*`、克隆或复制须先查是否已存在，避免重放产生重复节点。
- 即时设计缺少文档范围读取能力时，不以 scope=document 绕过；异步 getter 符号存在也不等于可用。
- 目标失效先 `jsd_find`；`jsd_repair_nodes` 可能清除损坏节点，确认影响范围后再用。
- 收尾只读关键字段与受影响块，用 `jsd_export` 检查视觉变化区域；报告成功范围、失败步骤与尚未验证项。
