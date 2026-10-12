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


