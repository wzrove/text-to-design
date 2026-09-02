# text-to-design (jsDesign MCP) 开发 & 使用须知
 
- Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"


## 验证命令（不产出编译产物）

- 类型检查（只查不产出）：`pnpm run typecheck`（即 `tsc --noEmit`）。