# 0011. dynamic-page 下文档访问异步化：Access 层收口解析与加载

- **日期：** 2026-09-19
- **状态：** 已采纳（已落地，待插件内实测）
- **影响范围：** `packages/shared/src/core/`（新增 `access.ts`；`utils.findNode` → `resolveNodes`；`nodes.ts` / `component.ts` / `export.ts` / `update.ts` 的解析点）、`shared/core/host.ts`（契约新增可选异步成员）、`ui/src/code/{figma,jsdesign}/host.ts` 与双侧 `sync-guarantee.ts`、`ui/src/code/figma/ops.ts`、`ui/scripts/vite-plugin-manifest.ts`
- **相关记录：** 0010（契约异步优先）——本记录是它在 dynamic-page 下的具体落地；0005（机器能守的不靠文档纪律）——缺口由 sync-guarantee 断言守；0007（静默失效要给明确错误）——未加载/不支持的成员必须报错而非 no-op

## 压力

`packages/ui/scripts/vite-plugin-manifest.ts:46` 已写 `"documentAccess": "dynamic-page"`（该文件 25–27、47–50 行的注释是**过期**的，仍声称未开启）。开启动态页后，Figma 让一批同步 API **直接抛异常，与是否已加载无关**：

| 现在在用的同步入口 | dynamic-page 下 | 受影响面 |
|---|---|---|
| `figma.getNodeById` | 抛 `Cannot call with documentAccess: dynamic-page` | `host.getNodeById` → `utils.findNode`，**26 处调用**（component 12 / nodes 9 / export 2 / update 1 / 定义 1） |
| `node.mainComponent`（INSTANCE） | 同上 | component.ts 的解绑 / swap / 覆盖同步 / 序列化、serialize.ts |
| `figma.getLocalPaintStyles` / `TextStyles` / `EffectStyles` / `GridStyles` | 同上 | `export.listStyles`、`figma/ops.ts:186` |
| `figma.variables.getLocalVariableCollections` / `getLocalVariables` / `getVariableById` | 同上 | `figma/ops.ts` createVariables / applyVariables |
| `figma.currentPage = page`（写） | 变为只读，需 `setCurrentPageAsync` | 目前未写，暂不影响 |
| `figma.root.children`、跨页 findAll / findOne | 需先 `loadAllPagesAsync` 或 `page.loadAsync()` | 跨页遍历类能力 |
| `documentchange` 事件 | 需先 `loadAllPagesAsync` | 目前只订阅 `selectionchange`，暂不影响 |

`@figma/plugin-typings@1.137.0` 的替代符号齐备：`getNodeByIdAsync` / `getStyleByIdAsync` / `getLocalPaintStylesAsync` / `getVariableByIdAsync` / `getMainComponentAsync` / `loadAllPagesAsync` / `PageNode.loadAsync` / `setCurrentPageAsync`。

关键约束（决定架构的不是"要不要 async"，而是"async 边界画在哪"）：
**加载完成后，节点属性读写仍是同步的** —— `node.x = 1`、`node.fills = ...`、`node.children` 都不需要 await。
所以 await 应该被**挡在解析层门口**，而不是渗进 0001 的属性写入管线与 0004 的校验管线。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| **Access 层收口**：新增 `shared/core/access.ts`，集中 `resolveNodes` / `resolveMainComponent` / `ensurePageLoaded` / `listStylesAsync`；返回**已加载**骨架，下游同步；契约新增成员声明为可选，jsDesign 侧回退同步实现 | 采用 | 26 处解析点收敛到 1 处 await；异步边界与"是否需要 await"的事实边界一致；平台差异只在 Access 层兜一次 |
| 全量 await 化：属性读写、buildNode、props writers 一律改 Promise | 排除 | 加载后读写本就同步，改了零收益却让 0001 / 0004 管线整体 async 化，波及面从 26 处扩到整个 `core` |
| Virtual Proxy / 懒加载代理（属性访问时隐式 load） | 排除 | 同步 getter 无法 await；隐式加载会把"未加载"错误推迟到深层，与 0007 的"错误要早且明确"相反 |
| 每个 use site 各自 `await host.getNodeByIdAsync(id)` | 排除 | 循环内单 id 解析有 4–5 处，会退化成串行 N+1；且"未加载/不支持"的兜底逻辑会复制 26 份 |
| 保留 `findNode` 同步签名，靠启动时 `loadAllPagesAsync()` 一次性全量加载来"救"同步 API | 排除 | 无效：manifest 一旦声明 dynamic-page，`getNodeById` 无条件抛异常，加载不加载都抛；且每次启动全量加载正是 dynamic-page 要避免的成本 |
| Unit of Work（完整提交/回滚语义） | 部分采用 | 只取"一次工具调用 = 一次批量预解析"这一条，不引入 UoW 的提交语义 —— 没有跨调用事务需求 |

