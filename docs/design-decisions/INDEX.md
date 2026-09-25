# 设计决策索引

历史只增不改。结论变了就新建记录并取代旧编号，旧记录保留原文。

读法：每条决策**先读本索引**定位受影响的既有记录（含下面的依赖关系），再打开单条。
需求变更时另查一遍 MCP 报错台账有没有 `regressed` 落在本表的「影响范围」内：
`node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs list --json`。

维护阈值（超限按 `.agents/skills/software-design-patterns/references/decision-log.md` 处理，
由 `tests/skill-doc-budget.test.ts` 守着）：本表 ≤ 15 KB 或 ≤ 40 条；单条记录「变更历史」> 10 行
时压成一行摘要 + 指向被取代的记录；下面的依赖关系图**只画现行有效**的记录。

| 编号 | 标题 | 状态 | 影响范围 | 最后更新 |
|---|---|---|---|---|
| [0001](0001-属性写入改为-PropWriter-表驱动两阶段管线.md) | 属性写入改为 PropWriter 表驱动两阶段管线 | 已采纳 | `shared/core`（update / buildNode）、`ui/code/plugin.ts`、`tools/props.ts` | 2026-09-18 |
| [0002](0002-RuntimeContext-显式注入替代模块级可变单例.md) | RuntimeContext 显式注入替代模块级可变单例 | 已采纳 | `core/registry.ts`、`server.ts`、`shared/core/capabilities.ts` | 2026-09-18 |
| [0003](0003-工具级-after-钩子加-tags-取代-batch-内嵌-DriftWatch.md) | 工具级 after 钩子加 tags 取代 batch 内嵌 DriftWatch | 已采纳 | `tools/drift-watch.ts`、`tools/batch.ts`、`tools/nodes.ts` | 2026-09-18 |
| [0004](0004-写后校验用固定顺序-Pipeline-而非责任链.md) | 写后校验用固定顺序 Pipeline 而非责任链 | 已采纳 | `shared/core/update.ts`、`tools/props.ts`、`dicts/capability.ts` | 2026-09-18 |
| [0005](0005-事实一致性用-Vitest-不变式测试加-CI-门禁，不引入事件类架构.md) | 事实一致性用 Vitest 不变式测试加 CI 门禁，不引入事件类架构 | 已采纳 | 根 `package.json`、`.github/workflows/`、全仓 | 2026-09-18 |
| [0006](0006-工具目录体积用单点投影收敛，不引入模式.md) | 工具目录体积用单点投影收敛，不引入模式 | 已采纳 | `daemon/proxy.ts`、`daemon/compact-schema.ts`、`server.ts`、`__tests__/catalog-budget.test.ts` | 2026-09-18 |
| [0007](0007-静默失效的告警出口统一到-WriteOutcome，创建路径补齐回收.md) | 静默失效的告警出口统一到 WriteOutcome，创建路径补齐回收 | 已采纳 | `shared/core`（execute / buildNode / update / export / props）、`dicts/unapplied-prop.ts`、`tools/*` 与 `server.ts` 的纪律文案 | 2026-09-19 |
| [0008](0008-归档从人维护的历史文档改为台账自管的生命周期阶段.md) | 归档从人维护的历史文档改为台账自管的生命周期阶段 | 已采纳 | `.agents/skills/mcp-tdd/`（SKILL.md、references、scripts）、`docs/mcp-errors/`、`tests/`、`AGENTS.md` | 2026-09-19 |
| [0009](0009-技能依赖单向化：通用技能不感知项目的缺陷跟踪工具.md) | 技能依赖单向化：通用技能不感知项目的缺陷跟踪工具 | 已采纳 | `.agents/skills/software-design-patterns/`、`.agents/skills/mcp-tdd/`（SKILL.md、references/bookkeeping.md）、`AGENTS.md`、`tests/skill-doc-budget.test.ts` | 2026-09-19 |
| [0010](0010-契约接口异步优先：新增能力签名一律-Promise.md) | 契约接口异步优先：新增能力签名一律 Promise | 已采纳 | `shared/core/host.ts`（DesignHost、PlatformOp.run）、`ui/src/code/figma/ops.ts` | 2026-09-19 |
| [0011](0011-dynamic-page-下文档访问异步化：Access-层收口-解析与加载.md) | dynamic-page 下文档访问异步化：Access 层收口解析与加载 | 已采纳（已落地） | `shared/core/`（新增 access.ts、26 处 findNode）、`host.ts`、双侧 `sync-guarantee.ts`、`figma/ops.ts`、`vite-plugin-manifest.ts` | 2026-09-19 |
| [0012](0012-zod沙箱化：用模块局部对象替代globalThis避免Proxy沙箱拦截.md) | zod 沙箱化：用模块局部对象替代 globalThis，避免 jsDesign Proxy 沙箱拦截 | 已采纳 | `packages/ui/scripts/vite-plugin-zod-sandbox.ts`（新）、`packages/ui/vite.config.ts`、`packages/ui/dist/jsdesign/code.js` | 2026-09-19 |
| [0013](0013-错误链路：保持分层边界与载荷结构化及连接确认过期检测.md) | 错误链路：保持分层边界与载荷结构化及连接确认过期检测 | 已采纳（已落地） | `shared/`（新增 `dicts/error-code.ts`、PluginResponse、`connection.ts`）、`ui/`（`code/plugin.ts`、`bridge/`）、`mcp-server/`（新增 `core/bridge-error.ts`、`pending.ts`、`bridge.ts`、registry/response） | 2026-09-20 |
| [0014](0014-面板高度自适应用测量加-ui-resize-旁路消息，不引入布局框架.md) | 面板高度自适应用测量加 ui.resize 旁路消息，不引入布局框架 | 已采纳（已落地） | `shared/panel.ts`、`ui/`（新增 `bridge/codeChannel.ts` 与 `PanelHeightSync`、面板组件与 App） | 2026-09-21 |
| [0015](0015-日志抽屉打开时抬升窗口下限.md) | 日志抽屉打开时抬升窗口下限 | 已采纳（已落地） | `shared/panel.ts`、`ui/`（`components/PanelHeightSync.tsx`、`components/LogDrawer.tsx`、`App.tsx`） | 2026-09-21 |
| [0016](0016-i18n走语义键加参数，默认语言取系统语言并可手动切换.md) | i18n 走语义键加参数，默认语言取系统语言并可手动切换 | 已采纳（大部分落地：B0+B2+B3 键化+B4 机制已落；en 译文待补，棘轮守） | `shared/`（新增 `dicts/i18n/`、`locale-channel.ts`、host 的 clientStorage）、`ui/`（新增 `src/i18n/` 与 `LocaleSwitch`、面板与 bridge）、`mcp-server/`（`i18n.ts`、`localize-schema.ts`、工具与 registry）、`tests/i18n.test.ts` | 2026-09-21 |
| [0017](0017-第三平台MasterGo接入：门面投影加契约两处异步化.md) | 第三平台 MasterGo 接入：节点门面投影 + 契约两处异步化 | 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**运行期未联调**） | `shared/`（platform / node-type dict、i18n 文案、`core/host.ts` 两处改名）、`ui/`（新增 `src/code/mastergo/`、三侧 host 与 `sync-guarantee.ts`、构建配置）、`mcp-server/`（平台门控） | 2026-09-24 |
| [0018](0018-实例变体写入：MG上改为集合内换绑加回读校验.md) | 实例变体写入：MG 上改为「集合内换绑 + 回读校验」 | 已采纳（代码已落地并通过类型检查/不变式测试/构建；**真机复验待插件重载**） | `ui/src/code/mastergo/`（新增 `variant-swap.ts` 与其测试、门面的 `applyInstanceProps`）、`platform-limits.md`、`0017-*.md` | 2026-09-24 |
| [0021](0021-布局字段放开到COMPONENT与COMPONENT_SET：按平台类型逐项核对后不引入能力位.md) | 布局字段放开到 COMPONENT / COMPONENT_SET：逐平台类型核对后**不引入**能力位 | 已采纳（代码已落地并通过类型检查/测试/构建；真机三平台复验待插件重载） | `shared/`（`dicts/prop-applicability.ts`、`schemas/shared-props.ts`、新增 `layout-applicability.test.ts`）、`mcp-server/tools/props.ts` | 2026-09-24 |
| [0022](0022-平台类型事实收敛为声明表，值域与适用性判定归位到-core-写路径.md) | 平台类型事实收敛为声明表，值域与适用性判定归位到 core 写路径 | 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**MasterGo 真机已逐条复验，台账 0 未决**；Figma/jsDesign 待重载复验） | `shared/`（新增 `dicts/platform-value-domain.ts`、`core/props/`、`schemas/{base,shared-props}.ts`、`core/normalize.ts`）、`ui/`（三侧 `sync-guarantee.ts`、MG 门面）、`platform-limits.md` | 2026-09-24 |
| [0023](0023-组件属性读形态与写形态之间要有单点映射，套用覆盖不再隐式换变体.md) | 组件属性「读形态 ≠ 写形态」：单点映射 + 套用覆盖不再隐式换变体 | 已采纳（Figma 真机已复验） | `shared/src/core/component.ts`、`ui/src/code/figma/ops.ts`、`schemas/results.ts` |
| [0024](0024-变量绑定进入读路径：boundVariables-按引擎词汇原样透传，不引入归一化层.md) | 变量绑定进入读路径：`boundVariables` 按引擎词汇原样透传，不引入归一化层 | 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**Figma 真机复验待插件重载**） | `shared/`（`schemas/{platform,serialized-node}.ts`、`core/{host,serialize}.ts`、`write-path` 单测）、`ui/code/figma/sync-guarantee.ts` | 2026-09-25 |
| [0025](0025-Figma补上组件属性的定义入口：一个op承担定义即绑定，不照搬MG的四段式.md) | Figma 补上组件属性**定义**入口：一个 op 承担「定义 + 绑定」，不照搬 MG 四段式 | 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**Figma 真机复验待插件重载**） | `ui/code/figma/{ops,sync-guarantee}.ts`、`mcp-server/tools/nodes.ts`、`mcp-server/README.md` | 2026-09-25 |
| [0020](0020-平台差异不重定义工具：三档机制继续承载，建组件改由core统一带子节点.md) | 平台差异不重定义工具：三档机制继续承载，建组件改由 core 统一带子节点 | 已采纳（代码已落地；真机三平台复验待插件重载） | `shared/`（`execute-schemas.ts` 导出 `childNodeSchema`、`split-ops.ts`、`core/component.ts`）、`ui/code/plugin.ts`、i18n 文案 | 2026-09-24 |
| [0019](0019-MasterGo平台特有操作：组件属性管理.md) | MasterGo 平台特有操作：组件属性管理（add / edit / delete） | 已采纳（代码已落地并通过类型检查/不变式测试/构建；真机复验随同批进行） | `ui/src/code/mastergo/`（新增 `ops.ts`、`meta.ts`）、`mcp-server/tools/platform.ts`（归属加 mastergo）、`platform-limits.md`、`0017-*.md` | 2026-09-24 |

