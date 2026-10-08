# 0034. 单类型 create 工具容忍并校验 type：三处口径统一加越界字段点名

- **日期：** 2026-10-08
- **状态：** 已采纳
- **影响范围：** `shared/src/schemas/batch.ts`（`call.args` 描述）、`mcp-server/src/tools/create.ts`（`nodeCreateInputSchema` + `payload`）、`mcp-server/src/core/registry.ts`（safeParse 失败出口）
- **相关记录：** 口径统一沿 [0022](0022-平台类型事实收敛为声明表，值域与适用性判定归位到-core-写路径.md) / [0032](0032-平台事实三域收敛为声明表：prompts-与工具描述共用单一投影点.md) 的「一个事实一份」；报错出口沿 [0013](0013-错误链路：保持分层边界与载荷结构化及连接确认过期检测.md)；不做「10 个工具各写一句」是因为撞 [0006](0006-工具目录体积用单点投影收敛，不引入模式.md) 的体积口径；工具面本身不动，沿 [0020](0020-平台差异不重定义工具：三档机制继续承载，建组件改由core统一带子节点.md)

## 压力

**同一个 `type` 字段，在同一套对外契约里有三种要求，且「禁止」那一处没有任何面向调用方的说明。**

| 位置 | 对 `type` 的要求 | 调用方可见性 |
|---|---|---|
| `jsd_create_frame` 顶层入参 | **禁止**（`.strict()` 拒） | ❌ 只在 `create.ts:54` 的源码注释里 |
| 同一工具的 `children[]` 内 | **必填**（`childNodeSchema`，`execute-schemas.ts:44`） | ✅ schema 里有 |
| `jsd_batch` 的 `call.args` | **无约束**（`z.record(z.string(), z.unknown())`，`batch.ts:19`） | ✅ 描述写作「该工具的完整入参」 |

于是 LLM 从 `children` 与 `batch.args` 两处学到的先验都是「节点对象要带 type」——它带 `type` 是**合理推断，不是幻觉**。而顶层禁止这条没有出口。

**失败后果**（已实测，非推测）：一次会话内同一份坏载荷被连试 5 次。`/tmp/text-to-design-mcp.log` 五条同文案、跨 09:14:52–09:19:42Z：

```
工具 jsd_create_frame 执行失败: 参数校验失败(jsd_create_frame): (root): Unrecognized key: "type"
```

模型看到 `(root): Unrecognized key: "type"` 会**整份入参重写**，而不是删掉那一个字段。

**路径已定位**（三条到达路径实验，2026-10-08）：直接调用与经 shim 的调用都**在 SDK 层就被拦下、handler 不执行、不落日志**；只有 `jsd_batch` 内层直调（`registry.ts:96` 的 `lookupExecutor` ← `batch.ts:238`）会绕过 SDK 校验落到 registry 的 zod `safeParse` —— 上面那五条日志正是这一条路径。即：**真实命中的是 batch 内层**，而报错质量最差的也是这一条。

**当前成本**：① 调用方每轮要重新发现「顶层不能带 type」；② batch 直调路径的报错不可自纠；③ 同一字段的三份口径分散在三个文件，改动时无法一眼看全。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 顶层 `type` 改「可选、但必须等于该工具固化的值」，`payload` 剔除调用方传入值 | 采用 | 三处口径收敛成「节点对象带 type，顶层可省」；带对不报错，带错精确点名；不牺牲正确性（值不等即拒） |
| 越界字段点名（从 zod shape 取允许键名） | 采用（兜底） | 单独做只治症状：`kind` / `nodeType` / `node_type` 这类变体仍要靠它，且 ① 之后它仍是唯一能解释「为什么拒」的出口 |
| 10 个工具描述各补一句「不要传 type」 | 排除 | 撞 0006 的体积口径（10 条 × 2 语言进上下文）；且 ① 之后该字段不再报错，写不写都不影响调用成功率 |
| 给 `jsd_batch` 内层调用套一层与 SDK 同序的强校验 | 排除 | batch 直调「内层工具自行校验」是刻意设计（`registry.ts:203-204`）。缺的是**报错质量**，不是校验强度；加一层会多一次全量校验 |
| 废掉单类型工具，统一回「带 type 的 ops」 | 排除 | 撞 0020 的工具面边界，且工具面已发布，调用方迁移成本远大于本次改动 |