## 结论

**新增 Access 层作为唯一异步边界，把它下面的管线留在同步世界。**

1. **契约（`host.ts`）**：新增**可选**异步成员 —— `getNodeByIdAsync?`、`getMainComponentAsync?`（节点级）、`getLocalPaintStylesAsync?` / `TextStyles` / `EffectStyles` / `GridStyles`、`loadAllPagesAsync?`、`setCurrentPageAsync?`。
   声明为可选是因为 jsDesign 无 dynamic-page（`manifest.json` 没有该字段），typings 里没有这些符号；双侧 `sync-guarantee.ts` 按既有缺口机制登记：Figma 侧断言存在，jsDesign 侧反向断言缺席。
2. **Access 层（`shared/core/access.ts`）**：
   - `resolveNodes(host, ids): Promise<NodeSkeleton[]>` — `Promise.all` 批量解析，**取代** `utils.findNode`；host 无 `getNodeByIdAsync` 时回退同步 `getNodeById` 并包成 resolved Promise（jsDesign 路径）。
   - `resolveNodesMap(host, ids): Promise<Map<string, NodeSkeleton>>` — 供循环内按 id 查表，消灭 N+1。
   - `resolveMainComponent(host, inst): Promise<NodeSkeleton | null>` — `getMainComponentAsync`，缺失时报明确错误。
   - `ensurePageLoaded(host, page?) / loadAllPages(host)` — 幂等，已加载页记 Set 避免重复 await。
   - `listStylesAsync(host)`、`findNodesAsync(host, criteria)`。
   - **兜底只在这一层写一次**：成员缺失 → 明确错误（0007 口径），不静默 no-op。
3. **下游保持同步**：props writers（0001）、update/回读（0004/0007）、buildNode、serialize 在拿到已加载骨架后仍同步；只有需要重新解析时才 await。
4. **adapter 仍是单点断言**（`figma as unknown as DesignHost` / jsDesign 同理）—— 新增成员靠 Access 层的可选判定 + sync-guarantee 断言守，不改断言方式（改显式工厂会把 200 行契约重复声明一遍，成本远高于收益）。
5. **manifest**：`vite-plugin-manifest.ts` 的过期注释必须改（它现在与 46 行的现实相反）；在异步化完成前，Figma 侧处于"声明已开、代码未改"的破损状态 —— 建议批次 0 先把 manifest 退回 legacy，异步化完成后再开。

## 最小落地（分批，每批可独立验证）

- **批次 0（止血，1 行）**：`vite-plugin-manifest.ts` 注释更新；按选择先移除/保留 `documentAccess`。保留则 Figma 侧 `getNodeById` 路径当前即不可用。
- **批次 1（契约 + Access 层，不改调用点）**：`host.ts` 加可选异步成员；新建 `access.ts`（`resolveNodes` / `resolveNodesMap` / `resolveMainComponent` / `ensurePageLoaded` / `listStylesAsync`）；双侧 `sync-guarantee.ts` 补断言；jsDesign 回退路径。验证：`typecheck` + `test`。
- **批次 2（解析点换血）**：26 处 `findNode` → 开头一次 `await resolveNodes`，循环内单 id 改 `resolveNodesMap` 查表；相关函数改 `async`；`plugin.ts` 分发处（已在 `async` handler 内）加 `await`。验证：`typecheck` + `test` + `build` + 重载插件实测。
- **批次 3（mainComponent 路径）**：component.ts / serialize.ts 的 INSTANCE 主组件读取走 `resolveMainComponent`；涉及函数改 async。验证同上。
- **批次 4（styles / variables）**：`listStyles`、`figma/ops.ts` 的 `getLocal*Styles` 与 `variables.*` 换 `*Async`；jsDesign 侧走回退。
- **批次 5（跨页能力）**：全文档遍历 / `getPageStructure` 显式门控 `loadAllPagesAsync`，并在返回里标注成本；需要时按页 `loadAsync`。
- **依赖顺序**：批次 1 → 2 → 3；批次 4、5 可与 3 并行。

## 成本与退出条件

- 成本：多一层 `access.ts`（约 100–150 行）+ 26 处调用点改成 await；每个工具调用的开头多一次批量 await（`Promise.all`，非串行）；jsDesign 侧为兼容契约要走"同步实现包 Promise"的回退分支。
- 收益：异步边界与事实边界一致；解析只在一处 await；平台差异只兜一次；同步管线（0001/0004）不被 async 污染。
- 退出条件：
  - 若 Figma 撤回 dynamic-page 或提供"legacy 兼容开关"，批次 4/5 可回退，但批次 1–3 的 Access 层保留（它对 jsDesign 也是正确的收口）。
  - 若将来两平台都强制全量异步（属性读写也要 await），本记录的"下游保持同步"假设失效，需新开记录把 props 管线异步化，并重新评估 0001。
