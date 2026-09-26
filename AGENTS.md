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
- Write comment only for:
  - Why non-obvious (workaround, tradeoff, history)
  - Constraint code can't express (external API quirk, ordering req)
  - Warning (footgun, perf cliff)
- 静态字典统一分类放到`packages/shared/src/dicts`下


## 验证命令（不产出编译产物）

- 类型检查（只查不产出）：`pnpm run typecheck`（即 `tsc --noEmit`）。
- 跨包不变式测试：`pnpm run test`（含技能文档体积门禁，见下）。

## 改动验证

- 改了 `shared/` 或 `ui/` → 必须 `pnpm build` + 在**对应平台的客户端里重载插件**（jsDesign / Figma /
  MasterGo 各载各的 `dist/<平台>/manifest.json`），否则验证的是旧产物。

## 设计决策

- 单点 bug（参数校验、文案点名、normalize 兜底、单文件少量行）→ 直接改，**不开决策记录**。
- 结构压力（同一问题修完又复发、修法新增分支/抽象、跨 ≥3 文件、落在既有决策的「影响范围」内）
  → 先走 `.agents/skills/software-design-patterns/` 出结论并落 `docs/design-decisions/NNNN-*.md`，
  再按记录改。
- **依赖单向**：`software-design-patterns` 是独立可移植的通用技能，不引用本仓任何具体工具
  （判门槛与回填由调用方负责）。
- 决策记录是唯一决策通道。**别给琐碎改动开记录** —— 索引一旦被小条目灌满，
  工作流第 1 步「先查日志」就变成噪音源。

## 文档通道与体积（上限由测试守）

- **一个事实一份**：每条规则只有一个 owner 文件写全，别处只留指针。摘抄的那天起两份就开始漂。
- `.agents/skills/**` 与 `docs/design-decisions/INDEX.md` 会**整份进 llm 上下文**，体积上限写在
  `tests/skill-doc-budget.test.ts`，超限 CI 红。
- 超限时的正确动作：把稳定的表格/清单移进该技能的 `references/`，SKILL.md 只留主流程 + 指针。
  不要把阈值调高，也不要删规则。
- 新增 `references/*.md` 必须写进 SKILL.md 的加载路径（测试会查孤儿文件）。
- 索引体积治理阈值见 `.agents/skills/software-design-patterns/references/decision-log.md`。