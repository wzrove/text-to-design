# 0002. RuntimeContext 显式注入替代模块级可变单例

- **日期：** 2026-09-18
- **状态：** 已采纳
- **影响范围：** `packages/mcp-server/src/core/registry.ts`、`server.ts`、`index.ts`；`packages/shared/src/core/capabilities.ts`
- **相关记录：** 0001、0003、0004 的可测性前提，须先于它们落地

## 压力

三处进程级可变全局：

| 现状 | 位置 | 代价 |
|---|---|---|
| `let injected` 全局能力表 | `shared/src/core/capabilities.ts:16` | 注释自陈「传 null 可清空，便于单测」= 承认测试必须重置全局 |
| 平台状态缓存，由 `describePlatformGate(def)` 在执行体闭包里读 | `mcp-server/src/platform-state.ts` ← `core/registry.ts:132` | 「谁在什么时候改变了平台判定」不可追查 |
| `const executors = new Map()` | `core/registry.ts:49` | 注释自认「多会话共享，重复注册以后者为准」 |

后果：任何单测必须先重置全局；无法并行构造不同平台 / 不同能力的实例。当前仓库**零单元测试**（见 0005），所以这笔成本还没真正付出去 —— 但 0001 的注册表单测一旦开写，就会立刻变成每个测试文件里的样板前言。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| Dependency Injection（显式 `RuntimeContext` 对象注入） | 采用 | 三个消费点集中在装配层，改动 3 个文件即可；`tools/*` 的调用点不用动（`payload` / `extraContent` 不依赖这些） |
| 保持简单（继续用模块级单例） | 排除 | 单例成本已被现有注释论证；且它是 0001、0003、0004 三项的地基，推迟会让每批合入都不敢动 |
| Singleton with DI scope（容器作用域） | 排除 | 项目没有容器；为一个 stdio MCP 进程引入容器是净增负担 |
| Service Locator | 排除 | 只把全局可变性藏得更深，仍是隐式依赖 |

## 结论

显式 `RuntimeContext` 对象注入，替代模块级可变单例。

```ts
export interface RuntimeContext {
  capabilities: readonly HostCapabilityKey[] | null;
  platform: PluginPlatform | null;
  executors: ExecutorRegistry;   // 模块级 Map 变成实例字段
}
```

## 最小落地

- 角色与职责：`RuntimeContext` 是只读快照 + `ExecutorRegistry` 实例；不再有模块级可变导出
- 接口所在层与依赖方向：`core/registry.ts` 定义；`buildServer(ctx, bridge)` 持有并向下传
- 创建与装配位置：`server.ts` 构造一次，`bridgeTool(def, ctx)` 闭包捕获
- 一次调用时序：`index.ts` 组装 ctx → `buildServer(ctx, bridge)` → 各 `registerXTools(server, bridge, ctx)` → 工具回调闭包读 ctx

## 成本与退出条件

- 成本：`register*` 签名多一个参数（12 个注册函数）；无新状态类别、无网络跳数
- 退出条件：若 daemon 永远单进程单会话且永远零单测，可回退为模块级单例 —— 但那样 0001/0003/0004 也都不该做
- 禁止：不要让 `RuntimeContext` 变成可变长生命周期对象（能力状态会被无意写回）。它是构造期快照

## 验证

- 不变量测试：两个不同 `RuntimeContext` 实例并发构造不同平台的能力集合，互不影响（不需要重置全局）
- 边界用例：`capabilities = null`（未注入）走 fail-open，行为与当前「注入前」一致
- 回归：`grep -rn "^let \|^const .* = new Map()" packages/shared/src packages/mcp-server/src` 除白名单外应为空，作为 lint 级断言
- 指标与日志：平台能力注入时打一条 info（平台名 + 能力数量），替换掉现在静默的 `setHostCapabilities`

## 范围收窄（落地时修订）

落地只做了第一项，另外两项**按退出条件保留**，理由记录在此，不静默缩水：

| 项 | 决定 | 理由 |
|---|---|---|
| `capabilities` 模块级全局 | **已改为显式注入** | 唯一真正阻塞可测性的一项：每个用例都得先复位全局，且无法并存两个平台实例。改动面小（3 个消费点 + 1 个注入点） |
| `platform-state` 进程级缓存 | **保留单例** | 它是「某条 WS 连接上探测到的远端状态」的缓存，含 single-flight；生命周期本来就绑在 daemon 进程与连接事件上。做成可注入对象后仍只会有一个实例，多一层传递换不到任何并行性 |
| `executors` 模块级 Map | **保留单例** | 需给 `bridgeTool(def)` 加第二参，17 个注册点 + `server.ts` + `batch.ts` 全改；daemon 单进程单面板、重复注册以后者为准且行为一致。成本远大于收益 |

判定标准统一为：**这个全局能不能拥有第二个实例？** 能（能力表）就抽；不能（连接状态缓存、单进程注册表）就留，并把理由写在原处。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-18 | 初次决策 | 采用 Dependency Injection（RuntimeContext 显式注入） |
| 2026-09-18 | 落地时评估后两项的成本 | 结论不变，但范围收窄为「只抽能力表」；`platform-state` 与 `executors` 保留单例并写明理由 |
