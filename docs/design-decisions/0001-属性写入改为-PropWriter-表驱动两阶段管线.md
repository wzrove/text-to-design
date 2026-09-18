# 0001. 属性写入改为 PropWriter 表驱动两阶段管线

- **日期：** 2026-09-18
- **状态：** 已采纳
- **影响范围：** `packages/shared/src/core`（update.ts / buildNode.ts）、`packages/ui/src/code/plugin.ts`、`packages/mcp-server/src/tools/props.ts`
- **相关记录：** 依赖 0002（可测性前提）、配合 0004（写后校验）

## 压力

创建与修改是两条独立写路径，各自实现了一份约 200 行的属性赋值：

- `shared/src/core/buildNode.ts:121-333`（创建）——带默认值与推断：P10 清灰底、`PROP` 缺失时 copying、P18 padding 归零 + sizingMode FIXED 推断 + 两次 `applySize`。
- `shared/src/core/update.ts:22-231`（修改，含 `applyProps`）——纯增量覆盖，`if (x != null && 'x' in node)` 平铺。

字段集合约 80% 重叠，但语义**刻意不同**（默认值 vs 增量），所以抽一个公共函数会丢失语义差异 —— 差异在策略层面。

变化代价已实测：加一个属性要改 5 处

| # | 位置 | 事实 |
|---|---|---|
| 1 | `schemas/split-ops.ts` | `*Props` 字段表（已作为唯一源，`PROP_METHOD_FIELDS` 由它派生） |
| 2 | `dicts/prop-applicability.ts` | 手写「字段 → 适用节点类型」表 |
| 3 | `core/update.ts` | 修改路径赋值 |
| 4 | `core/buildNode.ts` | 创建路径赋值 |
| 5 | `tools/props.ts` description + `ui/src/code/plugin.ts:164-175` | 11 个 prop-method `case` 分支；另有 `index.ts:74-86` 的 `PropParamsByMethod` 与 `index.ts:133-166` 的 `PluginRequest` 两处同名枚举（共 4 份 11 项方法名名单） |

变化频率有证据：P18 在 `buildNode.ts` 改了 3 处，P31 同时改 `update.ts:430` 与 `buildNode.ts:309`。这不是假想扩展。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| Strategy Registry（表驱动 `PropWriter[]`） | 采用 | 两条已存在的真实写路径 = 两个实现；字段组边界稳定且互不感知；注册表可取代 2、5 两处手写事实 |
| Template Method | 排除 | `bridgeTool` 已在用且用对了；套一层到属性写入会把差异变成一堆空实现的钩子方法 |
| Builder | 排除 | 输入是节点树而非构造参数，`buildNode` 递归已足够 |
| Decorator | 排除 | 回填/回压有严格顺序依赖且互相知晓状态（`applySize` → `ensureLayoutMode` → sizingMode 再压），包装顺序难理解 —— 正是它的反面场景 |
| Visitor | 排除 | `NodeSkeleton` 是鸭子类型收窄，加 `accept()` 需改两侧 adapter；没有稳定类型层级需要双分派 |
| 保持简单（抽公共函数） | 排除 | 已尝试式审查：两条路径语义不同（默认值 vs 增量），合并会退化成到处传 `if (isCreate)`，反而更难读 |

## 结论

**Strategy Registry**（数据 + 行为表），不是 GoF 类层次 —— TS 里一张 `readonly PropWriter[]` 就够，不需要 interface + 多实现。

```ts
export interface WriteCtx {
  host: DesignHost;
  node: NodeSkeleton;
  src: Readonly<Record<string, unknown>>;   // 已归一化，只读
  outcome: WriteOutcome;                     // 见 0004
  defaults: DefaultPolicy | null;            // 创建路径非 null；修改路径为 null
}

export interface PropWriter {
  readonly keys: readonly string[];              // 取代 PROP_METHOD_FIELDS 手抄
  readonly appliesTo?: readonly NodeTypeKey[];   // 取代 dicts/prop-applicability 登记
  write(ctx: WriteCtx): void | Promise<void>;
  settle?(ctx: WriteCtx): void | Promise<void>;  // 布局重算后的回压，承载 P18 / P31
}
```

## 最小落地

- 角色与职责：`geometryWriter / paintWriter / strokeWriter / radiusWriter / shapeWriter / textWriter / layoutWriter / effectWriter / supersetWriter` + `defaultsWriter`（仅创建路径）
- 接口所在层与依赖方向：`shared/src/core/props/*`；依赖 `DesignHost`（向内），不依赖任何 adapter
- 创建与装配位置：唯一装配点 `shared/src/core/props/writers.ts`

  ```ts
  export const BASE_WRITERS = [geometry, paint, stroke, radius, shape, text, layout, effect, superset];
  export const CREATE_WRITERS = [...BASE_WRITERS, defaultsWriter];
  export const UPDATE_WRITERS = BASE_WRITERS;
  ```
- 一次调用时序：`runWriters(node, src, writers, ctx)` → phase 1 逐个 `write()` → phase 2 逐个 `settle()` → 产出 `WriteOutcome`

派生关系（关键收益）：

- `dicts/prop-applicability.ts` 从 writers 反查生成，不再手写
- `plugin.ts` 的 11 个 `case` 收敛为一个分支 `if (Object.hasOwn(PROP_METHOD_FIELDS, method))` —— 该写法 `mcp-server/smoke-split.ts:33` 已在用，不是新发明
- 分批顺序：text → layout → 其余 6 个机械搬运 → 删 `applyProps` 与 `buildNode` 属性段

## 成本与退出条件

- 成本：新增 `core/props/` 一个目录 + 两张表；两条路径各多一次表遍历（~9 项，可忽略）；无新 I/O、无新持久化状态
- 退出条件：若未来只剩一条写路径且字段组不再增长 → 回退为两个直写函数；判定点写在 `writers.ts` 顶部注释
- 反向保险：禁止为单个字段建 writer（如「只有一个字段的 writer」），发现即合并

## 验证

- 不变量测试（依赖 0005 落地 Vitest 后）：
  - 同一 property key 在 CREATE / UPDATE 下的行为差异必须是**显式声明**，禁止退化为隐式的执行顺序依赖
  - 11 组字段零重叠（沿用 `smoke-split.ts` 已有断言）
  - `keys` 并集 ⊆ `UpdateNodeProps` 键集；`appliesTo` 与 `PROP_APPLICABILITY` 派生结果恒等
- 边界用例：每个 writer 三个用例（命中 / 类型不适用 / 字段缺省）
- 回归：`update.ts:430` 与 `buildNode.ts:309` 的 layoutMode 回读重试行为必须有用例覆盖（P18 / P31）
- 指标与日志：`settle()` 中的自动回压写一条 debug 日志（含 key、期望值、压回值），否则「写成功了但被改回来」永远排不出来

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-18 | 初次决策 | 采用 Strategy Registry（表驱动 PropWriter 两阶段管线） |
| 2026-09-18 | 落地后复核 | 结论不变。实际拆出 8 个 writer（passthrough / geometry / paint / radius / shape / text / layout / superset）+ createStabilize；`buildNode.ts` 337→154 行、`update.ts` 513→318 行。创建路径因「布局属性必须晚于插子节点」不能一趟跑完，故导出 `writePhase` 与 `settleWriters` 让调用方显式分两段——两阶段管线的形状没变，只是阶段边界由调用方划定 |
