# 0003. 工具级 after 钩子加 tags 取代 batch 内嵌 DriftWatch

- **日期：** 2026-09-18
- **状态：** 已采纳
- **影响范围：** `packages/mcp-server/src/tools/drift-watch.ts`、`tools/batch.ts`、`tools/nodes.ts`、`core/registry.ts`
- **相关记录：** 可先于 0001 落地（互不阻塞）

## 压力

同一个平台缺陷（结构变更后引擎重算同层约束，把没碰到的兄弟节点挪走）有两条调用路径、**两种待遇**：

- `jsd_batch` 内的结构变更步骤 → 有漂移复核（`DriftWatch`）
- 直接调 `jsd_delete_node` / `jsd_reparent_nodes` → **没有复核**

用户绕过 batch 就得不到保护。这是覆盖面漏洞，不是抽象问题。

另有一份事实重复：`isDriftRisky`（`drift-watch.ts:26-46`）手抄了 6 个工具名 + `jsd_manage_nodes` 的 6 个 op 名，与 `nodes.ts` 里 `opTool()` 生成的 def 清单是两份事实。加一个结构类工具要记得改两处，忘了就静默失去复核。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 声明式元数据 + 横切钩子（`tags` + `after`） | 采用 | 「是否结构性变更」是工具的固有属性，不是 batch 的编排细节；挂在 def 上才能覆盖所有调用路径 |
| Observer / Domain Event | 排除 | 复核是同步、请求内的；没有跨进程消费者，也没有异步投递需求 |
| Decorator（包装执行体） | 排除 | 需要在工具目录注册时就可见的元数据（供 `ping` 能力表消费），包装层做不到 |
| 保持简单（继续在 batch 里判 `isDriftRisky`） | 排除 | 现状成本是「单工具调用漏保护」，改动成本是 2 个可选字段，量级不对等 |

## 结论

给 `BridgeToolDef` 加可选 `after` 钩子与 `tags` 标记，DriftWatch 降级为一个钩子实现。

```ts
export interface BridgeToolDef {
  // ...existing
  tags?: readonly ('structural' | 'destructive')[];
  /** 执行成功后运行，返回追加到结果里的告警行 */
  after?: (args: Record<string, unknown>, data: unknown) => Promise<string[]>;
}
```

## 最小落地

- 角色与职责：`DriftWatch` 成为唯一的 `after` 实现；`isDriftRisky` 改为查 `tags.includes('structural')`
- 接口所在层与依赖方向：`core/registry.ts` 在统一管道末尾调用 `after`；`tools/*` 只声明 tag
- 创建与装配位置：`opTool()`（`tools/nodes.ts`）生成 def 时按 op 打 tag；`batch.ts` 删除全部 DriftWatch 特殊分支
- 一次调用时序：`bridgeTool` 管道 → 平台门控 → 入参校验 → 派发 → **`after` 钩子** → `structured()/err()` 兜底

## 成本与退出条件

- 成本：`BridgeToolDef` 多 2 个可选字段；每个结构性变更工具多一步快照比对（已有常量预算 `MAX_LAYERS=8` / `MAX_CHILDREN=200` / `MAX_REPORTED=5`）
- 退出条件：上游引擎修复同层约束重算缺陷 → 删掉整个 `drift-watch.ts`，`tags` 保留给未来其他横切钩子；若始终只有这一个钩子，可化简为单个 `driftWatch?: boolean` 字段

## 验证

- 不变量测试：迁移期一次性断言 —— 「打 `structural` tag 的工具集合」等于「旧的 `isDriftRisky` 返回 true 的工具集合」
- 边界用例：直接调 `jsd_delete_node`（非 batch）必须产出告警；`jsd_manage_nodes` 的 6 个 op 逐一覆盖
- 回归：`after` 抛错不能吞掉主结果 —— 必须降级为一行 warning 而非让工具失败
- 指标与日志：每次**实际检测到**漂移（非「检查过」）打一条 info，记 driftedIds 数量

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-18 | 初次决策 | 采用 声明式 tags + after 横切钩子 |
| 2026-09-18 | 落地后复核 | 结论不变，两处按实情调整：① 钩子需要「前后各一次」才能比对，故接口是 `before/after` 一对（工厂产出、每次调用新建实例），不是单个 after；② 钩子告警同时进结果文本块与 `warnings` 字段，否则 `jsd_batch` 只看 structuredContent 会把告警静默丢掉；③ `checkDrift` 是**公开参数**（README 有写），不能静默移除：改为按调用生效 —— `ToolExecutor` 增第三个可选参数 `{ skipHooks }`，batch 传 `checkDrift === false` 时本次不实例化钩子（不是摘掉 def 上的钩子，也不是全局开关），两条方向都有用例覆盖 |
