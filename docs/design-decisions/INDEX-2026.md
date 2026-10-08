# 设计决策索引 · 2026（年档）

本文件是**按年归档**的全量表，只增不改。主索引 [`INDEX.md`](INDEX.md) 只留「现行有效 + 最近 10 条」。

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
| [0019](0019-MasterGo平台特有操作：组件属性管理.md) | MasterGo 平台特有操作：组件属性管理（add / edit / delete） | 已采纳（代码已落地并通过类型检查/不变式测试/构建；真机复验随同批进行） | `ui/src/code/mastergo/`（新增 `ops.ts`、`meta.ts`）、`mcp-server/tools/platform.ts`（归属加 mastergo）、`platform-limits.md`、`0017-*.md` | 2026-09-24 |
| [0020](0020-平台差异不重定义工具：三档机制继续承载，建组件改由core统一带子节点.md) | 平台差异不重定义工具：三档机制继续承载，建组件改由 core 统一带子节点 | 已采纳（代码已落地；真机三平台复验待插件重载） | `shared/`（`execute-schemas.ts` 导出 `childNodeSchema`、`split-ops.ts`、`core/component.ts`）、`ui/code/plugin.ts`、i18n 文案 | 2026-09-24 |
| [0021](0021-布局字段放开到COMPONENT与COMPONENT_SET：按平台类型逐项核对后不引入能力位.md) | 布局字段放开到 COMPONENT / COMPONENT_SET：逐平台类型核对后**不引入**能力位 | 已采纳（代码已落地并通过类型检查/测试/构建；真机三平台复验待插件重载） | `shared/`（`dicts/prop-applicability.ts`、`schemas/shared-props.ts`、新增 `layout-applicability.test.ts`）、`mcp-server/tools/props.ts` | 2026-09-24 |
| [0022](0022-平台类型事实收敛为声明表，值域与适用性判定归位到-core-写路径.md) | 平台类型事实收敛为声明表，值域与适用性判定归位到 core 写路径 | 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**MasterGo 真机已逐条复验，台账 0 未决**；Figma/jsDesign 待重载复验） | `shared/`（新增 `dicts/platform-value-domain.ts`、`core/props/`、`schemas/{base,shared-props}.ts`、`core/normalize.ts`）、`ui/`（三侧 `sync-guarantee.ts`、MG 门面）、`platform-limits.md` | 2026-09-24 |
| [0023](0023-组件属性读形态与写形态之间要有单点映射，套用覆盖不再隐式换变体.md) | 组件属性「读形态 ≠ 写形态」：单点映射 + 套用覆盖不再隐式换变体 | 已采纳（Figma 真机已复验） | `shared/src/core/component.ts`、`ui/src/code/figma/ops.ts`、`schemas/results.ts` |
| [0024](0024-变量绑定进入读路径：boundVariables-按引擎词汇原样透传，不引入归一化层.md) | 变量绑定进入读路径：`boundVariables` 按引擎词汇原样透传，不引入归一化层 | 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**Figma 真机复验待插件重载**） | `shared/`（`schemas/{platform,serialized-node}.ts`、`core/{host,serialize}.ts`、`write-path` 单测）、`ui/code/figma/sync-guarantee.ts` | 2026-09-25 |
| [0025](0025-Figma补上组件属性的定义入口：一个op承担定义即绑定，不照搬MG的四段式.md) | Figma 补上组件属性**定义**入口：一个 op 承担「定义 + 绑定」，不照搬 MG 四段式 | 已采纳（代码已落地并通过类型检查/不变式测试/三平台构建；**Figma 真机复验待插件重载**） | `ui/code/figma/{ops,sync-guarantee}.ts`、`mcp-server/tools/nodes.ts`、`mcp-server/README.md` | 2026-09-25 |
| [0029](0029-能力字典改规格表：kind-判别加-labelKey-收口，删死代码与重复事实.md) | 能力字典改规格表：kind 判别 + labelKey 收口 | 已采纳（类型检查 + 不变式测试通过） | `shared/`（`dicts/capability.ts`、`core/{capabilities,buildNode}.ts`、i18n 少一键）、`ui/`（删 `i18n/capabilityKeys.ts`、`CapabilityCard`、`figma/meta.ts` 少一位） | 2026-09-29 |

## 说明

- **拆档于 2026-09-29**：主索引触及 15 KB 阈值，按 `.agents/skills/software-design-patterns/references/decision-log.md`
  的动作把全量行移入本文件，主索引只留最近 10 条。本次只搬了**行**，行内容逐字符未改（仅行序改为编号升序）。
- 2026-10-08：主索引触及 15 KB 阈值，按同一动作把 **0017–0023 从主索引删除**（它在主索引与本年档各有一份，删的是主索引那份，本档未新增副本）；说明句改为「更早的 0001–0023 见 INDEX-2026.md」。
- 本表按编号排；主索引的「依赖关系」图覆盖全部现行有效记录，**只留在 [`INDEX.md`](INDEX.md)**，不在这里重复一份。
- `0026` / `0027` / `0028` 是**空号**：代码与 CHANGELOG 引用过这三个编号（CollapsibleSection 收口 / BigInt 沙箱 / chromeHeight），但记录从未落库，编号不复用。见 [0029](0029-能力字典改规格表：kind-判别加-labelKey-收口，删死代码与重复事实.md) 开头的编号说明。
