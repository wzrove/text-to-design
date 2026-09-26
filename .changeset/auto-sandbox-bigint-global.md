---
"text-to-design-ui": patch
---

fix: 三平台插件加载即崩于 zod 顶层裸 `BigInt()`（`ReferenceError: 'BigInt' is not defined`）。插件沙箱不提供 `BigInt` 全局，而 `zod@4.6.x` 的 `BIGINT_FORMAT_RANGES` 是模块顶层 export const、初始化表达式里裸调 `BigInt(...)`。把 `vite-plugin-zod-sandbox` 从「globalThis 单点替换」扩写为三平台通用的沙箱适配器：注入 `typeof BigInt === 'function' ? BigInt : (v) => v` 探测桩并把模块体内裸 `BigInt` 改指向它；同时把 zod 路径正则从锁死 `4.5.4` 改为按包名匹配（见 0027）
