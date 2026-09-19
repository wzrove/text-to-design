# 设计模型评审：mcp-server / ui / shared

日期：2026-09-18 · 范围：`packages/mcp-server`、`packages/ui`、`packages/shared`（16.5k 行）

---

## 0. 现状骨架（先说清楚已经做对的）

| 层 | 现有形态 | 评价 |
|---|---|---|
| 平台抽象 | `DesignHost` / `PageSkeleton` / `NodeSkeleton` 窄接口 + 两处一行式 adapter（`figma/host.ts`、`jsdesign/host.ts`） | 已经是正经 Port/Adapter，且用 `sync-guarantee.ts` 做编译期契约断言。别动 |
| 事实字典 | `shared/dicts/*`（capability / prop-applicability / node-type / boolean-operation） | 已经完成一轮「不再手抄」收敛。方向对，但只收到「数据」，没收「行为」 |
| 工具层 | `bridgeTool(def)` 声明式工厂：平台门控 → 入参校验 → 派发 → `structured()/err()` 统一兜底 | 良性 Template Method 管道。`method` / `payload` / `run` 三选一互斥，够用 |
| 编排层 | `executors` 注册表 + `jsd_batch` 按名直调执行体 | Command 该有的形状已经在：MCP 回调与 batch 编排共用同一个执行体 |
| 传输层 | `Bridge`（server 侧）= `Transport` + `PendingManager`；`BridgeSocket`（ui 侧）= `Scanner` + `ConnectionManager` + `Router` | Facade 边界清晰，连接状态推进有单一出口（`setStatus`） |
| 可靠性 | takeover + 关闭码双路径、心跳确认、握手超时、退避扫描、离线日志环形缓冲 | 已经覆盖了真实故障面，注释质量高 |

结论：**骨架没问题，压力集中在「写路径」和「跨切面补偿」两处。**

---

## 1. 主压力：两条写路径各写一遍属性赋值

### 证据

- `shared/src/core/update.ts:22-231` — `applyProps`，修改路径，约 200 行 `if (x != null && 'x' in node)`。
- `shared/src/core/buildNode.ts:121-333` — 创建路径，另一份约 200 行等价结构。
- 字段集合约 80% 重叠，但语义**刻意不同**：创建路径带默认值与推断（P10 清灰底、`PROP` 缺失时 copying / P18 padding 归零 + sizingMode FIXED 推断 + 两次 `applySize`），修改路径是纯增量覆盖。所以**不能简单抽公共函数**，差异在策略层面。
- 「每加一个属性要改 5 处」：
  1. `shared/src/schemas/split-ops.ts` 的 `*Props` 字段表
  2. `shared/src/dicts/prop-applicability.ts`
  3. `shared/src/core/update.ts`
  4. `shared/src/core/buildNode.ts`
  5. MCP 工具 description（`tools/props.ts`）+ `ui/src/code/plugin.ts:165-175` 的 `case` 方法名单（第三份 `PropMethod` 事实）
- 变化频率有实测证据：P18 在 `buildNode.ts` 改了 3 处，P31 同时改了 `update.ts:430` 与 `buildNode.ts:309`。这是已经产生成本的变化轴，不是假想扩展。

### 主模式：Strategy + Registry（`PropWriter` 表驱动管线）

不是引入 GoF Strategy 类层次，而是把现有「字典」 idiom 往前推一格：**从数据字典升级为「数据 + 行为」注册表**。TS 里一张 `readonly PropWriter[]` 就够，不需要 interface + 多实现。

```ts
// shared/src/core/props/types.ts
export interface WriteCtx {
  host: DesignHost;
  node: NodeSkeleton;
  /** 本次请求实际携带、已归一化的字段;只读 */
  src: Readonly<Record<string, unknown>>;
  /** 写入反馈收集器 */
  outcome: WriteOutcome;
  /** 创建路径专用默认策略;修改路径为 null */
  defaults: DefaultPolicy | null;
}

export interface PropWriter {
  /** 本组负责的字段 —— 取代 PROP_METHOD_FIELDS 与 plugin.ts case 名单的手抄 */
  readonly keys: readonly string[];
  /** 适用节点类型;空 = 不限 —— 取代 dicts/prop-applicability 的单独登记 */
  readonly appliesTo?: readonly NodeTypeKey[];
  write(ctx: WriteCtx): void | Promise<void>;
  /** 写在引擎之后执行的稳定化(重算回压),对应 P18 / P31 */
  settle?(ctx: WriteCtx): void | Promise<void>;
}
```

装配位置（唯一）：`shared/src/core/props/writers.ts`

```ts
export const BASE_WRITERS: readonly PropWriter[] = [
  geometryWriter, paintWriter, strokeWriter, radiusWriter,
  shapeWriter, textWriter, layoutWriter, effectWriter, supersetWriter,
];
/** 创建路径 = 基础组 + 默认值/推断组(承载 P10 / P18 / sizingMode 推断) */
export const CREATE_WRITERS = [...BASE_WRITERS, defaultsWriter];
export const UPDATE_WRITERS = BASE_WRITERS;
```

调用方向：

