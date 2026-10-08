# 0029. 能力字典改规格表：kind 判别 + labelKey 收口，删死代码与重复事实

- **日期：** 2026-09-29
- **状态：** 已采纳（代码已落地并通过类型检查；`tests/i18n.test.ts` 按 `labelKey` 校验已改；三平台真机复验随下次重载）
- **影响范围：** `shared/`（`dicts/capability.ts` 重写为规格表、`schemas/platform.ts` 的线格式枚举、`core/host.ts` 的 `PlatformMeta` 收窄、`core/{capabilities,buildNode}.ts`、`dicts/i18n/*` 删一条键）、`ui/`（删 `i18n/capabilityKeys.ts`、`components/CapabilityCard.tsx`）、`code/figma/meta.ts` 少一个能力位、`mcp-server/`（无代码改动：只透传；线格式与取值表同宽后，旧插件与旧 MCP 不得混用）
- **相关记录：** 沿 0002（能力表显式注入）、0007（静默失效出口）、0020（平台差异三档机制）、0021（逐平台核对后不引入能力位）、0022（平台类型事实收敛为声明表）的做法；不取代任何记录

> 编号说明：`0026` / `0027` / `0028` 已被代码与 CHANGELOG 引用（CollapsibleSection 收口 / BigInt 沙箱 / chromeHeight），但那三条记录从未落库（全仓 `rev-list` 扫过，git 里不存在）。故本条从 **0029** 起编，不复用那三个号。

## 压力

`dicts/capability.ts` 是**能力事实的唯一真源**，但这份真源旁边长出了四份手抄副本，且真源自身的类型把两类不同语义压进了一个数组。已产生的成本都可观察，不是"未来可能"：

1. **两份 label 表，且死了一份。** `capability.ts` 的 `HOST_CAPABILITY_LABEL` / `CORE_CAPABILITY_LABEL` 全仓 grep **零消费方**（文件头注释仍写着「③ 插件 UI 面板的能力表（中文标签就在这里）」，已不成立——面板走 `ui/src/i18n/capabilityKeys.ts` + `t()`）。而且它硬绑 `MESSAGES_ZH_CN`：谁真接了这条，英文界面就冒中文。活的 `capabilityKeys.ts` 是第二份 cap → 文案键映射，两表靠人同步，`tests/i18n.test.ts` 只守「取值有对应 catalog 键」，守不住两张表是否一致。
2. **TEXT-only 事实两份。** `core/capabilities.ts` 里 `TEXT_ONLY_GATED_PROPS = new Set(['textTruncation','maxLines'])`，而 `dicts/prop-applicability.ts` 早已登记 `textTruncation: ['TEXT']` / `maxLines: ['TEXT']` 并提供了 `propAppliesTo()`。同一个领域事实按字段名抄了第二遍。
3. **门控属性表被手抄第三遍。** `core/buildNode.ts` 的 `GATED_SPEC_KEYS` 手写 6 个字段名，注释写着「与 dicts/capability.ts 的属性表对应」——靠人同步的事实，抄的那天起就开始漂（它已经漏掉 `componentProperties`，只是恰好 `ExecuteOp` 不收这个键才没出事）。
4. **`[]` 在门控表里过载了三种含义。** `Record<HostCapabilityKey, readonly string[]>` 中，`styles` 的 `[]` 外为空数组：`variables` / `platformOps` 是「走 op 通道、不落节点属性」，`inPlaceVariants` 是「行为型、只决定 core 策略顺序」。加一个能力时该填哪一种，只能读注释猜。
5. **`platformOps` 能力位与同回包里的 `platformOps` 数组重复，且三平台自相矛盾。** Figma 的 `meta.capabilities` 声明了它；MasterGo 有 5 个 `mg_*` op 却没声明——同一个 ping 回包里 `platformOps.length > 0` 而 `capabilities` 不含 `platformOps`。而**没有任何代码读这个位**：core 只用 `inPlaceVariants`，MCP 侧只透传。
6. **注释里的证据会过期。** `capability.ts` 引 `@figma/plugin-typings 1.137`，实装 `1.139.0`。

