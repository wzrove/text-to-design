# text-to-design (jsDesign MCP) 开发 & 使用须知
 
 1. 静态字典统一分类放到`packages/shared/src/dicts`下

## 验证命令（不产出编译产物）

- 类型检查（只查不产出）：`pnpm run typecheck`（即 `tsc --noEmit`）。

## jsd_* 工具报错 / 改动验证

- 报错闭环（捕获 → 定位 → 修复 → 验证 → 原用例回归 → 闭环）走项目级技能 `.agents/skills/mcp-tdd/`。
- 记账唯一通道：`docs/mcp-errors/` 台账，入口 `node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs`。
  历史归档已冻结在 `.agents/skills/mcp-tdd/archive/`，只读查阅。
- 改了 `shared/` 或 `ui/` → 必须 `pnpm build` + 在即时设计里**重载插件**，否则验证的是旧产物。