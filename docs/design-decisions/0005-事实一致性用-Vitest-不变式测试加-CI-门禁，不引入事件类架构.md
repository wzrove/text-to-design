# 0005. 事实一致性用 Vitest 不变式测试加 CI 门禁，不引入事件类架构

- **日期：** 2026-09-18
- **状态：** 已采纳
- **影响范围：** 根 `package.json`、`packages/{shared,mcp-server}/package.json`、`.github/workflows/`
- **相关记录：** 0001–0004 的共同前置；同时记录一项**否定决策**

## 压力

1. **零测试执行器。** 三个包的 devDependencies 里没有 vitest / jest / node:test；`package.json` 只有 `typecheck` 与 `lint`。唯一的自动化是 `packages/mcp-server/smoke-split.ts`（652 行），它**没有接进任何 npm script**，只能手工 `tsx` 跑。
2. **既有的「派生事实一致性」门禁是坏的。** `packages/mcp-server/package.json` 声明了 `"check:schema": "node scripts/check-schema-draft07.mjs"`，但 `packages/mcp-server/scripts/` 下只有 `gen-aliases.ts` —— **该文件不存在**，脚本必然失败。仓库已经想要一个「生成物不与源漂移」的门禁，只是它现在是死的。
3. **CI 不跑校验。** `.github/workflows/` 只有 `release.yml`（发版）。类型检查只在 lefthook `pre-commit` 里跑，`--no-verify` 或 `LEFTHOOK=0`（CI 里就设为 0）即可绕过。

后果：0001–0004 全部依赖「加属性从 5 处降到 1–2 处」的承诺。没有测试，这条承诺无法验证 —— 重构只会把 `if` 从一个文件挪到九个文件。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| Vitest + 不变式测试（含 golden / 集合对等断言） | 采用 | 与现有 `vite` 构建同栈，零额外工具链；`smoke-split.ts` 的假 McpServer / 假 Bridge 写法可直接迁移为 unit test |
| 纯靠 `tsc --noEmit` 的编译期断言 | 部分采用 | 现有 `sync-guarantee.ts` 的 `KeysOf / ExpectNever / Missing / Declared` 已是这个思路，继续保留；但它证不了运行期行为差异（CREATE vs UPDATE） |
| CQRS / Event Sourcing / Saga / Outbox | **排除** | 读写同源，走同一条 WS 请求-响应通道；日志与状态推送是 UI 装饰不是事实存储；没有跨进程事务或事件传播压力。命中「停止条件」多项 |
| 先重构后补测试 | 排除 | 顺序反了：0001 的验收标准本身就是一组行为快照，必须先有 baseline |

## 结论

**不引入任何事件类架构。** 事实一致性用 Vitest 不变式测试 + CI 门禁保证。

## 最小落地

- 角色与职责：`shared` 与 `mcp-server` 各加 `vitest`；`ui` 暂不加（插件宿主代码在 0001–0004 范围外）
- 接口所在层与依赖方向：测试只读 import，禁止 monkey-patch 生产对象（`smoke-split.ts:37` 现在用 `bridge.request = async ...` 覆盖方法，迁移时改为构造注入，配合 0002）
- 创建与装配位置：
  - `pnpm test`（根）→ `vitest run`
  - 修 `check:schema`：补回 `scripts/check-schema-draft07.mjs`，或删除该 script 条目 —— 二选一，**不要留死脚本**
  - `.github/workflows/ci.yml`：`pnpm typecheck && pnpm test && pnpm lint`，走 PR trigger
- 一次调用时序：本地 pre-commit 跑 `typecheck + affected tests`；CI 跑全量

首批必写的 4 条不变式（都是现在无保护的）：

1. 三层超时顺序：`UI_FORWARD_TIMEOUT_MS(25s) < PLUGIN_TIMEOUT_MS(30s) < BATCH_TIMEOUT_MS(120s)` —— 三者**已在** `shared/src/connection.ts:64-65` 与 `mcp-server/src/config.ts:42` 集中登记，缺的只是断言；注释保证不了顺序，测试可以
2. 同一 property key 在 CREATE / UPDATE 下的行为差异必须显式（0001 的验收核心）
3. 四个「11 项 PropMethod 名单」互相对等：`schemas/split-ops.ts:323` 的 `PropMethod`、`index.ts:74` 的 `PropParamsByMethod`、`index.ts:133` 的 `PluginRequest`、`ui/src/code/plugin.ts:164` 的 `case`
4. 二进制编码 roundtrip：`PendingManager` 的帧合并 ↔ `ui/src/bridge/binary.ts` 的 `stripBytes / extractBytes` 是一对互逆编码，分居两个包；任何一侧漂移都表现为「导出图是空的」，现在无任何保护

## 成本与退出条件

- 成本：一个 devDependency；CI 多一条 job
- 退出条件：若测试长期只能覆盖「常量顺序」这类琐碎断言而业务行为仍靠手工 `smoke-split` → 停止扩大测试面，把 `smoke-split.ts` 正式接进 script 即可，不要为凑覆盖率写断言
- 边界：不追求覆盖率数字，只守上面这类「会静默失效」的事实

## 验证

- 不变量测试：上述 4 条；每条都要能**故意改坏一个源**并看到测试失败，否则等于没写
- 并发/重试用例：本记录不涉及异步组件，留空
- 指标与日志：`check:schema` 与 `vitest` 的退出码必须成为 PR 合并门禁；CI 失败即阻塞合并
- 自查：`pnpm typecheck` 与手工 `smoke-split.ts` 迁移完成前，不得开始 0001 的第 2 批（抽 layoutWriter）

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-18 | 初次决策 | 采用 Vitest 不变式测试 + CI 门禁；明确排除 CQRS / Event Sourcing / Saga / Outbox |
| 2026-09-18 | 落地后复核 | 结论不变。Vitest 5 接入、41 条用例全绿；死脚本 `check:schema` 已删；CI 新增 `ci.yml`（typecheck + test + lint）。4 条不变式里第 2 条（CREATE/UPDATE 差异）由 write-path.test.ts 的 20 条基线用例承载 |
