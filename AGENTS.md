# text-to-design (jsDesign MCP) 开发 & 使用须知
 
 1. 静态字典统一分类放到`packages/shared/src/dicts`下

## 验证命令（不产出编译产物）

- 类型检查（只查不产出）：`pnpm run typecheck`（即 `tsc --noEmit`）。