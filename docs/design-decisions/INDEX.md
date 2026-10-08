# 设计决策索引

历史只增不改。结论变了就新建记录并取代旧编号，旧记录保留原文。

读法：每条决策**先读本索引**定位受影响的既有记录（含下面的依赖关系），再打开单条。
下表只列**最近 10 条**（2026-09-24 及以后）；更早的 0001–0016 见 [`INDEX-2026.md`](INDEX-2026.md)。

维护阈值：本表 ≤ 15 KB 或 ≤ 40 条，超限**按年拆档**（全量行移入 `INDEX-<年>.md`，本表只留现行有效 + 最近 10 条）；
单条记录的「变更历史」> 10 行时压成一行摘要 + 指向被取代的记录。完整机制见
`.agents/skills/software-design-patterns/references/decision-log.md`。

| 编号 | 标题 | 状态 | 影响范围 | 最后更新 |
|---|---|---|---|---|
| [0017](0017-第三平台MasterGo接入：门面投影加契约两处异步化.md) | 第三平台 MasterGo 接入：节点门面投影 + 契约两处异步化 | 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**运行期已联调**——2026-09-24 首发并复验） | `shared/`（platform / node-type dict、i18n、`core/host.ts`）、`ui/`（新增 `src/code/mastergo/`、三侧 host 与 `sync-guarantee.ts`、构建配置）、`mcp-server/`（平台门控） | 2026-10-08 |
| [0018](0018-实例变体写入：MG上改为集合内换绑加回读校验.md) | 实例变体写入：MG 上改为「集合内换绑 + 回读校验」 | 已采纳（**MG 真机复验通过**：2026-09-29 与 0033 同轮，建实例 → 写变体属性 → 回读命中；「增维/改值」未决项由 0033 接掉） | `ui/src/code/mastergo/`（新增 `variant-swap.ts` 与其测试、门面的 `applyInstanceProps`）、`platform-limits.md`、`0017-*.md` | 2026-09-24 |
| [0019](0019-MasterGo平台特有操作：组件属性管理.md) | MasterGo 平台特有操作：组件属性管理（add / edit / delete） | 已采纳（MG 真机复验通过 2026-09-24；2026-09-29 ping 复核 platformOps 5→11，组件属性 5 op 沿用原结论；「变体集管理」范围外项已由 0033 接掉） | `ui/src/code/mastergo/`（新增 `ops.ts`、`meta.ts`）、`mcp-server/tools/platform.ts`（归属加 mastergo）、`platform-limits.md`、`0017-*.md` | 2026-09-24 |
| [0020](0020-平台差异不重定义工具：三档机制继续承载，建组件改由core统一带子节点.md) | 平台差异不重定义工具：三档机制继续承载，建组件改由 core 统一带子节点 | 已采纳（**三平台真机复验**：2026-09-29 MG/Figma；2026-10-08 jsDesign 带内容建组件成立；「合进变体集」半支在 jsDesign 受引擎缺陷不可达(见 0021)） | `shared/`（`execute-schemas.ts`、`split-ops.ts`、`core/component.ts`）、`ui/code/plugin.ts`、i18n | 2026-10-08 |
| [0021](0021-布局字段放开到COMPONENT与COMPONENT_SET：按平台类型逐项核对后不引入能力位.md) | 布局字段放开到 COMPONENT / COMPONENT_SET：逐平台类型核对后**不引入**能力位 | 已采纳（**三平台真机复验**：2026-09-29 MG/Figma 集合与组件都放通；2026-10-08 两条遗留全清——① 适用性点名接进 `updateSelection` 并去重；② `settle` 回读扩到 `itemSpacing`/`padding*`(Figma 5 项 + MG 2 例通过，不再靠人工 `jsd_find`)；jsDesign 侧 COMPONENT 放通、COMPONENT_SET 因引擎做不出集合而不达） | `shared/`（`dicts/*`、`schemas/shared-props.ts`、`core/{update,props/writers}.ts`、两个 `__tests__`）、`mcp-server/tools/{props,update-common}.ts` | 2026-10-08 |
| [0022](0022-平台类型事实收敛为声明表，值域与适用性判定归位到-core-写路径.md) | 平台类型事实收敛为声明表，值域与适用性判定归位到 core 写路径 | 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**MG / jsDesign 真机已逐条复验**——MG 2026-09-24 并 2026-10-08 复跑，jsDesign 2026-10-08 补跑；Figma 2026-10-08 复跑，三平台齐） | `shared/`（新增 `dicts/platform-value-domain.ts`、`core/props/`、`schemas/*`、`core/normalize.ts`）、`ui/`（三侧 `sync-guarantee.ts`、MG 门面）、`platform-limits.md` | 2026-10-08 |
| [0023](0023-组件属性读形态与写形态之间要有单点映射，套用覆盖不再隐式换变体.md) | 组件属性「读形态 ≠ 写形态」：单点映射 + 套用覆盖不再隐式换变体 | 已采纳（Figma 真机已复验） | `shared/src/core/component.ts`、`ui/src/code/figma/ops.ts`、`schemas/results.ts` |
| [0024](0024-变量绑定进入读路径：boundVariables-按引擎词汇原样透传，不引入归一化层.md) | 变量绑定进入读路径：`boundVariables` 按引擎词汇原样透传，不引入归一化层 | 已采纳（**Figma 真机复验通过**：2026-09-29 建变量→绑定→回读得 `{type:'VARIABLE_ALIAS', id:'VariableID:…'}`，未归一化；变量集合无删除入口，属 op 能力缺口） | `shared/`（`schemas/{platform,serialized-node}.ts`、`core/{host,serialize}.ts`、`write-path` 单测）、`ui/code/figma/sync-guarantee.ts` | 2026-09-25 |
| [0025](0025-Figma补上组件属性的定义入口：一个op承担定义即绑定，不照搬MG的四段式.md) | Figma 补上组件属性**定义**入口：一个 op 承担「定义 + 绑定」，不照搬 MG 四段式 | 已采纳（**Figma 真机复验通过**：2026-09-25 验 INSTANCE_SWAP / TEXT 两槽，2026-09-29 补测 BOOLEAN 槽(可见性)，属性确实驱动图层） | `ui/code/figma/{ops,sync-guarantee}.ts`、`mcp-server/tools/nodes.ts`、`mcp-server/README.md` | 2026-09-25 |
| [0029](0029-能力字典改规格表：kind-判别加-labelKey-收口，删死代码与重复事实.md) | 能力字典改规格表：kind 判别 + labelKey 收口 | 已采纳（类型检查 + 不变式测试通过） | `shared/`（`dicts/capability.ts`、`core/{capabilities,buildNode}.ts`、i18n 少一键）、`ui/`（删 `i18n/capabilityKeys.ts`、`CapabilityCard`、`figma/meta.ts` 少一位） | 2026-09-29 |
| [0030](0030-MCP-服务实例一次装配、跨请求复用（目录不再按请求重建）.md) | MCP 服务实例一次装配、跨请求复用（目录不再按请求重建） | 已采纳（类型检查 + 本包 24 例不变式测试通过；真机复验待插件重载） | `mcp-server/`（`daemon/run.ts` 装配改一次、`server.ts` 删 `liveSessions`/`syncToolAvailability` + 加 `cacheHints`、`index.ts` 连接变化回调）、`daemon/proxy.ts` 注释 | 2026-09-29 |
| [0031](0031-MCP-声明面照-2026-07-28-补齐：目录缓存提示-+-工具注解四-hint-必填.md) | MCP 声明面照 2026-07-28 补齐：目录缓存提示 + 工具注解四 hint 必填 | 已采纳（类型检查 + 本包 24 例不变式测试通过；真机复验待插件重载） | `mcp-server/`（`config.ts`、`server.ts`、`daemon/proxy.ts`、`core/registry.ts`、`tools/*.ts` 全 53 个工具的注解） | 2026-09-29 |
| [0032](0032-平台事实三域收敛为声明表：prompts-与工具描述共用单一投影点.md) | 平台事实三域收敛为声明表：prompts 与工具描述共用单一投影点 | 已采纳（类型检查 + 12 例不变式 + i18n/目录体积回归通过；2026-10-08 真机：jsDesign 侧 boolean 一项**不可隔离**（无属性可设）、MG/Figma 侧配方分流通过） | `shared/`（新增 `dicts/platform-knowledge.ts`、`platform-value-domain.ts` 第四类登记、`core/host.ts`、i18n 三键）、`ui/`（三侧 `sync-guarantee.ts`）、`mcp-server/`（新增 `tools/platform-facts.ts`、`tools/{prompts,components,platform}.ts`、`README.md`）、`tests/platform-knowledge.test.ts` | 2026-10-08 |
| [0033](0033-MG-集合级变体管理接入-platformOps：原生建维改值替代改名副作用.md) | MG 集合级变体管理接入 platformOps：原生建维改值替代改名副作用 | 已采纳（类型检查 + 18 例新单测 + 40 例既有 MG 单测 + 事实表/i18n/目录体积回归 + 三平台构建通过；**真机复验通过**——MG 客户端 7 项全通，`platformOps` 5→11、画布已清干净） | `ui/src/code/mastergo/`（`ops.ts` 6 个 op、新增 `variant-set.ts` 与其单测、`meta.ts`、`sync-guarantee.ts`）、`shared/dicts/platform-knowledge.ts`、`mcp-server/`（`tools/{platform-facts,prompts}.ts`、`README.md`）、`tests/platform-knowledge.test.ts` | 2026-09-29 |


