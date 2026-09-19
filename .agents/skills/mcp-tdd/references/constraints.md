# 架构约束清单（违反必踩）

> 何时读：**动 `packages/shared/src/core/` 或 `packages/ui/src/code/plugin.ts` 之前**；
> 或要写 mock host 定点测试时（见文末三个必踩坑）。

## 1. 字段集单一真相

`PROP_METHOD_FIELDS[method]`（`packages/shared/src/schemas/split-ops.ts`）**同时**驱动：

1. 工具入参 schema
2. 引擎侧 `updateSelection` 的越界拦截

新增字段只要加进对应的 `*NodeProps`，两边自动放行。
**不要另开 `extraFields` / 旁路通道**——那样会变成两套真相。

## 2. 跨方法字段

若某方法要收别的方法的字段（如 `resize` 也要 `x`/`y`），直接放进该方法的 props 对象。

但必须检查 `tools/update-common.ts` 的 `requestedProps`：它按 `PROP_APPLICABILITY`
点名「未生效字段」。未登记在该表的字段会被误报成
「与目标节点类型不匹配，已被忽略」→ 需过滤 `PROP_APPLICABILITY[k] !== undefined`。

## 3. 零轴约束：两侧规则不同

- `transformPropsSchema` 的 width/height **不允许零轴**（创建路径）。
- `resize` **允许零轴**（LINE 横线/竖线是合法形态）。

两边约束不同时**各写一份 schema**，不要复用。

## 4. 同源 schema 复用

需要同一字段时引用 `fooPropsSchema.shape.bar`，**不要抄一份描述**。

## 5. 协议类型窄化

改 `PluginRequest` 联合类型后，`plugin.ts` 里 `switch (msg.method)` 中跨多 case
共享的 `msg` 会退化成宽联合。取新字段要用 `(msg as { field?: T }).field`
显式窄化，否则报 TS2339。

## 6. 错误前缀

`plugin.ts` 的 catch 用 `fail(id, msg.method, e)`；
`node_op` / `component_op` 已特判加上 op 名。新增分发式 method 时照做，
否则报错看不出是哪个操作。

## 7. 平台超集字段的 `'in'` 守卫

平台差异超集字段（`textTruncation` / `componentProperties` / `variables` …）
若用 `'in'` 守卫判断可用性，字段**存在但值不生效**时会被静默跳过——
必须检测并报错 / 进 `warnings` 点名，不允许「回显成功实则没生效」。

## 8. 提示词与代码同源

工具可用性纪律散落三处，改行为要**同步**：

- `packages/mcp-server/src/server.ts` 的 `INSTRUCTIONS`
- `packages/mcp-server/src/tools/prompts.ts` 的设计策略总纲
- 各工具的 `description` 与 schema `.describe()`

**只写一处等于没写。**

## 9. 改了工具字段集或描述后

- 同步更新 `packages/mcp-server/smoke-split.ts` 的期望用例
- 同步更新 `packages/mcp-server/README.md` 的工具表

---

# mock host 定点测试：三个必踩坑

`findNode` 会用 `trySerialize` 过滤「不可用」节点，所以 mock 节点必须能让
serialize 通过（至少含 `id/name/type/x/y/width/height`）。

1. **children 数组身份**：`Object.assign(node, { children: [] })` 之后再改
   `node.children` 会与闭包捕获的数组脱钩。先 `const children = []`，
   闭包内只引用它，或用 getter 返回。
2. **byId 注册时机**：必须在节点**挂进树之后**再遍历建索引，
   否则 `getNodeById` 查不到。
3. **`insertChild` 语义**：引擎是「先摘除原位置再插入」。mock 若只
   `splice(at, 0, c)` 会留下重复项，导致 `reorderChild` 的「期望下标 vs 实际」
   校验误报失败。正确写法：先 `indexOf(c)` 摘除，再 splice 插入。

页面级 mock 也需实现同样的 `insertChild`——`reorderChild` 会把节点 append 到
`host.currentPage` 再插回父级做兜底。

## 运行方式

定点测试写在 `/tmp` 下，用仓库内的 tsx 跑（**不要用裸 `npx`**：缺包时会停下来等人确认，
非交互环境直接挂住；要用就加 `--no-install` 让它快速失败）：

```bash
# 定点测试（从仓库根）
packages/mcp-server/node_modules/.bin/tsx /tmp/xxx.ts
# 冒烟
cd packages/mcp-server && ./node_modules/.bin/tsx smoke-split.ts
```

或者直接 `scripts/verify.sh smoke`（已内置 tsx 解析与输出解析）。
