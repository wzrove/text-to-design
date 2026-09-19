/**
 * vite-plugin-zod-sandbox — zod 模块沙箱化
 *
 * 决策 0012：jsDesign 插件沙箱（Proxy 作用域，scoped evaluator）把裸
 * globalThis 标识符影子化为 undefined；zod 4.5.4 的 v4/core/core.js 与
 * v4/core/registries.js 在模块顶层直接访问 globalThis.__zod_globalConfig /
 * globalThis.__zod_globalRegistry，加载即抛
 * "Cannot read properties of undefined (reading '__zod_globalConfig')"。
 * 把 globalThis 替换为 Function('return this')() 也救不了 —— Proxy
 * 严格模式下 Function('return this')() 仍返回 undefined。
 *
 * 修法：transform 阶段把 zod 模块里所有 `globalThis` 标识符（zod 4.5.4
 * 源码里只用于 __zod_globalConfig / __zod_globalRegistry 两组引用，详见
 * `node_modules/zod/v4/core/{core,registries}.js`）替换为模块内 const
 * 宿主 __zodLocal，并在模块顶层注入 `var __zodLocal = {};`。
 *
 * zod 的赋值形态 `(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {})`
 * 在替换后会变成 `(_a = __zodLocal).__zod_globalConfig || (_a.__zod_globalConfig = {})`，
 * 等价于「模块局部 const 上读写一个属性」，永远有定义。每个 zod 模块的 __zodLocal
 * 独立即可 —— core.js 只用 __zod_globalConfig（AOT 钩子）、registries.js 只用
 * __zod_globalRegistry（schema 注册表），互不依赖。
 *
 * 必须 enforce: 'pre' 抢在 rolldown 默认的 globalThis → Function('return this')
 * 转换之前；替换后代码不再含裸 globalThis 标识符，rolldown 无目标可替换。
 *
 * 仅 jsDesign 沙箱需要，figma 平台不挂本插件。
 */
import type { Plugin } from 'vite';

// 锁定 zod 版本，避免下次升级时 v5/vNext 改了顶层初始化形态、我们的
// 字面替换失效。一旦升级 zod，必须在同一 PR 里复核：(1) 全仓 globalThis
// 引用是否仍只在 __zod_globalConfig / __zod_globalRegistry 两组;
// (2) 模块顶层是否有新的「先 import 后语句」结构需要适配注入点。
const ZOD_PATH_RE =
  /[\\/]node_modules[\\/].pnpm[\\/]zod@4\.5\.4[\\/]node_modules[\\/]zod[\\/]/;

export default function zodSandboxFix(): Plugin {
  return {
    name: 'zod-sandbox-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!ZOD_PATH_RE.test(id)) return;
      // zod 4.5.4 源码里 globalThis 只用于 __zod_globalConfig /
      // __zod_globalRegistry 两组引用,所有出现都跟在 `globalThis` 标识符
      // 之后(无论是直接 .属性 还是 =globalThis). 后一种形态
      // `(_a = globalThis).__zod_globalConfig` 的 globalThis 不能用
      // `globalThis.__zod_globalConfig` 正则匹配(globalThis 后跟的是 `)`),
      // 所以直接替换所有 `globalThis` 标识符更稳;范围限定为 zod 模块
      // 内部,不影响其它代码。
      if (!code.includes('globalThis')) return;
      code = code.replace(/\bglobalThis\b/g, '__zodLocal');

      // 模块顶层注入。找到第一个 import 之后的行尾;找不到(无 import)则
      // 在文件最前面注入。var 在 ESM 模块顶层是合法的(顶级声明,与
      // import 同阶段),命名 __zodLocal 加上双下划线前缀,避免与 zod
      // 内部任何已有标识符撞名。
      const inject = '\nvar __zodLocal = {};\n';
      const firstImport = code.indexOf('\nimport ');
      if (firstImport === -1) {
        code = inject + code;
      } else {
        const insertAt = code.indexOf('\n', firstImport + 1);
        code = code.slice(0, insertAt) + inject + code.slice(insertAt);
      }

      return { code, map: null };
    },
  };
}
