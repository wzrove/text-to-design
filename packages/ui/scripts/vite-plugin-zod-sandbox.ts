/**
 * vite-plugin-zod-sandbox — 第三方包沙箱适配(决策 0012 + 0027)
 *
 * 插件运行时(jsDesign / Figma / MasterGo 的插件沙箱)提供的宿主设施比
 * Node / 浏览器**少**。zod 在模块顶层用了两种沙箱里没有的东西,加载即抛:
 *
 * 1. **裸 `globalThis` 标识符**(0012,jsDesign 的 Proxy scoped evaluator 把
 *    它影子化为 undefined)→ `v4/core/core.js` 与 `registries.js` 的顶层
 *    `globalThis.__zod_globalConfig` 抛
 *    "Cannot read properties of undefined (reading '__zod_globalConfig')"。
 *    把 globalThis 换成 `Function('return this')()` 也救不了 —— Proxy
 *    严格模式下它仍返回 undefined。
 *
 * 2. **`BigInt` 全局**(0027,**三平台都缺**)→ `v4/core/util.js` 的
 *    `BIGINT_FORMAT_RANGES` 是**模块顶层的 export const**,初始化表达式里有
 *    裸 `BigInt(...)` 调用(int64 / uint64 两组界限)。`@__PURE__` 只标在内层
 *    `BigInt()` 上(作者本意是让它可摇树),外层对象字面量照旧 eager ⇒ 压缩后
 *    以 `var Le={int64:[BigInt(...),...]}` 原样存活,加载即抛
 *    "ReferenceError: 'BigInt' is not defined"(栈顶 `<eval> (eval.js:15)`,
 *    即模块初始化段,任何工具都还没被调用)。同文件的 `NUMBER_FORMAT_RANGES`
 *    被 `@__PURE__` IIFE 包住了 —— 作者知道这个坑,只是漏了 bigint 那份。
 *
 * 修法(两种都在 transform 阶段做,共用一次插入点):
 * ① 把模块内所有 `globalThis` 标识符替换为模块局部宿主 `__zodLocal`;
 * ② 在模块顶层注入 `__sandboxBigInt` 探测桩,并把模块体内裸 `BigInt` 改指向它。
 *
 * 注入桩的形态:
 *   var __sandboxBigInt = (typeof BigInt === 'function') ? BigInt
 *                       : function (v) { return v; };
 *
 * - **必须用 `typeof BigInt === 'function'` 探测**,不能用
 *   `typeof BigInt !== 'undefined'`:后者已被 0012 证实会被压缩器折叠回裸
 *   标识符。`typeof` 对**未声明的标识符**是安全的(返回 'undefined',不抛)。
 * - 沙箱里有真 `BigInt` 时走真身,桩只是兜底 ⇒ 注入对「运行时有 BigInt」的
 *   行为**零改变**。
 * - 桩返回原值而非抛错:本仓不用 `z.bigint()` / `bigint_format`,
 *   `BIGINT_FORMAT_RANGES` 里的界限值不会被真读到 —— 桩只需保证模块顶层不抛。
 *   哪天真的用了 `z.bigint()`,拿到的界限是错的,属**已知下限**,退出条件
 *   里已登记「用 z.bigint() 时必须回来复核本桩」。
 *
 * `enforce: 'pre'` —— 必须抢在 rolldown 默认的 globalThis → Function('return this')
 * 转换之前;替换后代码不再含裸 globalThis 标识符,rolldown 无目标可替换。
 *
 * 三平台统一挂载:0012 那半个问题只在 jsdesign 的 Proxy 沙箱里出现,但
 * 0027 的 `BigInt` 缺失是**三平台共有**(已核实三份 dist 各含一份顶层裸调用),
 * 所以 figma / mastergo 分支同样要挂。
 *
 * 决策记录:docs/design-decisions/0012-*.md、0027-*.md
 */
import type { Plugin } from 'vite';

// 按**包名**匹配、不锁补丁版本。0012 原本硬编码 `zod@4\.5\.4`,而
// pnpm-workspace.yaml 的 catalog 是 `^4.5.4`、实际锁到 zod@4.6.5 —— 正则
// 当时并未命中,0012 的 globalThis 替换实为失效状态(rolldown 的默认转换
// 恰好替它兜住了那一半,所以没暴露)。锁死版本会让同一个坑在每次升 zod 时
// 静默复发,故改为只认包名。
const ZOD_PATH_RE =
  /[\\/]node_modules[\\/]\.pnpm[\\/]zod@\d+\.\d+\.\d+[\\/]node_modules[\\/]zod[\\/]/;

/**
 * 模块顶层注入的桩。命名带双下划线前缀,避免与 zod 内部标识符撞名;
 * `var` 在 ESM 模块顶层合法(顶级声明,与 import 同阶段)。
 */
const INJECT = `
var __zodLocal = {};
var __sandboxBigInt = (typeof BigInt === 'function') ? BigInt : function (v) { return v; };
`;

export default function zodSandboxFix(): Plugin {
  return {
    name: 'zod-sandbox-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!ZOD_PATH_RE.test(id)) return;

      const hasGlobalThis = code.includes('globalThis');
      // zod 里 globalThis 只用于 __zod_globalConfig / __zod_globalRegistry
      // 两组引用,所有出现都跟在 `globalThis` 标识符之后(无论是直接 .属性
      // 还是 =globalThis). 后一种形态 `(_a = globalThis).__zod_globalConfig`
      // 的 globalThis 不能用 `globalThis.__zod_globalConfig` 正则匹配
      // (globalThis 后跟的是 `)`),所以直接替换所有 `globalThis` 标识符更稳;
      // 范围限定为 zod 模块内部,不影响其它代码。
      //
      // 用 `\bBigInt\b` 同理,但要**先**替换 BigInt —— `__sandboxBigInt`
      // 里含 `BigInt` 子串,反过来做会把刚注入的桩自己也改写掉。
      // 归一顺序:先 BigInt(裸标识符 → 桩),再 globalThis(→ __zodLocal)。
      // 两者互不包含,顺序其实无碍;显式写死只为避免以后有人加第三条时踩到。
      const needsBigInt = /\bBigInt\b/.test(code);
      if (!hasGlobalThis && !needsBigInt) return;

      if (needsBigInt) {
        code = code.replace(/\bBigInt\b/g, '__sandboxBigInt');
      }
      if (hasGlobalThis) {
        code = code.replace(/\bglobalThis\b/g, '__zodLocal');
      }

      // 找到第一个 import 之后的行尾;找不到(无 import)则在文件最前面注入。
      const firstImport = code.indexOf('\nimport ');
      if (firstImport === -1) {
        code = INJECT + code;
      } else {
        const insertAt = code.indexOf('\n', firstImport + 1);
        code = code.slice(0, insertAt) + INJECT + code.slice(insertAt);
      }

      return { code, map: null };
    },
  };
}