## 依赖关系

只画**现行有效**的记录（已取代 / 已废弃的不进图）。图覆盖全部现行有效记录，故图里可能出现不在上表的编号
（那几条已归档进 [`INDEX-2026.md`](INDEX-2026.md)）。

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
0029 (能力规格表) ── 把「一个事实一份」推到能力面：kind 替掉空数组的三种含义；取向同 0021/0022，不引入模式
0030 (一次装配、跨请求复用) ── 独立于写入管线；「不引模式、由调用方持有装配结果」沿 0002（不设模块级可变
                        单例）、目录体积口径沿 0006；删 list_changed 广播与 0016 的装配期投影同源（目录恒定）
0031 (声明面补齐) ── 与 0030 同批：0030 定的「目录静态」是 0031 给 daemon 侧 CATALOG_TTL_MS 的前提，
                        两侧取值相反（shim 镜像目录恒 0）也因此；工具注解必填沿 0003「不手抄清单」的取向
0032 (平台事实三域) ── 把 0022/0029「一个事实一份」推到变量/组件/变体三域：载体沿 0029 的规格表取向、
                        判定归属沿 0022（数据表 + 编译期断言，不引模式）；prompts 按平台分流沿 0002
                        （平台状态显式注入，不用模块级单例）；过时注释的复发由 0005 的不变式测试守；
                        新增第四类登记（契约方法参数取值域）补 0022 三张表装不下的形态
0033 (MG 集合级变体管理) ── 补 0018 的「未决」项（它把增维/改值留成「需要时另开决策」）：走 0020 的第二档
                        （platformOps 通道），形制沿 0019 的组件属性 op 组、出口纪律沿 0007（本平台有「回包成功、
                        值没变」的前科，故每个 op 写完回读）；拒绝「按平台出新工具族」沿 0020、拒绝「扩
                        combine_as_variants 入参」同因；登记进 0032 的三域事实表，提示词据此分流
```

更早的记录（0001–0016）见 [`INDEX-2026.md`](INDEX-2026.md)。
