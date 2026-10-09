---
"text-to-design-mcp": minor
---

feat(mcp): 新增 jsd_get_page 工具,补齐「当前页顶层」这一层漂移复核

`jsd_get_page` 把既有资源 `jsd://page` 同一个能力开成工具(资源给「客户端主动读上下文」,工具给「模型明确要读」,同 `jsd_get_selection` / `jsd://canvas/selection` 一对)。

- 名字不是随便起的:结构变更复核(`drift-watch`)的「当前页顶层」这一层按 `jsd_get_page` 走 `lookupExecutor`。该工具此前**不存在**,`lookupExecutor` 返 `undefined` → 该层被判 `dead`,**复核从未执行过且日志里一个字都没有** —— 而 `jsd_batch` 的描述一直写着「含当前页顶层」。改名/删名会再次静默打断它。
- 无参工具也显式给 `inputSchema`(不给会走 SDK 的 `callback(ctx)` 形态,工具目录里也看不出「这个工具不收参数」)。
- `jsd://page` 资源的描述补一句「等价于 jsd_get_page」,避免两条通路被当成两件事。

守门:`__tests__/drift-hook.test.ts` 新增一条不测「漂移能不能查出来」,而测「这条路真的走通了」—— 断言 `jsd_get_page` 已注册,且删节点后复核确实读了一次 `get_page`。
