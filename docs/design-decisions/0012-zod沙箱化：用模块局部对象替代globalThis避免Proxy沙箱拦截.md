# 0012. zod 沙箱化：用模块局部对象替代 globalThis，避免 jsDesign Proxy 沙箱拦截

- **日期：** 2026-09-19
- **状态：** 已采纳
- **影响范围：** `packages/ui/scripts/vite-plugin-zod-sandbox.ts`（新）、`packages/ui/vite.config.ts`、`packages/ui/dist/jsdesign/code.js`（构建产物）；不影响 figma 平台（沙箱不同）
- **相关记录：** 暂无

## 压力

jsDesign 插件加载 `code.js` 即崩，栈：

```
TypeError: Cannot read properties of undefined (reading '__zod_globalConfig')
```

根因链路：

1. zod 4.5.4 的 `v4/core/core.js` 与 `v4/core/registries.js` 在**模块顶层**直接访问 `globalThis.__zod_globalConfig` / `globalThis.__zod_globalRegistry`，用作跨模块共享的注册表与 AOT 编译钩子宿主（`(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {})`）。
2. jsDesign 插件代码跑在 **scoped evaluator**（Proxy 作用域，堆栈 `Proxy.eval` → `createScopedEvaluatorFactory(blob:js.design)`）里。Proxy 用 `get` trap 把裸 `globalThis` 标识符影子化为 `undefined` —— 访问 `globalThis.__zod_globalConfig` 实质是 `undefined.__zod_globalConfig`，栈顶就是这条 `Cannot read properties of undefined (reading '__zod_globalConfig')`。
3. **同一指纹** `693534d3ff4f` 复发两次（errors.jsonl 第 14–15 行）。第一次的"修法"（handled.json 第 152 行所述"vite.config.ts `define` 把 globalThis 替换为 `Function('return this')()`"）从未真正落地 —— `git blame` 显示 vite.config.ts 的 `define` 自 2026-08-12 起就**只有** `global: '{}'` 一条；dist 里 zod 出现的 `Function(\`return this\`)()` 是 **rolldown 默认行为**（把裸 globalThis 转 `Function('return this')()` 作为兼容性优化），与 vite.config.ts 的 define 无关。
4. **更糟的是 `Function('return this')()` 在 Proxy 沙箱里也不可靠** —— 沙箱在严格模式下执行，Function 创建的函数体独立求值 `this`，返回 `undefined`（沙箱里的 Proxy 也是 undefined —— 见上面 dist 头部 sandbox shim 块 `global-patched: false` 的诊断标记）。错误不变。

| 候选 | 结论 | 排除理由 |
|---|---|---|
| **vite transform 阶段替换 zod 模块代码**：把 `globalThis.__zod_globalConfig` / `globalThis.__zod_globalRegistry` 替换为 `__zodLocal.__zod_*`，模块顶层注入 `var __zodLocal = {};`；`enforce: 'pre'` 抢在 rolldown 默认的 globalThis → Function('return this') 转换之前 | 采用 | 每个 zod 模块的 `__zodLocal` **独立**即可 —— `core.js` 只用 `__zod_globalConfig`、registries.js 只用 `__zod_globalRegistry`，两者不互通 globals（前者管 AOT 钩子，后者管 schema 注册表）。彻底绕开 Proxy 沙箱对全局标识符的拦截 |
| vite `define` 把 `globalThis` 替换为 `Function('return this')()` | 排除 | 已实证无效（第一次闭环失败）：Function 在 Proxy 严格模式下返回 undefined；且 rolldown 默认已做这事，define 是冗余配置 |
| `typeof x !== 'undefined' ? x : fallback` 守卫写法 | 排除 | 会被压缩器折叠回裸 `globalThis` 标识符，沙箱仍拦截 |
| 给 jsDesign 提 issue / 修沙箱本身 | 排除 | 不在本仓范围 |
| 弃用 zod（手写 schema） | 排除 | 改动量爆炸；shared 的 18 个 schema 文件全部要重写 |

## 结论

**vite 自定义插件在 transform 阶段重写 zod 模块代码，模块局部 const 做 globals 宿主。**

1. **新插件 `packages/ui/scripts/vite-plugin-zod-sandbox.ts`**：导出 `zodSandboxFix()`。
   - `enforce: 'pre'` —— 必须早于 rolldown 默认行为。
   - 仅匹配 zod 模块（`/node_modules\/.pnpm\/zod@4\.5\.4\/node_modules\/zod\//`）。
   - 正则替换 `globalThis.__zod_globalConfig` → `__zodLocal.__zod_globalConfig`、`globalThis.__zod_globalRegistry` → `__zodLocal.__zod_globalRegistry`。
   - 模块**顶层注入** `var __zodLocal = {};`（在第一个 `import` 之后），让模块顶层初始化代码 `(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {})` 等价于 `__zodLocal.__zod_globalConfig || (__zodLocal.__zod_globalConfig = {})`，export 出去的 `globalConfig` / `globalRegistry` 引用的是模块局部 const，永远有定义。
2. **`vite.config.ts`** 的 jsdesign 分支 `plugins` 数组加 `zodSandboxFix()`；figma 分支不加（沙箱不同，不需要）。
3. **不要**再用 `define: { globalThis: 'Function("return this")()' }` 这类"绕开"方案 —— 它在 Proxy 沙箱里同样失败；本记录是唯一修法。
4. **不动 zod 源码**（node_modules）：transient 的源代码改动会被 pnpm install 覆盖，源码注释也写不进 `node_modules`。

## 最小落地

- **批次 1（plugin + vite.config）**：写 `vite-plugin-zod-sandbox.ts`、在 vite.config.ts 的 jsdesign 分支接入。`pnpm typecheck`（新增脚本文件需在 tsconfig include 内，否则加到 `packages/ui/tsconfig.json` 的 include）。
- **批次 2（验证）**：`pnpm build`；检查 `dist/jsdesign/code.js` 中 `__zod_globalConfig` / `__zod_globalRegistry` 引用**不再**经由 `Function(\`return this\`)` 或裸 `globalThis` —— 改用 `__zodLocal`。7 处 zod 引用全部替换为模块局部 const 访问。

## 退出条件

- `dist/jsdesign/code.js` 中 zod 的 7 处 `__zod_globalConfig` / `__zod_globalRegistry` 引用全部走 `__zodLocal.*`，无 `Function('return this')()` 形式的 zod 访问。
- 即时设计**重载插件**后，`jsd_ping` 回 `connected:true`（加载成功）；指纹 `693534d3ff4f` 不再复发 —— 这是唯一可信的验证（沙箱行为无法在 CI / Node 环境复现）。