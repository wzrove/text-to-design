import type { Locale, T } from 'text-to-design-shared';
import { createT, normalizeLocale } from 'text-to-design-shared';

/**
 * MCP 侧的 locale 与渲染器(见 docs/design-decisions/0016)。
 *
 * **默认保持 `zh-CN`**:工具面(`tools/list` 的 title/description、字段说明、prompts)
 * 历来是中文,且当前的模型调用方以中文用户为主 —— 换默认值会让所有既有用户看到
 * 另一种语言,那是一次与 i18n 无关的行为变更。要英文就 `TEXT_TO_DESIGN_LANG=en`。
 *
 * ## 为什么是显式注入的 `t`,而不是模块级单例
 *
 * locale 是**进程级**事实(daemon 常驻,一次启动只读一次 env),但渲染器必须能取到它。
 * 按 0002 的口径:显式往下传。装配点在 `buildServer`(它把 `McpI18n` 交给每个
 * registrar),而不是某个模块里可被任意改写的全局变量。
 *
 * ## 为什么不像 UI 那样多一层"语言信号"
 *
 * UI 要热切换,所以 `useLocale` 是响应式的;MCP 侧**不做热切换** —— 工具目录是对外
 * 契约(0016 候选表:重跑 registerTool 会打乱宿主索引),所以 `t` 一旦装配就是常量,
 * 换语言要重启 daemon(与 `probe.warnIfDaemonStale` 同源)。
 */
export interface McpI18n {
  readonly locale: Locale;
  /** 按当前 locale 取文案;键集在编译期检查(catalog 的 `MessageKey`) */
  readonly t: T;
}

/** 默认语言。改这一行即改所有未显式配置的部署 */
export const MCP_DEFAULT_LOCALE: Locale = 'zh-CN';

/**
 * 解析 MCP 侧 locale:`TEXT_TO_DESIGN_LANG` → 默认。
 * 取值归一化走 shared(与 UI 侧同一份规则),认不出来就当没设置。
 */
export function resolveMcpLocale(
  raw: unknown = process.env.TEXT_TO_DESIGN_LANG,
): Locale {
  return normalizeLocale(raw) ?? MCP_DEFAULT_LOCALE;
}

export function createMcpI18n(locale: Locale = resolveMcpLocale()): McpI18n {
  return { locale, t: createT(locale) };
}
