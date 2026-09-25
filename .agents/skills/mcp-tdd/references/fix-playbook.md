# 修复剧本

> 何时读：闭环第 3–4 步（定位 / 改）用。目标:拿到一个指纹 + 骨架文案,
> 定位到该改哪个文件、按什么标准改。

## 分层地图

数据从 AI 到画布经过五层,报错在哪层冒出来,决定你打开哪个文件。

```
① AI 客户端
② MCP 工具层      packages/mcp-server/src/tools/*.ts        工具名 / inputSchema / method / payload
③ MCP 核心层      packages/mcp-server/src/core/registry.ts  统一兜底:try/catch → err() / structured()
                  packages/mcp-server/src/core/response.ts
④ 桥接传输层      packages/mcp-server/src/{bridge,transport,pending}.ts
                  packages/mcp-server/src/daemon/*
⑤ 插件与共享层    packages/ui/src/code/plugin.ts            op 分发(switch method → switch op)
                  packages/ui/src/code/<平台>/ops.ts        平台特有 op(figma/variables 等)
                  packages/shared/src/core/*                跨平台执行体(execute/buildNode/nodes/
                                                            component/update/normalize/serialize/export)
                  packages/ui/src/code/<平台>/host.ts       平台适配
```

第 ⑤ 层是绝大多数设计语义 bug 的所在地。第 ②③④ 层管参数、门控、超时、连接。

## 平台类型是唯一真源（报错第一站，先于任何「平台不支持」的结论）

涉及**平台 API / 字段名 / 参数名 / 同步异步**的报错，先 grep 该平台的 typings 拿行号依据，
再回代码落映射；**不要凭记忆改，也不要急着把锅推给平台**。

| 平台 | typings（pnpm 形式） |
|---|---|
| 即时设计 | `node_modules/.pnpm/@jsdesigndeveloper+plugin-typings@*/node_modules/@jsdesigndeveloper/plugin-typings/plugin-api.d.ts` |
| Figma | `node_modules/.pnpm/@figma+plugin-typings@*/node_modules/@figma/plugin-typings/plugin-api.d.ts` |
| MasterGo | `node_modules/.pnpm/@mastergo+plugin-typings@*/node_modules/@mastergo/plugin-typings/dist/index.d.ts` |

**两向都要核**——只核一向就会得出错结论（两条都是本仓真机上撞到的）：

- **类型有、运行时没有**：MG 的 `InstanceNode.mainComponent`、组件/实例的 `children` 都是声明了但运行时不给
  （后者要用同 mixin 的遍历入口 `findAll` / `findChildren`）；
- **类型没有、运行时却有**：MG 的 `InstanceNode.mainComponentId`（正是靠它解析主组件）。

**报错先自检前置条件，再扩散到平台**。本仓踩过的坑：MG 绑定属性报
`Can only set component property references on symbol sublayer`，看着像平台不支持，
实际是「本仓 `create_component` 只建空壳，子层要调用方 `reparent` 进去」——组件里根本没有子层。
归因平台会写出错误台账，比没有台账更坏。

**落到代码时的要求**（评审会看）：

- 映射表/门面里每条平台差异**带 typings 行号**（如「3097 行」），改的人能回原处核；
- `sync-guarantee.ts` 的编译期断言守「typings 里确实有」——官方收编后断言失败，提醒回来复核；
- 判定「运行时没有」的项要在**真机**上确认过，而不是只看类型。



拿 `list` 输出的**骨架**字段比对:

| 骨架特征 | 层 | 首要排查 |
| --- | --- | --- |
| `参数校验失败(<tool>): <字段>: <原因>` | ② | 该工具的 `inputSchema`(`tools/<组>.ts`);共享 zod 片段在 `packages/shared/src/schemas/inputs.ts` |
| `工具 <tool> 在当前平台不可用,已拦截` | ② | 工具定义的 `platforms` 字段;门控逻辑 `src/platform-state.ts` |
| `平台 X 不支持操作: <op>(支持: …)` | ⑤ | `ui/src/code/plugin.ts` 的 platformOps 白名单;对应 `ui/src/code/<平台>/ops.ts` |
| `find 失败: …` | ⑤ | `plugin.ts` 的 `case 'find'` → `shared/src/core/nodes.ts`、`serialize.ts` |
| `node_op <op> 失败: …` | ⑤ | `plugin.ts` 的 `case 'node_op'` → `shared/src/core/nodes.ts` |
| `component_op <op> 失败: …` | ⑤ | `plugin.ts` 的 `case 'component_op'` → `shared/src/core/component.ts` |
| `execute 失败: …` / `无效的 type` / `ops 为空数组` | ⑤ | `shared/src/core/execute.ts`、`buildNode.ts` |
| `<path> 必须是 …`(带路径的字段校验) | ⑤ | `shared/src/core/normalize.ts` |
| `set_fill` / `set_stroke` / `set_effects` / `set_layout` … `失败` | ⑤ | `plugin.ts` 对应 case → `shared/src/core/update.ts` |
| `没有找到…的节点` / `没有要…的节点` | ⑤ | 文案里那个 op 的实现处(核心是**空集合前置校验**) |
| `请求超时: <id> <method> 耗时=<n>ms` | ④ | 默认 30s,见 `pending.ts` 与 `bridgeTool` 的 `timeout` |
| `<method> 失败: not a function`(**创建类工具正常**) | ⑤ | 引擎沙箱缺 ES2020+ API(产物 `target: es6` 无 polyfill):查 `ui/src/code/plugin.ts` 的方法判定口等引擎侧代码,用手写替代;`tests/engine-api-compat.test.ts` 是这类 API 的禁止清单 |
| `请求被拒(插件未连接)` | ④ | `bridge.ts` |
| `端口 <n> 被非 text-to-design MCP 服务占用` / `daemon 启动超时` | ④ | `daemon/run.ts` |
| Figma 专有 API 抛错(`Cannot call with documentAccess: dynamic-page` 等) | ⑤ | `ui/src/code/figma/` + `ui/scripts/vite-plugin-manifest.ts` |
| MasterGo 侧属性写不进去 / 读回 undefined / 文本样式无变化 | ⑤ | `ui/src/code/mastergo/`(属性名与枚举差异看 `node-facade.ts` 的映射表;宿主层符号看 `host.ts`)。**字段名/参数名不确定时别猜**:权威真源是 `@mastergo/plugin-typings` 的 `dist/index.d.ts`(pnpm 下 `node_modules/.pnpm/@mastergo+plugin-typings@<ver>/node_modules/@mastergo/plugin-typings/dist/index.d.ts`),按符号 grep 出**行号**,再回 `node-facade.ts` 落映射 —— 映射表、`sync-guarantee.ts` 的断言、`platform-limits.md` 的条目都要求带行号依据 |

