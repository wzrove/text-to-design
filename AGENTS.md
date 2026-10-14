# text-to-design (jsDesign MCP) 开发 & 使用须知
 
 Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"
- Code = single source of truth. Comments ≠ truth.
- Default: no comment.
- 必须写时：一句话，能短则短。
- 只写 why、约束、警告。
- 不写 what，不重复代码。
- 能靠命名/类型表达的，绝不写注释。
- 静态字典统一分类放到`packages/shared/src/dicts`下

## 决策记录引用

主键两套并存：旧记录四位数字号（`0024`，只读，不改名不重编）、新记录 8 位短 hex（`25827d0c`）。
注释里引记录一律写 `dec <标识>`，两种形态同等对待：

```ts
// 类别适用性在值域守卫之前判(dec 25827d0c)：…
// 不允许静默失效(dec 0007)
```

- 为什么不写裸编号：`\b[0-9]{4}\b` 在包内先撞上 97 个 `2026`(日期)、18 个 `1024`(体积)与一片
  typings 行号，假命中比真引用多，机器无法验证指针有效性；`dec` 前缀让门禁只扫标注即可。
- 归属规则：写**做出这次形状变更的那条**，不是「相关的那条」。
- 旧注释不追认，但棘轮只许降：`node scripts/decision-refs.mjs check`（测试 `tests/decision-refs.test.ts`）。
- 反查：`node scripts/decision-refs.mjs locate <file>`（这个文件牵到哪些记录）/ `resolve <标识>`；
  取号与改状态仍走 `.agents/skills/software-design-patterns/scripts/new_decision.mjs`（仓内代码不 import 它，见 0009）。
- 索引两个文件都要看：`INDEX.md`（现行有效 + 最近 10 条）与 `INDEX-2026.md`（全量年档）。只查一个会漏。


## 验证命令（不产出编译产物）

- 只做类型检查（只查不产出）：`pnpm run typecheck`（即 `tsc --noEmit`）。
- 不允许样式lint检查
- 不跑test,让用户自己 `run test` 

## 改动验证

- 改了 `shared/` 或 `ui/` → 必须 `pnpm build`(让用户自己build) + 在**对应平台的客户端里重载插件**（jsDesign / Figma /
  MasterGo 各载各的 `dist/<平台>/manifest.json`），否则验证的是旧产物。
- 改了 `mcp-server/` → `pnpm build` 后还得**重启常驻 daemon**：它从启动那刻起就一直跑旧产物
  （实测 2026-10-08 有个 daemon 从 09-29 活着），只重载插件测不出 mcp-server 侧改动。
  `ps aux | grep mcp-server/dist/index.js` 找常驻那个进程，杀掉即按需重生。


