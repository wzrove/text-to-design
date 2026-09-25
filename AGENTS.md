# text-to-design (jsDesign MCP) 开发 & 使用须知
 
 Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"
- Trust code. Code not comment. Delete comment restating code. Comment only intent/reason/constraint code can't express.


 1. 静态字典统一分类放到`packages/shared/src/dicts`下

## 验证命令（不产出编译产物）

- 类型检查（只查不产出）：`pnpm run typecheck`（即 `tsc --noEmit`）。
- 跨包不变式测试：`pnpm run test`（含技能文档体积门禁，见下）。

## jsd_* 工具报错 / 改动验证

- 报错闭环（捕获 → 定位 → 修复 → 验证 → 原用例回归 → 收口）走项目级技能 `.agents/skills/mcp-tdd/`。
- 记账唯一通道：`docs/mcp-errors/` 台账，入口 `node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs`。
- 台账瘦身用同一入口的 `archive` 子命令（**独立节奏，不是每轮动作**）。归档 ≠ 注销：去重闸门同时查
  归档库，回归阶段复发会把条目整块搬回主库并置 `regressed`。**别手删台账文件** —— 手删才是拆闸门。
- **现象不用编号**（旧的编号字典 `references/timeline.md` 已废、文件已删）：报错认台账指纹，
  平台限制认 `references/platform-limits.md` 的现象描述，修复理由认 `docs/design-decisions/`。
  别再起新编号 —— `tests/skill-doc-budget.test.ts` 会拦住回潮。
- 改了 `shared/` 或 `ui/` → 必须 `pnpm build` + 在**对应平台的客户端里重载插件**（jsDesign / Figma /
  MasterGo 各载各的 `dist/<平台>/manifest.json`），否则验证的是旧产物。

## 报错闭环 ↔ 设计决策（两个技能怎么配合）

- 单点 bug（参数校验、文案点名、normalize 兜底、单文件少量行）→ 直接改，**不开决策记录**。
- 结构压力（同一指纹已闭环又复发、修法新增分支/抽象、跨 ≥3 文件、落在既有决策的「影响范围」内）
  → 先走 `.agents/skills/software-design-patterns/` 出结论并落 `docs/design-decisions/NNNN-*.md`，
  再按记录改，`handle` 时用 `--decision NNNN` 挂上（CLI 对复发指纹**强制**要求，见下）。
- 台账是唯一记账通道，决策记录是唯一决策通道，两边靠 `--decision` / `list --decision NNNN` 互查。
- **依赖单向**：`software-design-patterns` 是独立可移植的通用技能，**不引用 mcp-tdd、不引用台账**
  （判门槛与回填由调用方负责）。两者怎么交接由 mcp-tdd 单方面持有，契约见
  `.agents/skills/mcp-tdd/references/bookkeeping.md` 的「转投设计决策」。

## 技能文档体积（有硬上限，由测试守）

- `.agents/skills/**` 与 `docs/design-decisions/INDEX.md` 会**整份进 llm 上下文**，体积上限写在
  `tests/skill-doc-budget.test.ts`，超限 CI 红。
- 超限时的正确动作：把稳定的表格/清单移进该技能的 `references/`，SKILL.md 只留主流程 + 指针。
  不要把阈值调高，也不要删规则。
- 新增 `references/*.md` 必须写进 SKILL.md 的加载路径（测试会查孤儿文件）。