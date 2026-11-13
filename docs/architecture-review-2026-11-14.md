# text-to-design 架构评审（代码为准）

范围：`packages/{mcp-server,shared,ui}` 三个包，约 1.5 MB / 236 个源文件。全部结论基于实读源码与仓库内实测计数；标 `待验` 的条目我没能坐实，明确区分。

前置：仓里已有 41 条设计决策记录（`docs/design-decisions/`），本文只写**现有记录没覆盖、或记录自身判断已被代码证伪**的部分。已被记录裁定为"不引入模式"的，本文不重开。

---

## 0. 结论摘要

三个包的**分层方向是对的**：`ui` 与 `mcp-server` 全部走 `text-to-design-shared` 包入口，零子路径 import（71 处 import，0 处子路径），跨包耦合只靠协议 + 根目录 roundtrip 测试。真正的问题不在分层，在**同一条事实被多处各写一遍**，以及**已经死掉的代码还在充当"单一投影点"**。

按性价比排序的 6 个动作：

| 优先级 | 动作 | 收益 | 成本 |
|---|---|---|---|
| **P0** | mcp-server：删 5 个死导出 + 修 2 条永不触发的提示分支 | 42.6 KB 文件缩一半；reparent 提示真的会响 | 极低，纯删除 |
| **P1** | mcp-server：`core/registry.ts` 拆三个文件，解循环依赖 | 同时是 god module 与唯一循环 | 低，纯挪文件 |
| **P2** | shared：`ExecuteOp` 手写接口改 `z.infer` 派生 | 消掉"四份手写对象形状" | 中，需编译期断言收尾 |
| **P3** | ui：三份 `sync-guarantee` 的类型工具合并 | 实测 61% 行重复 | 低，纯类型零运行时 |
| **P4** | mcp-server：`catalog-proxy` 四份 diff-sync 收敛为一个泛型 | 约省 200 行 | 低 |
| **P5** | shared：`DesignHost` 拆必选核心 + 能力面 | 消掉 15 处 optional 探测 + 2/3 平台 `as unknown as` | 高，跨包 |

---

## 1. 跨包结构（实测）

```
                ┌─────────────────────────────┐
   ui (574K) ───►  text-to-design-shared (886K) ◄─── mcp-server (498K)
   bridge/*       顶层: panel/connection/panel-* 通道   core/  transport/pending
   code/<P>/       core/: DesignHost + 平台无关逻辑      tools/ 15 个 registrar
   components/     schemas/: zod 线格式(唯一真源)        daemon/ 进程编排
                   dicts/: 静态字典 + i18n catalog
                └─────────────────────────────┘
                            ▲
                    shared 无运行时依赖，全部是 vite 内联合并
```

**证实的干净边界**（不是评价，是可复现的检查结果）：

- `mcp-server/src` 与 `ui/src` 中 71 处 `from 'text-to-design-shared'`，**子路径 0 处**，全部走包入口。
- `mcp-server` 对 `ui` **零 import**，耦合只有两条协议（WS 帧 + `pending.ts` 的二进制合并），且 `pending.ts:258-262` 明说 roundtrip 测试放在仓库根。
- `shared/src/schemas/` 不 import `../core`（0 处），`schemas → dicts` 单向，无环。

**证实的边界违规**（各自一句）：

1. `mcp-server/tools/session.ts:12` `import { getSkillsStatus } from '../daemon/skills'` —— 工具层反向依赖进程编排层。
2. `mcp-server/core/registry.ts:146`、`core/schema` 相关处直接读 `platform-state` 模块单例，而不是走 `buildServer` 注入（`server.ts:20` 只收 `bridge`）。
3. `shared/core/host.ts` 把 `NodeSkeleton` / `DesignHost` / `StyleSummary` / **`PlatformOp` + `PlatformMeta`(插件装配契约，不属于宿主)** 四种东西塞在一个 509 行文件里。
4. `shared/index.ts:1-29` 与 `core/index.ts`、`schemas/index.ts`、`dicts/index.ts` 全是 `export *`，打开包入口等于把 `messages.zh-CN`(60 KB) 与 `platform-knowledge`(41 KB 中文字符串)一并拉进 bundle。
5. `ui/src/code/{figma,jsdesign}/host.ts` 用 `as unknown as DesignHost` **整包断言**接入契约，只有 `mastergo/host.ts` 做真实投影 —— **同一条接口两种保证强度**。

---

## 2. P0 — mcp-server 里有两类"看起来很活、实际是死的"代码

