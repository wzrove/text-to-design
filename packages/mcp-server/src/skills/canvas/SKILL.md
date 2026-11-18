---
name: canvas
agent_created: true
description: "当用户要求在即时设计、Figma 或 MasterGo 中创建或改造设计稿时使用：界面与整页、图表与看板、自动布局、组件与变体、批量改文案或样式、HTML 转设计稿、图标网格。也适用于“照这页配色画一张”“这些卡片改一处全部生效”等未点名工具的画布任务。仅检查连接、读取选中或导出现有节点无需加载；开发 MCP 服务代码、制作网页或独立图片不在此范围。"
---
# 画布设计与改造

用 text-to-design MCP 的 `jsd_*` 工具操作设计客户端。插件须在目标文档中运行。平台能力以 `jsd_ping` 或 `jsd://platform/state` 的 capabilities / platformOps 为准；未声明的入口不照搬其他平台。下文工具名、URI 与参数键均写完整注册名，不用缩写。

默认精简档直接提供连接、读取、节点引用、导出、配方和能力查询。绘制与编辑统一用 `jsd_batch`，单项操作也封装成一个步骤。本技能与附录里的创建、布局和编辑工具名填入 `calls[].tool`，参数填入 `calls[].args`。已知名称时用 `jsd_describe_tools` 的 names 查 schema（每次最多 3 个）；名称未知时先按 group/query 查。兼容档也优先批处理，独立单步可直接调用公开的专责工具。

## 加载前置（两条硬规则）

1. **读入口。** `jsd_ping` 先确认 `connected === true` 与 `platform`。优先按 `skills.nextStep` 用宿主的资源读取接口读 `skill://canvas/SKILL.md`（含「先定位任务」表）；老回包只有 `skills.count > 0` 时，先用资源列表接口确认 URI 可读再读正文。宿主读不到技能时，用 `GetPrompt` / `jsd_get_prompt` 读任一配方 prompt，或读 `skill://canvas/*`、`jsd://recipes/*` 资源正文。`skills.count` 是发布状态；列目录、只 ping、只读 `jsd://code`、凭经验知道附录都不算已读。`skills` 缺失、为 0 或 ping 失败时改读 `jsd://platform/state`。服务端按「本会话读过任一操作指引」放行；未读前所有写入持续返回 `skill_first_required`，不会二次放行。
2. **读附录。** 按「先定位任务」表匹配本次实际操作，读对应的 `skill://canvas/references/<id>.md` 或同一条配方 prompt / resource 正文；组合任务补读，新增一类操作再补读，不一次加载全部。表内相对链接与上列 URI 一一对应。

## 先定位任务

| 用户目标 | 读取 |
| --- | --- |
| 新建界面、整页或重做结构 | [设计策略](references/design-strategy.md) + [自动布局](references/auto-layout.md) |
| 调整行列、间距、对齐或伸缩，将已有稿转为自动布局 | [自动布局](references/auto-layout.md) |
| 从数据画图表、看板中的绘图区 | [代码画图表](references/chart-by-code.md) |
| 抽组件、构建状态或变体集 | [变体集](references/variant-set.md) |
| 定义组件属性、修改实例属性 | [组件属性](references/component-property.md) |
| 统一同类实例的样式或文案 | [实例同步](references/variant-sync.md) |
| 绑定变量、统一主题 token | [变量绑定](references/variable-binding.md) |
| 首次使用批处理、多步流程、整页或多块批量改造 | [批量编排](references/script-ops.md) |
| 批量改文案 | [文本替换](references/text-replace-strategy.md)；多步时再读批量编排 |
| HTML 转设计稿 | [HTML 转换](references/html-to-design.md) |
| 插入一组图标并排布 | [图标网格](references/icon-grid.md) |

## 执行闭环

1. **读现状。** 创作先 `jsd_get_page` 查看顶层节点与 assets；清单范围以返回的 note 为准。已有组件、变体、样式、变量命中用途就复用。修改已有内容时，用 `jsd_get_selection` 或按 id 的 `jsd_find` 确认目标、父级与相关属性。
2. **定结构与复用。** 屏 → 语义分区 → 卡片或行 → 图元；命名说明用途。同级重复结构先查组件，再决定抽主件、铺实例。同轴等距内容用 auto-layout，叠放装饰保留自由定位。
3. **按块执行。** 串行提交 `jsd_batch`，按语义块切批，每批最多 50 步。能写文件且 MCP 服务可读时，先把步骤保存为 JSON，再用 `callsFile` 传绝对路径；否则用内联 `calls`。建节点选对应类型的步骤，小型直属子树可用 children。建容器、归组、设布局等有依赖的步骤放同一批，跨批使用真实 id。`jsd_reparent_nodes` 显式传 parentId；同值批改在一个步骤里合并 ids。
4. **核对与纠错。** 读取 warnings，区分自动修复、未生效项与部分成功。批量摘要不含完整属性或子树，需要核实的字段单独 `jsd_find`。关键视觉变更用 `jsd_export({ids:[目标id], scale:0.5})` 导出并目视检查；失败按下表处理，不把工具回显成功当作视觉验收。
5. **修正再交付。** 修复本次引入的裁切、错位、未生效字段；报告完成范围、失败项与尚未验证的部分。

### 错误处置（所有附录共用）

| 现象 | 处置 |
| --- | --- |
| `skill_first_required` | 读技能 URI、任一配方 prompt 或 recipe 资源正文后重试；未读前持续拦截 |
| `invalid_args`、名字歧义、占位符错误 | 按 schema、返回候选或真实 id 修参数；原样重试无效 |
| 字段不支持、warnings 报未生效 | 改走当前平台声明的入口；仍不支持就停止重试并报告降级 |
| 写入超时、连接中断 | 先 `jsd_find` 回读；创建、克隆、复制未核实前不重放 |
| 部分成功、`applied[].ok === false` | 只补失败项，保留已成功写入；按 message 定位原因 |
| 视觉异常 | 导出受影响块，修复裁切、错位、缺字后回读 |

## 通用边界

- 根节点按坐标落位时用 `placement:{mode:"manual"}`；默认 center 会覆盖根的 x/y。子节点坐标相对父级，auto-layout 子项坐标由布局接管。
- `jsd_create_svg` 只收 `svg` 或 `svgPath` 二选一及可选 `name`；导入后再 `jsd_reparent_nodes`、按需 `jsd_move_node` / `jsd_resize_node`。几何改动回源重算；需要布局、组件复用或绑定的结构用原生节点，约束见 [代码画图表](references/chart-by-code.md)。
- 字体从 `jsd_list_fonts` 成对取 family 与同项 style 原值。固定宽、自动换行的文本给 width + `textAutoResize:"HEIGHT"`，样式细则见 [设计策略](references/design-strategy.md)。
- 布局、组件、变量、批量调用的细则分别见 [自动布局](references/auto-layout.md)、[变体集](references/variant-set.md)、[变量绑定](references/variable-binding.md) 与 [批量编排](references/script-ops.md)；附录不再重复主技能的错误处置表。