变化频率：能力位随每次平台接入被重新审视（0017 → 0019 → 0024 → 0025 均在动这条链路）；失败后果是**静默**的——加一个能力漏改一份副本，面板/判定两边各自「看起来正常」。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| **派生式声明表**：每条能力一条记录（`{ kind, props?, labelKey }`），取值表 / 门控反查表 / 文案键全部派生 | 采用 | — |
| Strategy（每个 kind 一个策略对象） | 排除 | 命中停止条件「分支少、稳定、可读，抽象后跳转成本高于收益」。kind 只有 3 个取值，且**不随实现数量增长**——它描述的是数据是什么，不是行为怎么变 |
| Bridge / Abstract Factory（把「能力」与「平台」两个维度拆开） | 排除 | 平台维度已是三份 adapter 的 `meta.capabilities`，能力维度已是这张表；再拆一层是把两个已存在的变化轴变成三个。0009 的口径同样适用：平台专属声明留在各自 adapter（证据与真机结论在本地） |
| 给能力表补一张「能力 × 平台」全局矩阵 | 排除 | 每条 claim 的依据（typings 行号、真机结论）写在各自 `meta.ts` 里，搬到 shared 等于让证据离声明更远；且「MG 不 claim 是刻意」这件事必须就地可见 |
| 删 `platformOps` 与 `variables` 两个位 | **部分采用** | 见结论第 3 条 |
| 保持简单：只在两处 label 表之间加一致性断言 | 排除 | 命中停止条件「根因是职责划分或数据模型错误」——真正缺少的是**一份事实的载体**：断言只能证明两份抄得像，不能阻止第三份再长出来 |

## 结论

**不引入新模式。** 语言原生特性（`as const` + discriminated union + `Object.keys` 派生）足够，把 6 处事实收成 1 处：

1. **一张规格表当唯一真源。** `HOST_CAPABILITY_SPEC` 每条记录必须回答「它是什么」：`kind: 'propGate' | 'channel' | 'flow'`。加能力时**必须**选一个 kind（编译期逼问），不再靠「填不填 props」表达语义。
2. **其余全部派生，且只导出核心真正消费的查询。** `HOST_CAPABILITIES`（展示顺序 = 书写顺序）、`CAPABILITY_OF_GATED_PROP`（反查）由本表派生；`CAPABILITY_GATED_PROPS` 保留但改为派生（外部可读的「能力 → 门控面」）。
3. **`platformOps` 位删除，`variables` 位保留并归 `channel`。** 前者与同回包的 `platformOps` 数组是同一事实的第二份载体（且 MG 侧已经不一致）；后者没有重复物——它是「这个平台有没有变量能力面」的独立声明，MG 接上变量时仍要用它，但它**不参与 core 判定**（kind 说清了这件事）。
4. **label 只留一处。** `labelKey` 进规格表，`ui/i18n/capabilityKeys.ts` 整份删除，UI 直接读规格表取键。中文标签不再有第二份载体，英文界面也不会再有机会取到中文。
5. **顺带清掉三处单点重复**（本身不必开记录，落在同批改动里）：删两张死 label 表；`TEXT_ONLY_GATED_PROPS` 改为走 `propAppliesTo`；`GATED_SPEC_KEYS` 改为从能力表派生；修正 1.137 → 1.139 的证据引用。
6. **线格式与取值表同宽，不做跨版本容忍。** 删除一个只用于展示的能力位后，插件发来的旧取值会过不了 `pingResultSchema`（`jsd_ping` 回 `isError` 且无 `structuredContent`）—— 这个后果**被接受**，不作为设计约束：插件与 MCP 由同一批改动一起发版，两端必须同步升级/重载。于是 `schemas/platform.ts` 的枚举直接取 `HOST_CAPABILITIES`，不另立「只读不写」的退役名单。`PlatformMeta.capabilities` 收成 `HostCapabilityKey` 是这条口径的另一半：两端都不认退役值，不存在「一侧宽一侧窄」。

**为什么这不是新模式**：dict + `as const` + 编译期断言都是本仓既有机制（0001/0021/0022）；本记录只是把「能力」这一类数据也改成声明表，并纠正两种语义挤在一个数组里的问题。与 0021「逐平台类型核对后不引入能力位」同一取向。

## 最小落地

- **角色与职责：**
  - `dicts/capability.ts`：唯一真源。`HOST_CAPABILITY_SPEC`（含 `kind` / 可选 `props` / `labelKey`）+ 三个派生导出。
  - `core/capabilities.ts`：唯一判定点。TEXT-only 的特例删除，改为 `propAppliesTo(key, node.type)`（类型不匹配优先于能力缺失，与既有语义一致）。
  - `core/buildNode.ts`：`GATED_SPEC_KEYS` 从 `CAPABILITY_OF_GATED_PROP` 派生（排除 `ExecuteOp` 不收的键，并写明为什么）。
  - `schemas/platform.ts`：线格式枚举 = `HOST_CAPABILITIES`。线格式与取值表**同宽**，不设「只读不写」的退役名单（见结论第 6 条）。
  - `ui/components/CapabilityCard.tsx`：文案取 `spec[cap].labelKey`。
  - 发版：`shared` 是 `private` 且以源码被 workspace 引用，`ui` 与 `mcp-server` 的产物都会打包它 —— **两个包都要发**（`.changeset/auto-capability-spec-table.md` 同时列了 `text-to-design-ui` 与 `text-to-design-mcp`）。此前 `.changeset` 脚本只按改动目录判断可发布包，`shared/` 单独变更不会触发任何一个，这个缺口见「变更历史」。