## 结论

**不引入模式。** 三处动作，把同一字段的约束口径收成一致，并给 core 侧补一个能自纠的报错出口：

1. `nodeCreateInputSchema` 保留 `type: z.literal(<该工具类型>).optional()`；`payload` **必须**剔除调用方传入的 `type`。
2. `registry.ts` 的 `safeParse` 失败出口点名越界字段（输入源是 zod shape，不经 JSON Schema）。
3. `jsd_batch` 的 `call.args` 描述补一句内层不传 type。

## 实施方案

**目标形状（全量）**

- **① 字段口径**（`mcp-server/src/tools/create.ts`）：`nodeCreateInputSchema` 不再 `delete shape.type`，改为 `type: z.literal(type).optional()` 覆盖回 shape。`.strict()` 保留 —— 其余越界字段照拒。
  **同时修一个既有隐患**：`payload` 现在是 `{ type, ...node }`，一旦 schema 放行 `type`，调用方传的值会**覆盖**工具固化的类型（展开在后）。必须改成先剔除：
  ```ts
  const { placement, type: _frozen, ...node } = args
  const ops = [{ type, ...node }]
  ```
- **② 报错出口**（`mcp-server/src/core/registry.ts`）：safeParse 失败时，若 `def.inputSchema` 有可用 `shape`，算出「入参里有、shape 里没有」的键，报错改为点名这些键并给出可删的动作；允许键名超过阈值时只给数量，不铺全表。**依赖方向**：只用 zod（core 已依赖），**不引用 `daemon/friendly-schema.ts`** —— 那份的输入源是线格式 JSON Schema（shim 边界），core 这份是 zod shape（工具执行出口），两层各自的出口改写，不构成第二份事实，也不允许互相 import。
- **③ batch 描述**（`shared/src/schemas/batch.ts`）：`call.args` 的 describe 追加一句「内层是 `jsd_create_*` 单类型工具时不要再传 `type`，类型已由工具名固化」。
- **扩展点**：「哪些字段是工具固化的」不新增登记表 —— 由 `nodeCreateInputSchema` 的构造方式本身表达（固化字段就是被覆盖写回的那些），0022 的口径照旧：可枚举的事实才进表。

**本次不做**

- 不动 `childNodeSchema`：`children[]` 内 `type` 必填是引擎要求，保留。
- 不改工具描述（见候选表）。
- 不给 `jsd_batch` 加强校验。
- 不把 `daemon/friendly-schema.ts` 的 JSON Schema 版点名逻辑搬进 core，也不让两者共用一个 helper（输入源不同，合并会造出跨层依赖）。

## 成本与退出条件

- **成本**：`create.ts` ≈ +8 行；`registry.ts` ≈ +25 行（一个纯函数 + 分支）；`batch.ts` 一句描述；无新增间接层、无新增 I/O、无状态。工具目录体积增量 ≈ 一句话（0006 门禁不受影响，`catalog-budget.test.ts` 守）。
- **退出条件**：
  1. 宿主哪天在客户端侧统一拒 extra key（或 SDK 把校验前移到声明面）→ ② 的出口失去价值，删掉即可，① 保留；
  2. 单类型 create 工具族哪天被 ops 通道取代 → 本记录整体作废（沿 0020 的边界重判）。

## 验证

