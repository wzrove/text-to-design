---
title: "脚本化批量调用"
when: "当需要编排多步依赖或批量改造多块画布内容时读取；覆盖 ids 批改、batch 引用、50 步上限、文件清单与失败后回读。"
args: "参数 task(要完成的任务,留空只返回脚本化调用纪律)"
role: assistant
---
# 多步与批量编排

精简档中的低频操作先通过 `jsd_describe_tools` 查询 schema，再作为 batch 步骤执行；兼容档也可直接调用。batch 只能使用当前服务登记的能力，不能绕过平台能力检查。

同值属性批改先用单工具 ids；不同字段、不同值或有依赖的多步操作用 `jsd_batch`。画布 MCP 请求串行执行，插件单线程排队会消耗转发超时预算。

## 先读、定范围、再执行

1. `jsd_get_page` 看顶层与资源，按屏或分区 find 读相关子树。仅在平台支持文档范围读取时跨页，不把当前页结果称为整档结果。
2. 确认目标类型与现状形态，例如多层填充、渐变、实例、已绑变量等。更改一个槽位不应抹掉其余内容。
3. 按语义块列步骤，检查目标 id、参数形态、前后依赖与输出键。单批最多 50 步；callsFile 与内联 calls 共用上限。按分区切批，给修复留余量。
4. 串行执行，检查每步成功状态、failed/applied 明细及 warnings。批量不是事务，失败前的写入可能保留；只恢复或补做未完成部分。

## 结果引用

占位符只在同一次 batch 内有效。下批使用上批返回的真实 id，不能沿用旧步骤名。

| 结果类型 | 示例 |
| --- | --- |
| per-type create、clone、create_instance、detach_instance 的数组 | `{{create.created[0].id}}` |
| create_svg、create_icon、group、create_component 的单对象 | `{{icon.created.id}}` |
| 属性更新数组 | `{{edit.updated[0].id}}` |
| find 节点数组 | `{{find.nodes[0].id}}` |
| selection 节点数组 | `{{selection.selection[0].id}}` |
| selected、removed 等字符串数组 | `{{select.selected[0]}}` |
| platform_op 返回 | 直接按该 op 的返回结构取值，没有额外 .data 层 |

已有资源可用 `{{@comp:名称}}` / `{{@var:名称}}`。名称照 get_page 清单原样；即时设计可能只保留组件叶子名。零命中或重名会中止，不取相似项猜测。新建资源仍用本批步骤结果。

示例：两个已有文本节点写不同文案；id 从先前查询取得，替换示例值后执行。

```json
{
  "calls": [
    {"id":"title","tool":"jsd_set_text","args":{"ids":["12:1"],"characters":"账户设置"}},
    {"id":"hint","tool":"jsd_set_text","args":{"ids":["12:2"],"characters":"管理登录方式"}}
  ]
}
```

## 大清单与回读

- 参数体过大且能写本地文件时，落盘 JSON：`{"calls":[...]}` 或步骤数组，传绝对路径 callsFile。文件必须能被 MCP 服务进程读取；不要假设远程宿主与服务共用文件系统。
- 同文件可走 `text-to-design-mcp exec <calls.json> --json`；`--dry-run` 仅校验清单，不能证明节点仍在、平台可执行或视觉正确。
- 不连 daemon 内部端口，不 import 仓库内部模块绕过工具契约。
- batch 回显会裁剪 children、characters、fills、样式与路径等字段；需要核实的内容单独 find。过大的完整结果按回包 path/line 读落盘明细，不把整树塞进上下文。
- 结构变更的漂移检测默认开启；warnings 若报告兄弟节点漂移，按给出的原值恢复。不要为消掉警告关闭检测。
- SVG 导入可能耗时较长，单独调用 create_svg，成功后再编排装配。含图标或矢量的改动另导出目检。

## 失败处置

- 字段不支持、名字歧义、占位符错误：修正参数或策略，原样重试无效。
- 写入超时或连接中断：先回读。创建或复制须先查是否已存在，避免重放产生重复节点。
- 即时设计缺少文档范围读取能力时，不以 scope=document 绕过；异步 getter 符号存在也不等于可用。
- 目标失效先 find；repair 可能清除损坏节点，确认影响范围后再用。

收尾只读关键字段与受影响块，导出视觉变化区域；报告成功范围、失败步骤与尚未验证项。