### 2.1 五个死导出撑着 42.6 KB 的文件

`tools/platform-facts.ts` 文件头（`:16-22`）自述"拼句子的地方恰好有两处：① 工具描述 ② 配方 prompt"。**第 ② 处已经不存在** —— `tools/prompts.ts:18-30` 现在明说"渲染函数已删除，正文唯一来源是 `references/<id>.md`"。

实测（全局 grep，含 dist 与 md）：

| 函数 | 定义行 | 唯一消费者 | 结论 |
|---|---|---|---|
| `variantStrategyText` | `:59` | `components.ts:166` | 活 |
| `componentWriteText` | `:116` | `components.ts:25`, `platform.ts:30` | 活 |
| `variableFaceText` | `:162` | `platform.ts:12` | 活 |
| `componentFaceText` | `:379` | `platform.ts:10` | 活 |
| `variableBindBulkText` | `:215` | **无** | 死 |
| `variableBindVerifyText` | `:226` | **无** | 死 |
| `variableBindShapeText` | `:243` | **无** | 死 |
| `reuseGuideText` | `:270` | 仅根测试 `tests/platform-knowledge.test.ts` | 死的产品代码 |
| `resourceRelationText` | `:315` | 同上 | 死的产品代码 |
| `layoutHintText` | `:406` | **无** | 死 |

> 这些名字在 CHANGELOG 里还被引用（`mcp-server/CHANGELOG.md:85`、`:112`），说明它们曾经活着。

**代价不是"多几行"，是它会诱导后续改动继续往这里加句子** —— 文件名叫 "facts"，注释说"单一投影点"，于是没人会删。修法：删 5 个死导出，保留 4 个活的；`resourceRelationText` / `reuseGuideText` 要么接回某个工具描述或资源描述，要么连根测试一起删。剩 4 个函数再抽 `byPlatform(platform, {mastergo, figma, jsdesign, fallback})` 吃掉重复的 6 次 `switch`。

### 2.2 `jsd_reparent_nodes` 的防平铺提示永不触发

`tools/nodes.ts:213-228`：

```ts
extraContent: (_data, args) => {
  const single = args as { parentId?: unknown };
  const hit = detectFlatBatch([{ parentId: single.parentId }]);   // ← 恒传 1 个元素
  if (hit != null) { ... }
  return [];
}
```

而 `core/structure-hint.ts:78` 的判据是 `projected >= CROWDED_CHILDREN_THRESHOLD`（=9），`projected = batchCount + existing`：

- 单元素数组 → `batchCount` 恒 = 1
- 调用方**没传** `existingChildCount` → `projected` 恒 = 1

**`hit` 恒为 `null`，整个分支是死的。**

更糟的是三处注释在互相打脸：`structure-hint.ts:43` 说"数**本批**有多少步指向同一个 parentId"、`nodes.ts:209-210` 说"实测的失败形态是『建一个、reparent 一个』循环几十次"、`structure-hint.ts:55` 说"单步 reparent 拿不到『这批几次』的信息 —— 它是第 N 次调用"。三条注释分别对应三种不同的现实，代码对任何一种都不满足。

这是 `reparent` 最常见失败形态（往同一父级平铺几十次），提示就是为它写的，而它永远收不到。修法二选一：把真实批次传进来（batch 层有 calls 列表），或调用时带上 `existingChildCount`（但那要一次额外往返）。

### 2.3 `platformNote` 是已经写错语义的字段

`core/registry.ts:396-399`：

```ts
description: def.platformNote == null
  ? t(def.description)
  : t(def.description) + t(def.platformNote)
```

`def.description` 对**大多数**工具是 i18n key（`props.ts:63` 等），`t()` 正常出文案。但凡是带 `platformNote` 的工具，`description` 写的是**裸中文长串**（`nodes.ts:76`、`create.ts:197`、`platform.ts:30`），`t()` 返回原串 —— 功能上"碰巧能用"，语义上是第二套约定。

而 `platformNote` 在 `platform-state.ts:40` 注释里的定义是"平台不适用时作为替代路径提示"，**那个语义从未被执行**：真正生效的是 `nodes.ts:153` 自己又拼进 description 的一句中文。

修法：把 `platformNote` 钉成"替代路径提示"、只被 `describePlatformGate` 消费；注册期拼接改走显式 `descriptionSuffix?: MessageKey`；`BridgeToolDef.description` 类型收窄成 `MessageKey`，让裸中文在编译期报错。

### 2.4 顺带的三个小确证