- **不变量测试**（新增 `packages/mcp-server/src/__tests__/create-args.test.ts`，8 例，全过）：
  - 顶层 `type` 等于固化值 → 放行；不等于 → 拒且报错路径落在 `type`（回归「整份重写」的诱因）；
  - `.strict()` 未被整体放宽：越界字段照拒；
  - `children[]` 内的 `type` 不受顶层口径影响（通道内仍必填）；
  - `describeInvalidArgs` 点名越界字段并给出可删动作；无越界字段时**原样退回**原始 detail（缺必填等场景不改写）；
  - 直调 executor（复刻 batch 内层路径）带对 `type` 走通，且 op 里只有一个 `type`（payload 剔除的回归）；
  - 直调 executor 带错 `type` → 在 registry 出口即拒，**不向插件发往返**。
- **端到端（2026-10-08，daemon 重启后跑 17:42 产物，pid 38566）**：
  | 用例 | 结果 |
  |---|---|
  | wire 声明 | `properties.type = {"type":"string","const":"FRAME"}`、`additionalProperties: false`、propCount 47 ⇒ 放行且未整体放宽 |
  | 直连带 `type:'TEXT'` | `type: Invalid input: expected "FRAME"` |
  | 直连带越界 `kind` | SDK 层 `Unrecognized key: "kind"`（该层文案本次未动，属预期） |
  | **batch 内层**带越界 `kind` | **core 出口点名**：`字段 [kind] 不被该工具接受,请删掉后重试(其余字段本身合法)。该工具接受 47 个字段…` ⇒ 正是本次要替换的形态（改前为 `(root): Unrecognized key`） |
  | **batch 内层**带错 `type` | `type: Invalid input: expected "FRAME"` |
  | **batch 内层**带对 `type` | 通过全部校验，止于 `请求被拒(插件未连接)` ⇒ 校验层不再拦合法用法 |
- **回归**：`pnpm run typecheck`、`pnpm test`（27 文件 / 266 例）、`pnpm build`（jsDesign / Figma / MasterGo 三平台 + mcp 产物）全过。
- **真机复验（2026-10-08，**Figma** 客户端 + 插件重载；测试节点已删净、`jsd_find` 复核 0 条）**：
  | 用例 | 结果 |
  |---|---|
  | 不带 `type` 直连建 | 建成 `FRAME`（id 27:247） |
  | 带对 `type:'FRAME'` 直连建 | 建成 `FRAME`（id 27:248） |
  | **`jsd_batch` 内层**带对 `type` | 建成 `FRAME`（id 27:249）⇒ **log 里那 6 条失败的路径现在通了** |
  | `jsd_batch` 内层带错 `type` | `参数校验失败(jsd_create_frame): type: Invalid input: expected "FRAME"` |
  | `jsd_batch` 内层带越界 `kind` | 点名：`字段 [kind] 不被该工具接受,请删掉后重试…本次收到的 [type, kind, name] 里只有上述字段越界` |
  | 回读三个节点 | `type` 全为 `FRAME`、尺寸全 60×40 ⇒ 三条路径产出一致 |
- **待验**：jsDesign / MasterGo 两个客户端各跑一遍同一组用例（本次环境只连了 Figma；判定逻辑与平台无关，但按纪律不替另两平台记「已生效」）。
- **指标与日志**：沿用 `registry.ts` 的 `error()` 出口，不新增日志通道；真机确认新文案已进日志，可直接用于自纠。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-08 | 初次决策 | 采用「顶层 type 可选 + 值校验」「越界字段点名」；排除「10 条描述各写一句」「batch 内层加强校验」「废单类型工具」 |
| 2026-10-08 | 落地与验证 | 结论不变。补一条**实现期发现**：`payload` 的 `{type, ...node}` 展开顺序会让调用方传入值覆盖固化类型 —— 虽然新口径下 schema 已保证「值相等」使覆盖无害，仍按防御性剔除（口径若放宽即为静默串味）；该行为由单测锁定 |
| 2026-10-08 | 真机复验（Figma） | 结论不变。三条到达路径产出**完全一致**的 `FRAME`（含此前 5 次失败的那条 batch 内层路径）；两句新报错文案在真机确认可用。jsDesign / MasterGo 待切客户端补验，不替其记「已生效」 |
