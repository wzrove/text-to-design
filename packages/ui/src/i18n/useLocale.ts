import { type Accessor, createSignal } from 'solid-js';
import {
  createT,
  type Locale,
  type LocaleChoice,
  normalizeLocale,
  resolveUiLocale,
  SYSTEM_CHOICE,
  type T,
  toStoredChoice,
} from 'text-to-design-shared';
import { postToCode } from '../bridge/codeChannel';

/**
 * UI 侧**唯一**的 locale 状态与 `t`(见 docs/design-decisions/0016)。
 *
 * 为什么是模块级信号而不是 context:两个地方都要读它 —— 组件(面板文案)与
 * **命令式代码**(`bridge/connection.ts`、`bridge/router.ts` 往日志抽屉里写行)。
 * 后者不在组件树里,读不到 context。
 *
 * 这与 0002 反对的「模块级可变单例」不是一回事:这里没有第二份 locale 状态,
 * 外部也不能绕过 `selectLocale` 直接改,而 locale 本来就是**整个面板一份**的东西
 * (不存在「组件 A 中文、组件 B 英文」这种合法状态)。
 *
 * **`t` 每次读 `locale()`** —— 这是本模块唯一容易写错的地方:写成
 * `const t = createT(locale())` 会让切换静默失效(组件不会重新求值)。同理,
 * 命令式代码里必须在调用点写 `t(...)`,而不是提前把结果存进变量。
 *
 * 分工:UI 算语言(`navigator` 只在这里),code 只当选择的保管员
 * (`clientStorage` 只在那里),见 shared/locale-channel.ts。
 */

function systemLanguage(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language;
}

/** 用户的选择;`system` = 跟随系统(默认,且**不写入**存储) */
const [choice, setChoice] = createSignal<LocaleChoice>(SYSTEM_CHOICE);

export { choice };

/**
 * 用户是否已在本会话里手动选过。
 *
 * code 侧推来的持久化值是**异步**到达的,若它晚于用户的手动选择,不能把用户的选择
 * 盖掉 —— 那条推送只是「启动时的初始值」,不是权威。
 */
let userSelected = false;

/** 一个 locale 一个 `t`,避免每次调用都新建闭包(纯函数,按 locale 缓存安全) */
const translators = new Map<Locale, T>();
function translator(locale: Locale): T {
  let fn = translators.get(locale);
  if (fn == null) {
    fn = createT(locale);
    translators.set(locale, fn);
  }
  return fn;
}

/** 当前语言:① 用户选择 → ② 系统语言归一化 → ③ 兜底 */
export const locale: Accessor<Locale> = () =>
  resolveUiLocale({ stored: choice(), navigatorLanguage: systemLanguage() });

/** 系统语言的归一化结果(认不出来时 undefined);切换器用它标「跟随系统」的实际落点 */
export const systemLocale: Accessor<Locale | undefined> = () =>
  normalizeLocale(systemLanguage());

/** 当前语言的 `t`:函数体里读信号,所以在 JSX 中调用即自动跟随切换 */
export const t: T = (key, params) => translator(locale())(key, params);

/**
 * 用户显式选择 → 立即生效 + 交给 code 侧持久化。
 * 选 `system` 也会写回(`locale_set` 带 `system`)= 清掉存储值,回到跟随系统。
 */
export function selectLocale(next: LocaleChoice): void {
  userSelected = true;
  setChoice(next);
  postToCode({ type: 'locale_set', choice: next });
}

/**
 * code 侧启动时推来的持久化选择。脏值(历史版本写的、手改的)一律当「没选过」;
 * 用户已经手动选过则不覆盖。
 */
export function applyStoredChoice(raw: unknown): void {
  if (userSelected) return;
  const stored = toStoredChoice(raw);
  if (stored != null) setChoice(stored);
}
