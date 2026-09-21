import { MESSAGES_EN } from './messages.en';
import { MESSAGES_ZH_CN } from './messages.zh-CN';

/**
 * locale 的取值、归一化与查表。
 *
 * 三条纪律:
 * 1. **纯函数、无模块级状态** —— 谁要文案谁自己 `createT(locale)`(同 0002 的口径:
 *    显式注入,不设可变单例)。UI 侧的响应式包装在 `ui/src/i18n/useLocale.tsx`。
 * 2. **默认值来自用户环境**:`navigator.language` 归一化后当默认,不读构建期常量、
 *    不嗅探宿主(两平台都没有语言 API,见 0016 候选表)。
 * 3. **兜底是 `en`**:`zh*` 一律归一到 `zh-CN`,中文用户必然命中,轮不到兜底;
 *    兜底真正服务的是 `ja-JP` / `fr-FR` / 取不到值这类情况,此时英文更通用。
 */

/** locale 全表(新增语言只改这里 + 补一份 messages) */
export const LOCALES = ['zh-CN', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/** 语言选择器的取值:`system` = 跟随系统(即 `navigator.language`) */
export const SYSTEM_CHOICE = 'system';

export type LocaleChoice = Locale | typeof SYSTEM_CHOICE;

/** 不可判定时的兜底;想偏中文只改这一行 */
export const FALLBACK_LOCALE: Locale = 'en';

/**
 * 「用户显式选择」在宿主 clientStorage 里的键。
 * 只在用户**显式**改过选择时才写 —— 不写 `system` 这个初始态,否则用户以后换了
 * 系统语言,插件还停在旧语言上。
 */
export const LOCALE_CHOICE_STORAGE_KEY = 'text-to-design:locale-choice';

/** 查表:两份 catalog 都在编译期检查过键集,故可按 locale 直接取 */
const MESSAGES: Record<Locale, Record<MessageKey, string | null>> = {
  'zh-CN': MESSAGES_ZH_CN,
  en: MESSAGES_EN,
};

/** 键集由中文 catalog 推导(它是键的唯一真源) */
export type MessageKey = keyof typeof MESSAGES_ZH_CN;

export type T = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

/** `{name}` 替换:不做 ICU(复数/性别需求出现时再换实现,键格式不变) */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * 造一个 `t`。参数缺失时**保留 `{name}` 字面**而不是填空串 —— 空缺在界面上看得见,
 * 好过静默吞掉(占位符与键的一致性由 `tests/i18n.test.ts` 守)。
 */
export function createT(locale: Locale): T {
  const table = MESSAGES[locale] ?? MESSAGES[FALLBACK_LOCALE];
  const zh = MESSAGES['zh-CN'];
  return (key, params) => {
    // 回落链:当前 locale → 中文 → 键本身。未译在 en 表里是 `null`(不是空串),
    // 所以这里用 `??` 就能落到中文 —— 界面看到中文,而不是看到空白(0016)
    const template = table[key] ?? zh[key] ?? key;
    if (params == null) return template;
    return template.replace(PLACEHOLDER, (match, name: string) => {
      const value = params[name];
      return value == null ? match : String(value);
    });
  };
}

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly string[]).includes(value as string);
}

export function isLocaleChoice(value: unknown): value is LocaleChoice {
  return value === SYSTEM_CHOICE || isLocale(value);
}

const ZH_PREFIX = /^zh([-_]|$)/i;
const EN_PREFIX = /^en([-_]|$)/i;

/**
 * `navigator.language` 之类的原始串 → 枚举值。
 *
 * 取值太杂(`zh` / `zh-CN` / `zh_CN` / `zh-Hans` / `zh-TW` / `en-US` / `EN`),
 * 所以归一化是必须的,不是可选优化。繁体(**zh-TW**)也先给简体 —— 只有两套文案,
 * 简体比英文更接近。
 */
export function normalizeLocale(raw: unknown): Locale | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (value === '') return undefined;
  if (ZH_PREFIX.test(value)) return 'zh-CN';
  if (EN_PREFIX.test(value)) return 'en';
  return undefined;
}

/** 解析输入:显式选择(可能是 `system`)与用户的 `navigator.language` */
export interface ResolveUiLocaleInput {
  /** 宿主 clientStorage 读到的值;读不到/脏值都按「没选过」处理 */
  stored?: unknown;
  navigatorLanguage?: string | null | undefined;
}

/**
 * UI 侧 locale 的**唯一**解析入口(优先序,见 0016):
 * ① 用户显式选择 → ② `navigator.language` 归一化 → ③ `FALLBACK_LOCALE`。
 */
export function resolveUiLocale(input: ResolveUiLocaleInput): Locale {
  const fromSystem =
    normalizeLocale(input.navigatorLanguage) ?? FALLBACK_LOCALE;
  const stored = input.stored;
  if (stored === SYSTEM_CHOICE) return fromSystem;
  return isLocale(stored) ? stored : fromSystem;
}