```
runWriters(node, src, writers, ctx)
  → phase 1: 对每个 writer,命中 keys 且类型适用则 write()
  → phase 2: 对每个 writer,有 settle 则 settle()   // 布局重算后的回压统一在这里
  → 产出 WriteOutcome
```

`buildNode.ts` 与 `updateSelection` 双双退化成「选一组 writers → `runWriters`」。
`PROP_APPLICABILITY` 改为从 `writers` 反查生成（现在已经是 `dicts` 的模式，只是把生成源从手写表换成 writer 表）。
`plugin.ts` 的 11 个 prop-method `case` 收敛为一个分支：`if (Object.hasOwn(PROP_METHOD_FIELDS, method))` —— 这个写法 `smoke-split.ts:33` 已经在用了。

### 为什么不是别的模式

- **Visitor**：`NodeSkeleton` 是对两个平台运行时节点的鸭子类型收窄，加 `accept()` 要求两侧 adapter 改结构，且并没有稳定的类型层级需要双分派。排除。
- **Template Method**：`bridgeTool` 已经在用，且用对了；把它再套一层到属性写入上，差异会变成一堆空实现的钩子方法。排除。
- **Builder**：建立参数是节点树不是构造参数，`buildNode` 递归已经足够。排除。
- **Decorator**：回填/回压有严格顺序依赖且互相知晓状态（`applySize` → `ensureLayoutMode` → sizingMode 再压），包装顺序难理解 —— 正是它的反面教材场景。排除，改用显式两阶段管线。

### 落地顺序（可分批，每批可独立合入）

1. 抽 `textWriter`（最独立，边界清晰，含 `loadFont` 前置）
2. 抽 `layoutWriter`（含 `settle`，把 P18/P31 收进去，收益最大）
3. 抽 `paint/stroke/radius/shape/effect/geometry/superset`（纯搬运，机械替换）
4. 删 `dicts/prop-applicability.ts` 手写表 → 改为派生；改 `plugin.ts` case → 表驱动
5. 删 `update.ts` 里的 `applyProps`、`buildNode.ts` 里的属性段

**测试点**：每个 writer 一个单测（命中 / 类型不适用 / 字段缺省）；两条路径的字段覆盖度断言（同一 key 在 CREATE 与 UPDATE 的行为差异必须是显式声明，不能是隐式的 if 顺序）。

---

## 2. 第二压力：平台缺陷补偿到处种

### 证据：同一个「样式类字段」概念有 3 份事实

| 事实 | 位置 | 规模 |
|---|---|---|
| `INSTANCE_RISKY_PROPS` | `shared/src/core/update.ts:249` | 27 项手写 Set |
| `CONTAINER_SELF_VISIBLE_PROPS` | `shared/src/core/update.ts:287` | 20 项，其中前 16 项与上面重复 |
| `INSTANCE_STYLE_WARN` | `mcp-server/src/tools/props.ts:25` | 文案第三份描述同一集合 |

另有三类写后补偿，各自为政：

- 能力门控：`update.ts:406` 与 `buildNode.ts:314`（两处，注释里承诺同源）
- layoutMode 回读重试：`update.ts:430` 与 `buildNode.ts:309`（两处）
- 同层几何漂移复核：`mcp-server/src/tools/drift-watch.ts`，**只在 batch 生效**

### 辅助模式 A：写后校验链（Interceptor Chain），统一 `WriteOutcome`

与第 1 节同批做，否则抽 writers 只是把 if 挪了个地方。

```ts
export interface WriteOutcome {
  /** 能力门控 / 类型不匹配 → 本次未提供该字段的 key */
  ignored: Set<string>;
  /** 回读不一致但已自动压回:记录明细,必要时降级为告警 */
  readback: { key: string; ok: boolean }[];
  warnings: string[];
}

export interface WriteCheck {
  readonly id: 'P7-instance' | 'P26-self' | 'P31-layout' | 'capability-gate';
  /** 命中才跑,避免每条都遍历 */
  match(ctx: WriteCtx): boolean;
  run(ctx: WriteCtx): void;
}
```

把散落的三个 Set 降级为三条 `WriteCheck`，由 core 在 `runWriters` 之后统一跑。
`CapabilityGate` 直接消费 `dicts/capability.ts`（已经有 `CAPABILITY_OF_GATED_PROP` 反查表），不再手写 Set。
`P7` / `P26` 的风险字段集合合并成一份，导出给 MCP 侧生成 `description` 文案 —— 文案从集合生成，而不是集合与文案各写各的。

**边界：`DriftWatch` 不搬进 core。** 它是「跨步骤、跨工具的结构变更前后快照比对」，不是单节点写后校验。但它现在有两个问题：

- **覆盖面漏洞**：`jsd_batch` 里的结构变更有漂移复核，直接调 `jsd_delete_node` / `jsd_reparent_nodes` 没有。同一个平台缺陷，两条调用路径两种待遇。
- **事实重复**：`isDriftRisky`（`drift-watch.ts:26-46`）手抄了 6 个工具名 + `jsd_manage_nodes` 的 6 个 op 名，与 `nodes.ts` 的 `opTool()` 清单是两份事实。