- `daemon/compact-schema.ts` 全文 1 行 62 字节纯转发，唯一消费者是 `__tests__/catalog-budget.test.ts:10`。删文件、改测试 import 路径即可。
- `tools/prompts.ts:171` 的 `currentPlatform()` 全仓无人 import。
- `core/registry.ts:21-26` 的 `ToolHandle.enable/disable/alwaysEnabled` 除定义外**零调用**；`core/tool-catalog.ts:66-71` 更给出空函数实现。注释说"供插件离线时动态 disable"，但 `index.ts:15-22` 明说 0030 之后"那条广播从没有过内容"。这是死 API，不是设计。

---

## 3. P1 — `core/registry.ts`：唯一循环 + god module

412 行里 `executeTool`(`:268-388`) 一个人干了：平台门控、入参校验、超时、`before/after` 钩子、warnings 汇总、activity 推送、结果投影七件事。

循环依赖可指认：`core/response.ts:4` `import type { FollowUp } from './registry'` —— `FollowUp` 是结果协议的一部分，定义却在工具定义文件里。

**并且** `core/registry.ts:138-166` 的 `describeInvalidArgs` 与 `daemon/friendly-schema.ts:98-169` 的 `unexpectedKeys` 是同一份"越界字段点名"逻辑的两份实现 —— `:132-134` 的注释自己承认，给出的理由是"合并会造出 core→daemon 的反向依赖"。**这个理由是对的，但它证明的是"位置错了"**：这段逻辑既不该在 `core`（工具出口）也不该在 `daemon`（shim 入口），它是个 zod-shape 到人话的纯转换。

拆分方案（不引入模式，纯移文件）：

- `core/tool-def.ts` — `BridgeToolDef` / `ToolHints` / `FollowUp` / `ToolTag` / `ToolExecutor`（`:21-219` 的 170 行类型）
- `core/tool-exec.ts` — `bridgeTool` / `executeTool`
- `core/schema-error.ts` — `describeInvalidArgs` + `allowedTopKeys`，被 `friendly-schema.ts` 复用

副作用：`FollowUp` 挪进 `response.ts` 后 `response → registry` 消失。改 `executeTool` 的钩子顺序这件事，从"要在一份 412 行文件里小心"变成"改一个 200 行的文件"。

---

## 4. P2 — shared：对象形状四份手写，派生类型零消费

`schemas/execute-schemas.ts:23-34` 有 `ExecuteOpFromSchema = MergeUnion<z.infer<...>>`，**唯一用途是给 `:44` / `:450` 的 `z.ZodType<ExecuteOp>` 当泛型参数**。全仓 grep：只有定义处。

也就是说：派生类型**造出来了、没用上**，也**没有断言**"手写 `ExecuteOp` 与派生版本互相兼容"。漂移是静默的。

漂移已经发生，但不是子代理报的那条（我复核过，`layoutGrow` 那条是**误报**：它在 `execute-schemas.ts:249` 的 `autoLayoutFields` 里，子代理查错了字段组）。真实的一处是 **`textTruncation` / `maxLines`**：

- `core/host.ts:172-173` 声明了这两个成员
- `core/serialize.ts:486-490` 序列化它
- `core/props/writers.ts:956-963` 通过 PASSTHROUGH 写它
- `schemas/execute-schemas.ts` **完全没声明** → 创建路径传这两个字段会被 `.strict()` 拒

修法：删 `schemas/execute-op.ts:25-94` 的 68 行手写接口，改 `z.infer`；加一条编译期双向断言把两者绑死。这一刀消掉的是**整个对象形状漂移种群**，不只是 `textTruncation` 一条。

同源问题还有三处值得一提：

- `schemas/serialized-node.ts:41-135` 手写接口 + `:137-246` 同字段再抄一遍 zod + `core/host.ts:13-212` 再抄一遍 —— **三处手写同一份 40 字段清单**。
- **43 处内联 `z.enum([...])`** 绕过 dicts 真源：`serialized-node.ts` 15 处、`execute-schemas.ts` 14 处、`shared-props.ts` 12 处、`base.ts` 6 处。**且同一个枚举两种写法**：`shared-props.ts:205` 用 dicts 的 `PRIMARY_AXIS_ALIGN_VALUES`，`serialized-node.ts:204` 与 `execute-schemas.ts:242` 各自内联。加一个对齐值要改 4 处。
- `core/export.ts:16-20` 为规避循环，在本地重新推导一份 `ListFontsParams`，而根 `index.ts:57` 已经导出同一类型。

---