## 依赖关系

```text
0005 (Vitest + CI)  ── 全部前置：没有它，其余结论无法验收
0002 (RuntimeContext) ── 0001 的可测性地基
0003 (tags + after)  ── 独立，可与任意批次并行
0006 (目录投影)      ── 独立；原则取自 0003（不手抄清单）
0001 (PropWriter)    ── 依赖 0002
0004 (Pipeline)      ── 与 0001 同批；纠正早前评审的「责任链」说法
0007 (回读回收)      ── 把 0004 的回收面补到创建路径；覆盖面口径取自 0003
0008 (归档阶段)      ── 独立于代码层；「能被机器守的约束不靠文档纪律」取自 0005
0009 (依赖单向)      ── 独立于代码层；「同一事实不手写多份」与 0008 同源，都取自 0005
0010 (异步优先)      ── 契约纪律，不改管线；「能被机器守的不靠文档纪律」取自 0005，可移植边界取自 0009
0011 (Access 层)     ── 0010 在 dynamic-page 下的落地；解析/加载收口，0001/0004 管线保持同步
0012 (zod 沙箱化)    ── 独立；外部依赖与 0009 同源（不污染上游库）
0013 (错误链路)      ── 与 0007 同源（不允许静默失效）；「能被机器守的约束」取自 0005；不改 0001/0004 写入管线
0014 (面板高度)      ── 独立；「同一事实不手写多份」取自 0008/0009；「不为一处需求引依赖」取自 0012；不改 0001/0004 写入管线
0015 (日志高度下限)  ── 修订 0014 的「抽屉不参与高度」那一条；「不为一处需求引依赖」取自 0012
0016 (i18n 键化)    ── 载体取自 0013、唯一真源取自 0007、locale 显式注入沿 0002、体积受 0006 约束；
                        `ui_env` 加字段沿 0014；不改 0001/0004 写入管线
0017 (MasterGo 门面投影) ── 契约两处异步化沿 0010（它第一次反向改**既有**成员）；Access 层回退沿 0011；
                        平台可移植边界沿 0009（平台专属约定不进通用技能）；沙箱存疑点引自 0012；
                        不改 0001/0004 写入管线
0018 (MG 变体写入换绑) ── 落在 0017 的平台上；沿 0007「不允许静默失效」立修法（匹配不到必报错、换绑后回读校验）；
                        调用面不变（仍是 set_instance_properties 语义），故不改 core/线格式
0019 (MG 组件属性 op)  ── 补 0017 的平台能力缺口（读得到、建不出）；与 figma 的 platformOps 同档；
                        回读校验沿 0007「不允许静默失效」；被 0018 的组件属性分流依赖
0020 (不按平台重定义工具) ── 立「差异三档机制（属性门控 / 工具 platforms 名单 / platformOps 通道）」的边界，
                        明确按平台出工具族属过度设计（撞 0006 目录体积门禁、成本转嫁调用方）；
                        本次建组件带子节点修在 core 通用管线而非 MG 专属分支，避免制造新的平台分叉；
                        依赖 0017 的 adapter 分层，沿用 0004/0007 的回读回收，不动 0001/0004 写入管线
0021 (布局放开到组件/组件集) ── 取代 0020 末尾「加 variantSetLayout 能力位」那条建议：逐平台核对 typings 后
                        门控恒真 → 不引能力位（静默失效由 0007 回读兜住）；依赖 0017 的 adapter 分层
0022 (平台类型事实声明表) ── 判定归属层从平台门面移进 core 写路径（只有 core 手上有 ctx/outcome），出口沿 0007；
                        平台维度沿 0002、载体沿 0001/0021，不引入新模式；依赖 0017
0023 (组件属性读写形态) ── 一份形态知识只写一处（沿 0022），四个出口共用；「默认不换变体」是 0007 的具体化；
                        MG 的键归一仍留在门面（0017/0019）
0024 (boundVariables 读路径) ── 补读出口，动机沿 0007（写后要能回读）；按 0021/0022「逐平台核对后走既有机制」
                        （超集可选字段 + 编译期断言），不新增词汇（与 0023 同源）；值成员故 0010 不适用
0025 (Figma 组件属性定义) ── 沿用 0020 的 platformOps 通道加 op（不新造工具族）；合并「定义+绑定」是消 0007 禁的中间态，
                        槽位由类型推导与 0023「一份形态知识只写一处」同源；形制参照 0019 的 MG 四段式但按平台能力裁剪
```

## 汇总

- [`../optimization-plan-2026-09-18.md`](../optimization-plan-2026-09-18.md) —— 本轮分析与落地顺序（含对既有评审的 3 处修正、2 处遗漏）
- [`../design-review-2026-09-18.md`](../design-review-2026-09-18.md) —— 上一轮评审原文，仍有效，除本索引记录里明确纠正的部分
