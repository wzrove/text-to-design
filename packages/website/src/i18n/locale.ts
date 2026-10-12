import type { Messages } from './messages/zh-CN';

export type Locale = 'zh-CN' | 'en';

export const LOCALES: Locale[] = ['zh-CN', 'en'];
export const FALLBACK_LOCALE: Locale = 'zh-CN';
export const LOCALE_STORAGE_KEY = 'tdd-locale';

export function normalizeLocale(
  input: string | null | undefined,
): Locale | undefined {
  if (!input) return undefined;
  const v = input.toLowerCase().replace('_', '-');
  if (v === 'en' || v.startsWith('en-')) return 'en';
  if (v === 'zh' || v.startsWith('zh-')) return 'zh-CN';
  return undefined;
}

/** 优先序:显式选择 > 浏览器语言 > 兜底。纯函数,不碰 DOM */
export function resolveLocale(input: {
  stored: string | null;
  navigatorLanguage: string | undefined;
}): Locale {
  const stored = normalizeLocale(input.stored);
  return stored ?? normalizeLocale(input.navigatorLanguage) ?? FALLBACK_LOCALE;
}

/** 只替换 params 里点名的 {key},其余花括号原样留着(提示词里有占位符文案) */
export function fill(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) =>
    key in params ? String(params[key]) : all,
  );
}

export type { Messages };