## 5. P3 — ui：三平台重复不是"各平台差异"，是"同一流程抄三遍"

实测办法：去注释、压缩空白后的行级多重集比对。

| 对比 | 结果 |
|---|---|
| `figma/sync-guarantee.ts` ↔ `jsdesign/sync-guarantee.ts` | 共同导出名 14 个；**行覆盖率 61.3% / 48.3%** |
| `figma/host.ts` ↔ `jsdesign/host.ts` | 58 / 57 有效行，**73% 逐字相同**；`jsdesign/host.ts:24` 注释自述"与 figma/host.ts 镜像对称" |
| `figma/ops.ts` ↔ `mastergo/ops.ts` | 跨文件重合 422 行；`resolveNodes` 各抄 5 处；`collectionName ?? 'Variables'`(`figma:360` vs `mastergo:1152`)逐字同；失败条目形状 `{id, reason: e instanceof Error ? e.message : String(e)}`(`figma:187-189` vs `mastergo:1588-1590`)逐字同 |

**这 61% 不是平台事实**：`KeysOf / ExpectNever / Missing / Declared / ExtraKeys` + `WireSolid…BlurKeyCheck` 7 条，是**通用类型工具**，与 Figma/jsDesign 各自的 typings 无关。

**该抽的**：`code/shared-guarantee.ts`（纯类型、零运行时、`tsc --noEmit` 即验证）。
**该留的**：`NodeTypingsGap` / `JsDesignAbsent` / `KEY_TO_MG` 反向断言 —— 这些是"某平台 typings 里确实没有某个符号"，只对该平台成立。

注意：`jsdesign/ops.ts` 只有 246 行、1 个 op，**它不是第三份**，把它算进"三份重复"会虚高重复率。

### 该明确不动的部分（现有记录已裁定，我复核后同意）

- 三个 `meta.ts` 的 `capabilities` 数组：每个位都挂真机复验证据（`jsdesign/meta.ts:8-27` 记 4 条复验链）。抽成配置表 = 把证据从代码里拿掉。
- `code/<P>/ops.ts` 里那些 1000+ 字符的 op `description`：那是写给模型的口径说明（"别混着传"、"本平台没有这个读面"），抽模板必然丢信息。
- `mastergo/node-facade.ts:51-133` 的映射表本体：逐条 typings 证据。

**反向的一条结论**：不建议给 figma 也造一个 node-facade —— Figma 节点结构本来就满足契约，没有可投影的东西，强造一层只是复制 mastergo 的形。真正的问题是"宿主投影这件事没有既定接缝位置"，见 §7。

---

## 6. P4/P5 — 剩下的收敛点（简述，各有实证）

| 位置 | 问题 | 修法 |
|---|---|---|
| `daemon/catalog-proxy.ts:140/237/280/324` | `syncTools`/`syncPrompts`/`syncResources`/模板 四段是同一个 diff 算法抄四遍；且四个 `known.handle.remove()` 都在新注册**之前**执行（`:191/:247/:294/:331`），注册失败时该工具在中间窗口从下游目录消失 | 抽泛型 `syncRegistry<T>`；先注册成功后移除，失败保留旧句柄 |
| `core/component.ts:939-954` | `overrideCache` 是 **core 层的模块级可变 Map**，与 `core/runtime.ts:5-20` 明说的"赶走单例"原则冲突 | 移到调用方或经 `RuntimeContext` 注入 |
| `core/component.ts:502-506` ≡ `:587-592` | 5 行中文 throw 逐字重复，两个分支逻辑等价 | 提成一个函数 |
| `core/execute.ts:140` ≡ `core/props/writers.ts:790` | 同一句提示文案逐字重复 | 提成常量 |
| `daemon/run.ts:373` / `exec.ts:32` / `run.ts:418` / `run.ts:58` | "探测 → spawn → 轮询 → 超时" 四份实现 | 收到 `daemon/probe.ts` 的 `awaitReady` |
| `daemon/service.ts:180-225` | `planFor` 与 `uninstallPlan` 各自 `process.platform` 三分支，路径常量写两遍 | 抽 `servicePath(kind)` |
| `tools/batch.ts:554-559` | 内层工具失败靠 `text.slice(0,300)` 取中文句子做错误 | `core/response.ts` 的 `err()` 加 `code` 字段，`batch` 读 code 分类 |
| `tools/batch.ts:488-500` | `loadAssets` 吞掉 `bridge.request` 异常 → "插件连不上"被报成"画布上没这个组件" | `core/` 加单一 `getPageAssets(bridge)`，两种失败文案分开 |
| `shared/core/nodes.ts:103-113` 与 `writers.ts:103-113` | `LAYOUT_PRESERVE_KEYS` 9 个键出现三份 | 收进 `dicts/layout-fields.ts` |