建议：给 `BridgeToolDef` 加一个可选 `after?: (args, data) => Promise<string[]>` 钩子，DriftWatch 降级为一个钩子实现，`batch` 不再特殊处理；同时给 `opTool()` 生成的 def 打 `tags: ['structural']`，`isDriftRisky` 改成查 tag。**这一个改动让 DriftWatch 从「batch 的内部实现」变成「工具的一种横切属性」，也顺手补上单工具调用的复核。**

### 辅助模式 B：`RuntimeContext` 显式注入，替代模块级可变单例

| 现状 | 位置 |
|---|---|
| `let injected` 全局可变能力表 | `shared/src/core/capabilities.ts:16` |
| 平台状态缓存，由 `describePlatformGate(def)` 在执行体闭包里读全局 | `mcp-server/src/platform-state.ts` ← `core/registry.ts:132` |
| `const executors = new Map()` 全局，注释自认「多会话共享，重复注册以后者为准」 | `core/registry.ts:49` |

代价：任何单测必须先重置全局；无法并行构造不同平台/不同能力的实例；「谁在什么时候改变了平台判定」不可追查。

落地：

```ts
export interface RuntimeContext {
  capabilities: readonly HostCapabilityKey[] | null;
  platform: PluginPlatform | null;
  executors: ExecutorRegistry;   // 把模块级 Map 变成对象
}
// buildServer(ctx, bridge) 持有;bridgeTool(def, ctx) 闭包捕获
```

改动集中在 `core/registry.ts` + `server.ts` + `index.ts`；`tools/*` 的调用点不用动（它们的 `payload` / `extraContent` 不依赖这些）。这一项**应该先于 1、2 做**，因为它是让 1、2 可测的前提。

---

## 3. 明确不要改（含退出条件）

| 现状 | 为什么保留 | 何时该推翻 |
|---|---|---|
| `bridgeTool` 的 `method` / `payload` / `run` 三选一 | 三种形状互斥且稳定，加接口只会多一层同义反复 | 出现第 4 种稳定执行形状（如 streaming）时再考虑 Strategy |
| batch 的回显裁剪（`trimEcho` 两档 + 常量预算） | 只有两档、全是常量，纯函数已抽出 | 出现第三档（`if (tool === 'xxx')`）时抽 TrimPolicy |
| `Bridge` / `BridgeSocket` Facade | 职责清晰 | 别再往里塞能力（已经塞了离线日志环 + 平台状态，见辅助 B） |
| 单例 Transport（新连接顶替旧连接） | 注释论证充分：一个 daemon 只服务一个面板 | 真的需要多面板并行时 |
| NodeSkeleton 的鸭子类型收窄 | 换 Visitor 的成本远大于收益 | 无 |

**不要引入**：CQRS / Event Sourcing / Saga / Outbox。读写同源走同一条 WS 请求-响应通道，没有读写模型分离压力；日志与状态推送是 UI 装饰，不是事实存储。

---

## 4. 低成本清理（顺手做）

1. `sync-guarantee.ts` 两个文件复制了 `KeysOf` / `ExpectNever` / `Missing` / `Declared` 四个类型工具 → 提到 `shared`。
2. `PendingManager.mergeBytes`（`pending.ts:246`）与 ui 侧 `binary.ts` 的 `stripBytes` / `extractBytes` 是一对互逆编码，分居两个包 → 提到 `shared` + 加 roundtrip 单测（现在任何一侧漂移都表现为「导出图是空的」）。
3. 三层超时 `UI_FORWARD_TIMEOUT_MS < PLUGIN_TIMEOUT_MS < BATCH_TIMEOUT_MS` 目前是**注释不变式**（`pending.ts:28`）→ 改成 `shared` 里一张派生表 + 一条断言测试；注释保证不了顺序，测试可以。
4. UI 侧 `useBridge.tsx:107` 里用「订阅 status → 清 capability 快照」维护第二个派生状态 → 移到 `ConnectionManager` 的状态迁移副作用里，让快照成为单一派生值而不是两个需要互相同步的东西。

---

## 5. 优先级

| # | 事项 | 收益 | 成本 |
|---|---|---|---|
| 1 | `RuntimeContext` 显式注入 | 可测性，是 2、3 的前提 | 小，3 个文件 |
| 2 | `PropWriter` 表 + `runWriters` 两阶段（先 layout / text） | 加属性从 5 处降到 1-2 处 | 中，集中在 `shared/core` |
| 3 | `WriteOutcome` + `WriteCheck` 链合并 P7/P26/P31/P-gating | 缺陷事实从 3 份降到 1 份，文案可生成 | 中，与 2 同批 |
| 4 | `bridgeTool.after` 钩子 + 工具 `tags`，DriftWatch 降级为钩子 | 补上单工具调用的漂移复核；删掉工具名手抄 | 小 |
| 5 | 第 4 节 4 项清理 | 消隐性耦合 | 极小 |

**验证口径**：每批合入后，`pnpm run typecheck` + `smoke-split.ts` 必须绿；第 2、3 批额外要求「同一 property key 在 CREATE / UPDATE 下的行为差异」有断言覆盖，不能退化为隐式的执行顺序依赖。