- 反向信号：若实测发现批量 `Promise.all` 在超大文档上比逐个 await 更慢（加载调度串行化），改回分批小窗并发（例如每 50 个一批），**不要**退回逐个 await。

## 验证

- `pnpm run typecheck` + `pnpm run test`：每批次结束各跑一次；`tests/skill-doc-budget.test.ts` 只断言技能目录与 `INDEX.md`，本轮不受影响。
- 编译期契约：双侧 `sync-guarantee.ts` 断言新增异步成员的存在/缺席 —— Figma 侧若真缺 `getNodeByIdAsync` 则编译失败；jsDesign 侧若被 typings 收录（说明平台补了能力）也会编译失败，提醒删回退分支。
- 引擎侧实测：批次 2 起涉及 `shared/` 与 `ui/`，每批需 `pnpm build` + 在即时设计/Figma 里**重载插件**；仅类型与单测不足以证明 dynamic-page 下不再抛。
- 冒烟用例（Figma 侧，开 dynamic-page 后必须全绿）：`get_selection` → `find_nodes(ids)` → `update` → 回读；`create_instance` + 序列化；`list_styles`；`figma_variables_create`。
- 台账证据（mcp-tdd 回归 run `run-20260919T123537Z`，用例 `case-20260919-0002` 原样重放，场地为 Figma/dynamic-page）：4 步全过，创建时对齐生效（`80759e34f71c` 修复保持）、实例化正向成功、负向报错按修复后文案点名 id（`2c97b8245071` 已挂 `--decision 0011`）；`2280202ae990` 是负向步骤设计内命中，scan-log 的「复发」告警为负向用例固有误报，按 `--force` 豁免收口。
- 冒烟全清单实测（run `run-20260919T124937Z` + 回归 `run-20260919T125338Z`，Figma/dynamic-page）：`get_selection` → `find_nodes(ids)` → `update`(fill) → 回读一致；`create_instance` + 序列化（渐变完整）；`list_styles`（jsd://styles 空表正常）；`figma_variables_create`/`apply` 初测撞新指纹 `b300df0ec236`（增量模式拒收 collection id）——单点修复 `ops.ts` 改传 collection 节点后重放全绿，已闭环并登记 `platform-limits.md`。测试节点已清理；`0011-smoke` 变量集合留在文档中（无删除 op）。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-19 | 初次决策：manifest 已开 `documentAccess: dynamic-page`，同步文档访问 API 无条件抛异常，26 处 `findNode` 失效 | 采用「Access 层收口解析与加载 + 下游保持同步 + 契约成员可选 + 分批落地」；排除「全量 await 化」「懒加载代理」「逐点 await」「全量预加载救同步 API」「完整 UoW」 |
| 2026-09-19 | 全量落地(批次 1–4 一次完成):新增 `access.ts`;26 处 `findNode` → `resolveNodes`/`resolveNodesMap`;`mainComponent` 路径走 `getMainComponentAsync`(serialize 摘要改 try/catch 省略);styles/variables 走 `*Async`;双侧 sync-guarantee 补 `JsDesignAsyncGap` 断言;manifest 过期注释重写 | 结论不变;状态改为「已落地」—— `typecheck` + `test`(80/80)+ `build` 全绿;剩余待办:重载插件后在 Figma(dynamic-page)与即时设计各跑一轮冒烟(get_selection → find_nodes → update → 回读、create_instance 序列化、list_styles、figma_variables_create) |
| 2026-09-19 | 批次 5 落地(跨页能力):`findSchema` 新增 `scope`(page=缺省/document);document 范围先过 `ensurePagesLoaded` 门控再遍历 `host.root.children`,结果带 `scope` + 成本 `note`;`getPageStructure` 异步化,附文档级 `pages` 总览与同样的成本 `note`;`ensurePagesLoaded` 幂等化(本生命周期只真正 await 一次,返回是否真加载,失败不缓存可重试);契约新增 `root.children`(两平台 typings 均有,非缺口)。按页 `loadAsync` 暂不进契约:当前无调用方(全量门控已覆盖批次 5 场景),等真实按页需求出现再按 0010 异步优先收口 | 结论不变;`typecheck` + `test`(80/80)+ `build` 全绿;引擎实测通过(Figma/dynamic-page):`scope=document` 跨页查找与 `jsd://page` 页面总览均生效,首调 note 标注成本、后续调用不再出现(首版幂等 memo 把 resolved promise 缓存成恒 true,实测抓出后改为一次性标志位) |