---

## 7. P5 — 唯一的架构级建议：`DesignHost` 该拆了

`shared/core/host.ts:271-478`，208 行，其中 **15 个 optional 成员**，每一个都对应一条平台差异（`ungroup?` MG 两级 API 都没有；`getNodeByIdAsync?` jsDesign 无此符号；`getLocalVariablesAsync?` jsDesign 完全没有；`ui.chromeHeight?` 仅 MG 有）。

因果链是闭合的、有注释为证：

1. 契约暴露 optional 成员 → core 只能 `typeof host.xxx === 'function'` 探测（`access.ts:36/105/154/196/258` 五处）
2. 探测在某平台返回**错误答案**（`access.ts:89-98`：jsDesign 未声明的 `getMainComponentAsync` 运行时存在且永不 settle）
3. 于是引入 `mainComponentSync` / `styleEnumerationSync` 两个能力位**去覆盖探测结果**
4. 能力位需要 `RuntimeContext` 一路透传 → `access.ts:100-118` / `:190-243` 变成"先查能力、再决定问哪个入口"

**这不是一处 bug，是一条已经付了两次代价的架构债。** 拆法：

```ts
interface DesignHostCore { /* 三平台必选，非 optional */ }
interface DesignHostAsync { /* 有 async 变体的平台才实现 */ }
```

core 只依赖 `DesignHostCore` + `RuntimeContext.capabilities`，探测从 5 处降到 1 处，覆盖型能力位可以逐步退场。同时 `figma/host.ts:34` 与 `jsdesign/host.ts:31` 的 `as unknown as DesignHost` 可以退成 `satisfies`。

**成本最高的一条**（跨 shared + ui 两包，且要三平台重载验证），所以我把它放最后 —— 但没有它，§5 的"三平台保证强度不可比"会一直存在。

---

## 8. 明确反对的重构（防止下次有人提）

| 提议 | 反对理由（有代码依据） |
|---|---|
| 抽 shared 的错误文案到 i18n | `core/` 有 97 处 `new Error`、**0 次 `t()`**；`tests/i18n.test.ts:300-312` 的白名单里 `core/` 与 `schemas/` 整段豁免。这不是"迁移没做完"，是**记录里的口径就是不做**。真要改是产品决策，不是重构。 |
| 给 figma 补 node-facade | Figma 节点结构满足契约，无可投影内容。见 §5。 |
| 把 App.tsx 拆成多个子组件各取 context | ui 侧 5 处 `useBridge()` 已证明 context 可用，不存在 prop drilling；壳再拆只会让 `panelPhase` 这类贯穿 `inert`+高度同步的状态更难追。可做的是抽 `useEscapeKey`（`App.tsx:181/224/240` 三份逐字重复的 Esc effect，且 `LogDrawer.tsx:241` 又注册一份，双击）。 |
| 把两个 `jsd_manage_*` 删除当作"架构优化" | 已由 `4d4e2570` 评估：只省 15.8 KB / 58→56 个工具。真正的体积在 10 个 per-type create 工具（213 KB），已由 `3f364c28` 用双档解决。 |
| 重建工具注册框架 / 通用 dispatch | 现有固定目录已能装配，新框架不解决任何已列问题。 |

---

## 9. 建议执行顺序

1. **§2 全部**（删 5 个死导出、修 2 条死分支、改 `platformNote` 类型）—— 纯删除 + 类型收窄，无行为风险，是唯一"做完立刻变简单"的一批。
2. **§3** `registry.ts` 拆三个文件 —— 解循环，为后续钩子改动降风险。
3. **§4** `ExecuteOp` 改派生 + 编译期断言 —— 需要真机验一次 `textTruncation` 创建路径。
4. **§5** `sync-guarantee` 共用类型工具 —— 纯类型，`tsc` 即验证。
5. **§6** 逐条收敛，独立小 PR。
6. **§7** `DesignHost` 拆分 —— 单独立项，需要记录。

> 仓规：改 `shared/` 或 `ui/` 要 `pnpm build` + 对应平台客户端重载插件；改 `mcp-server/` 还要重启常驻 daemon（`ps aux | grep mcp-server/dist/index.js` 找那个老进程）。本文未跑 test / lint / build，全部结论来自静态代码阅读与仓内 grep 计数。
