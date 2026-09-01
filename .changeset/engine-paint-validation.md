---
"text-to-design-mcp": patch
"text-to-design-ui": patch
---

fix: 修掉 jsDesign 引擎侧 set_fills/set_effects 校验失败

- shared: Paint/颜色/效果 schema 全面收紧 —— rgb/rgba/paint/effect 加 strict(多出的键直接报错而非静默剥离)、SOLID 的 blendMode 改用枚举、children 从 z.any 改为 z.lazy 递归校验节点树(嵌套坏 fills 在 MCP 层即被拦);
- shared: 新增引擎赋值前归一化(buildNode/update 接入):0-255 色值自动转 0-1、SOLID color.a 移到 paint 级 opacity、阴影缺 blendMode/visible 补默认值、fills/effects 非数组容器报中文错、booleanOperation 白名单校验、vectorPaths 缺省 windingRule;
- mcp: jsd_batch 直调 executor 补 inputSchema 校验,内层工具坏参数不再穿透到引擎;
- ui: 插件错误日志带堆栈与请求摘要,便于定位 "not a function";
- shared: clone 未命中节点报错附请求 ids 与 jsd_find 提示
