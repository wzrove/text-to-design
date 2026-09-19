# 0010. 契约接口异步优先：新增能力签名一律 Promise

- **日期：** 2026-09-19
- **状态：** 已采纳
- **影响范围：** `shared/core/host.ts`（`DesignHost`、`PlatformOp.run`）、`ui/src/code/figma/ops.ts`、`ui/src/code/plugin.ts`（调用点不变）
- **相关记录：** 0005（能被机器守的约束不靠文档纪律）——本记录把「异步优先」钉进类型而非口头约定；0009（通用技能保持可移植）——本记录**不**落进 `software-design-patterns/SKILL.md`，理由见「候选与排除」

## 压力

两平台 typings 的异步面在扩张且**不对称**，`shared` 的窄化契约正卡在中间：

| 事实 | 数字/证据 |
|---|---|
| `@jsdesigndeveloper/plugin-typings@1.0.12` 异步面 | 20 处 `Promise`：字体（list/load）、导入（component/set/style）、`createImageAsync`、`createNodeFromJSXAsync`、`exportAsync`、`clientStorage.*`、`saveVersionHistoryAsync`、`setFileThumbnailNodeAsync`、`fetch` |
| `@figma/plugin-typings@1.137.0` 异步面 | 97 处 `Promise`（同文件口径），多出 `getMainComponentAsync` / `loadAllPagesAsync` / `createImageAsync` 等 |
| 不对称 | `getMainComponentAsync` 等被 `ui/src/code/jsdesign/sync-guarantee.ts` 登记为 `JsDesignAbsent` 并反向断言其**不在** jsDesign typings 里 |
| 本仓现状 | `DesignHost` 混声明（`createImage` 同步 / `loadFontAsync` 异步）；`PlatformOp.run` 声明为 `Promise<unknown> \| unknown` |

代价集中在最后一行：

1. **联合类型把契约交给了运气**。`run` 允许实现方返回同步值，于是「这个 op 会不会异步」无法从签名读出；
   当某个 op 需要接 `loadFontAsync` / `getMainComponentAsync` 这类只有异步变体的能力时，
   签名不用改 —— 但同步实现也不会被拦，能力差异只能靠运行时炸出来。
2. **异步能力是扩张方向，不是稳定分支**。凡涉及 I/O、字体、字节、导入、存储、发布，
   两平台 typings 都只给 `*Async`；今天按同步签名接进去的口子，明天接到异步能力就要改一遍
   契约 + 两侧 adapter + 调用点（0001 之后的管线已经吃过一次这种全链路签名churn）。
3. 不是分支/状态/耦合问题：没有 `if(type)` 增长，没有状态散落，GoF 候选基本不对应。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| **契约纪律 + 类型钉死**：新增/变更成员默认 `Promise`；`run` 收紧为 `Promise<unknown>`；同步只留给「两平台都只有同步变体 + 纯内存」 | 采用 | 调用点本就 `await`，收紧零行为变化；把约定从口头搬进类型，符合 0005「机器能守就不靠文档纪律」 |
| 把整个 `DesignHost` Promise 化（统一异步门面/代理） | 排除 | 纯内存节点构造与属性读写（createFrame / appendChild / props）会被迫全量 await 化，`shared/core` 的 execute / buildNode / props 管线要整体改签名 —— 成本远超收益，且这些成员两平台都无异步变体 |
| 保持现状 + 口头约定「新能力尽量异步」 | 排除 | 口头约定不进类型，下次加能力照样写出 `\| unknown`；与 0005 反面对齐 |
| 同步/异步双实现 + 注册表选择（Strategy） | 排除 | 没有分支增长压力；`await` 兼容非 Promise 值，语言原生能力已经够 —— 命中「停止条件：保持简单」 |
| 把规则写进 `software-design-patterns/SKILL.md` | 排除 | 该技能是可移植的通用技能（0009），写 jsDesign/figma 专属约定等于把它焊死在本仓；规则属于本仓契约，落在决策记录 + `host.ts` 契约注释 |

## 结论

**不引入模式，只定一条契约纪律并用类型守住。**

1. `DesignHost`：**新增/变更成员一律声明 `Promise<...>`**。同步只允许在「两平台 typings 都无
   `Async` 变体 + 纯内存操作」时使用（现存 `createFrame` / `createImage` / `appendChild` 等保留同步）。
   纪律写在 `host.ts` 的 `DesignHost` 注释里，编号指向本记录。
2. 底层同时存在同步与异步变体时，**选异步**：`createImageAsync` 优于 `createImage`、
   `getMainComponentAsync` 优于 `mainComponent`（jsDesign 缺的异步成员按既有缺口机制登记，不降级用同步私有字段）。
3. `PlatformOp.run` 由 `Promise<unknown> | unknown` 收紧为 `Promise<unknown>`；
   figma 侧 4 个 op（`createVariables` / `applyVariables` / `applyStyleByName` / `setComponentProperties`）
   加 `async` 关键字，返回类型改 `Promise<...>`。
4. `plugin.ts:417` 的 `await op.run(...)` 不动 —— 行为不变。

## 最小落地

- **接口所在层**：`shared/core/host.ts` 是唯一契约面；`ui/src/code/{figma,jsdesign}/host.ts` 是 adapter，
  签名跟着契约走。
- **改动清单**：`host.ts` 加 `DesignHost` 异步优先注释 + `run` 返回类型收紧；`figma/ops.ts` 四个函数加 `async`。
  共 2 个文件、6 处编辑，无新增文件、无新增抽象层。
- **一次调用时序**：不变 —— `platform_op` 分发 → `await op.run(host, params)` → `send(...)`。
  同步实现变成 resolved Promise，多一个微任务，无时序语义变化。

## 成本与退出条件

- 成本：4 个 op 的函数体其实全同步，标 `async` 属于「为契约形状付的微任务税」，可忽略；
  契约失去「这个 op 一定同步」的表达力 —— 但调用方本来就 `await`，没有任何调用点依赖同步返回。
- 退出条件：若将来某个平台出现**必须同步完成**的 op（例如必须在同一宏任务内完成、
  或插件 `onmessage` 要求同步返回），命中的具体 op 在此记录追加一行并把它单独标回
  `Promise<unknown> | unknown`，**不要**为个例放宽整条 `run` 契约。
- 反向信号：若两平台 typings 的异步面停止扩张、并开始给现有 `*Async` 补同步变体，重新评估本记录。

## 验证

- `pnpm run typecheck`（`tsc --noEmit`）：收紧 `run` 后，任何返回同步值的 op 实现都会编译报错 ——
  守门靠编译器，不靠人记。
- `pnpm run test`：不变式测试全绿（本轮不涉体积阈值，`INDEX.md` 只多一行）。
- 引擎侧实测：本轮改了 `shared/` 与 `ui/`，按仓库口径需 `pnpm build` 并在即时设计里**重载插件**
  才能验证运行产物；类型与测试只能证明契约层自洽。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-19 | 初次决策：两平台 typings 异步面扩张且不对称，`PlatformOp.run` 用联合类型掩盖了「会不会异步」 | 采用「异步优先契约 + 类型钉死 + 不引入模式」；排除「全量 Promise 化」「口头约定」「Strategy 双实现」「写进通用技能 SKILL.md」 |
