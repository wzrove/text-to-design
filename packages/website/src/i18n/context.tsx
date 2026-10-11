import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  type ParentProps,
  useContext,
} from 'solid-js';
import { fill, LOCALE_STORAGE_KEY, type Locale, resolveLocale } from './locale';
import { en } from './messages/en';
import { type Messages, zh } from './messages/zh-CN';

export {
  FALLBACK_LOCALE,
  fill,
  LOCALE_STORAGE_KEY,
  LOCALES,
  normalizeLocale,
  resolveLocale,
} from './locale';
export type { Locale, Messages };

const DICT: Record<Locale, Messages> = { 'zh-CN': zh, en };

type Ctx = {
  locale: () => Locale;
  setLocale: (next: Locale) => void;
  /** 访问器而非 getter 属性:组件里 `const { d } = useLocale()` 解构后仍要在渲染期取值 */
  d: Accessor<Messages>;
  /** 模板 + 参数渲染:字典里带 {x} 的条目统一走这里 */
  f: (template: string, params?: Record<string, string | number>) => string;
};

const LocaleCtx = createContext<Ctx>();

export function LocaleProvider(props: ParentProps) {
  const [locale, setLocale] = createSignal<Locale>(
    resolveLocale({
      stored: localStorage.getItem(LOCALE_STORAGE_KEY),
      navigatorLanguage: navigator.language,
    }),
  );
  const d = createMemo(() => DICT[locale()]);

  const value: Ctx = {
    locale,
    setLocale: (next) => {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
      setLocale(next);
    },
    d,
    f: (template, params = {}) => fill(template, params),
  };

  createEffect(() => {
    const meta = d().meta;
    document.documentElement.lang = locale();
    document.title = meta.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', meta.description);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute('content', meta.ogTitle);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute('content', meta.ogDescription);
  });

  return (
    <LocaleCtx.Provider value={value}>{props.children}</LocaleCtx.Provider>
  );
}

export function useLocale(): Ctx {
  const ctx = useContext(LocaleCtx);
  if (!ctx) throw new Error('useLocale 必须在 LocaleProvider 内使用');
  return ctx;
}