- **接口所在层与依赖方向：** 表在 `shared/dicts`（无依赖）；判定在 `shared/core`；文案照旧从 `dicts/i18n` 取。方向仍是 core → dicts，ui → shared。**不新增反向依赖**。
- **创建与装配位置：** 不变。`plugin.ts` 仍用 `meta.capabilities` 装配 `runtimeContext(...)`；`z.enum(HOST_CAPABILITIES)` 仍从派生取值构造。
- **一次请求的调用时序：** 不变（`updateSelection` / `executeOps` → `isGatedPropUnsupported` → `outcome.ignored` + `warnings`）。

## 成本与退出条件

- **成本：** 无新增间接层、状态、网络跳数或存储。净减一个文件（`ui/i18n/capabilityKeys.ts`）与两条 catalog 键、约 40 行代码；新增一处编译期断言（`kind` 必须显式给出）。
- **退出条件：** 若某平台的能力面完全由线格式表达（不再有平台差异位），则规格表退化为一张空表、`isGatedPropUnsupported` 恒假，判定可整块删掉而不影响其它平台。若 `kind` 将来只剩一种取值，discriminated union 应退回普通对象——`satisfies` 断言会先给出编译错误，不会静默留着。

## 验证

- **不变量测试**（`packages/shared/src/__tests__/capability-dict.test.ts`，**未落库** —— 本节是待补的规格，仓里目前没有这个文件）：
  - 派生取值表与规格表的键集、顺序完全一致（面板顺序不会因重构漂移）；
  - 反查表与 `propGate` 条目的 `props` 互为逆映射，且无字段被两个能力同时门控；
  - `propGate` 必带非空 `props`，`channel` / `flow` 必不带 `props`（把「`[]` 过载三种含义」钉成编译期 + 测试期双保险）；
  - `labelKey` 必在两份 catalog 里存在，且 `capability.host.*` 键集与能力取值表一一对应（反向也成立：不留孤儿键——这正是删 `platformOps` 后要防的回归）。
- **既有测试：** `tests/i18n.test.ts` 的「字典加了取值就必须有文案」改为按 `labelKey` 校验，不再依赖 `capability.host.${cap}` 的拼串约定。
- **跨版本口径（不设兼容用例）：** 线格式等于取值表，退役的 `platformOps` 在两侧都是非法值；「旧插件 + 新 MCP」不在支持范围内，两端同步升级/重载。故 `mcp-server/` 无代码改动也无新增测试 —— 它只透传 `capabilities`，取值面由 shared 的枚举单点决定。
- **边界用例：** 未注入能力表（`capabilities: null`）时判定仍 fail-open，`isGatedPropUnsupported` 退回 `'in'` 探测——`write-path.test.ts` 既有用例覆盖该口径。
- **指标与日志：** `warnings` 文案不变（仍点名 `${key}(需 ${cap} 能力)`）；面板能力表少一行（`platformOps`），其余展示不变。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-29 | 初次决策（排查「能力相关逻辑是否落后于三平台类型」时发现真源旁挂了四份副本） | 采用派生式声明表；不引入模式 |
| 2026-09-29 | 追问「shared 的变更 mcp 侧要不要发版」→ 实测「旧插件 + 新 MCP」组合 | 先记「结论加固」：线格式改为容忍退役取值（第 6 条）、新增 `ping-capability-compat.test.ts`；发版面确认为 **ui + mcp 两个包**，`.changeset` 脚本不认识「shared 单独变更」这个缺口另记 |
| 2026-09-29 | 复核「要不要为版本错配设兼容层」→ 明确**不考虑兼容** | **改向**：删掉 `LEGACY_HOST_CAPABILITIES` 与 `ping-capability-compat.test.ts`，第 6 条改为「线格式与取值表同宽、两端同步升级」；`PlatformMeta` 的收窄保留（两端都不认退役值）。失败形态（旧插件 ping 回 `isError` 且无 `structuredContent`）已知且被接受 |