找不到对应行时,直接全文搜骨架里最长的中文片段(`throw new Error` 都是字面量),命中率很高。

## 一次只修一条

一个 run 里可能攒了十几条未决。**逐条闭环,不要批量改**。

理由:批量改完一起回归,失败时无法归因是哪处改动引入的。而且 `handle` 记录的是
「指纹 ↔ 修复」的对应关系,批量改只能写出一句含糊的 `--fix`。

例外:两条指纹明显同根(同一个函数的两个出口),可以一起改,但 `handle` 要
分别调用两次,各自写清影响。

## 修法标准

按优先级:

1. **消根因**。别在下游加特判掩盖上游的错。例:入参该归一化的地方没归一化,
   就在归一化层补,而不是在 20 个调用点各加一次判断。
2. **前置校验优于后置报错**。空集合、非法枚举、缺失前置条件,在进入昂贵操作
   (跨进程往返、批量写画布)之前拦掉并点名。参考 `shared/src/core/nodes.ts` 里
   `分组至少需要 2 个节点` 这类做法 —— 先校验数量再动手。
3. **文案要可诊断**。仓库既有风格是「点名字段/值 + 给支持列表」:
   - 好:`无效的 type: "xxx"(支持 FRAME|RECT|TEXT|…)`
   - 差:`类型错误`
   - 好:`没有找到组件: 220:293`
   - 差:`组件不存在`
   改文案会让该指纹"失联"(旧指纹不再命中),这是可接受的 —— 新的可观测事实
   值得一条新的待办,见 `fingerprint.md`。
4. **留护栏**。容易回退的坑,在改动点写注释说明「为什么不这么写」。
   本仓已有范本:`ui/scripts/vite-plugin-manifest.ts` 里关于 `documentAccess`
   的注释,和 `ui/src/code/figma/meta.ts` 里关于 `getMainComponentAsync` 的说明。

## 工作样例:documentAccess

真实发生过的一轮,完整对应本 skill 的闭环(记录 → 定位 → 改 → 回归 → 记账)。

**症状**(日志历史,现已闭环)

```
[ERROR] 工具 jsd_create_instance 执行失败: component_op create_instance 失败:
        in getMainComponent: Cannot call with documentAccess: dynamic-page.
        Use node.getMainComponentAsync instead.
```

**定位** `component_op create_instance` → `ui/src/code/plugin.ts` 的 `case 'component_op'`
→ `shared/src/core/component.ts` 的实例化路径 → 读 `node.mainComponent`(同步 API)。

**根因** Figma manifest 里写了 `documentAccess: 'dynamic-page'`。该模式下 Figma 禁用
一批同步 API,`mainComponent` 直接抛错。而 core 引擎与 adapter 大量依赖同步 API,
整条组件实例化链路失效 —— 不只是这一个工具。

**修法** 移除 `documentAccess`,回到 legacy 访问模式。而不是把 `mainComponent` 换成
`getMainComponentAsync` —— 那样只治一个出口,同步 API 的其它调用点照旧炸。

**护栏** 在 `vite-plugin-manifest.ts` 的 manifest 字面量处留注释,说明「不写
documentAccess」的原因;并在 `figma/meta.ts` 的能力面里补一句,说明异步 API 零调用、
已从能力枚举移除,**防止后来者以为存在异步通路**。

**回归** `jsd_create_instance` 原用例重放,确认不再抛错;顺带确认组件实例化链路上
其它工具(序列化 INSTANCE 节点等)也恢复正常。

这个例子说明了三条通用纪律:根因在上游配置层而非报错点;修法选「消根因」而非
「加特判」;护栏要写在**下一个想改这里的人会看到的地方**。

## 修完的自检清单

- [ ] `pnpm run typecheck` 通过
- [ ] 报错文案点名了字段 / 节点 / 支持值
- [ ] 容易回退的坑有注释护栏
- [ ] 回归用**原用例**重放,`record` 带 `--stage regress`,得 `suppressed` 之外的干净结果
- [ ] `handle` 时 `--fix` / `--file` / `--commit` / `--verified-by` 四项齐全
- [ ] 改了插件侧 UI 代码要 `pnpm build`,让 `packages/ui/dist/` 跟上
      (回归前必须重新构建并重载插件,否则测的还是旧脚本)
