import { isLocaleChoice, type LocaleChoice } from './dicts/i18n/locale';

/**
 * 语言选择的跨侧契约:UI ↔ 插件 code 的**旁路消息**(不进 `PluginRequest`)。
 *
 * 为什么必须有这两条(而不是像原方案那样「UI 自己搞定」):
 * - **语言怎么算**只有 UI 知道 —— `navigator` 只存在于 UI iframe,code 侧沙箱
 *   连 `navigator` 都没有;
 * - **选择存在哪**只有 code 能碰 —— `clientStorage` 是宿主 API,UI iframe 摸不到
 *   (也不该赌 iframe 的 `localStorage`,它在沙箱里是实现细节)。
 *
 * 所以分工是:UI 算当前语言,code 只当「选择的保管员」。这条边界与 0014 的
 * 「code 报宿主能力、UI 决定布局」正好相反 —— 不是因为风格变了,而是因为
 * 两个事实(`navigator` / `clientStorage`)分别只在一侧可见。
 *
 * 两条消息都走 `codeChannel`(不过 daemon、不进 MCP):语言是面板自己的事,
 * 没有外部调用方,混进 `PluginRequest` 等于凭空多出 MCP 工具(同 0014 的理由)。
 */

/** UI → code:用户在面板里选了哪一项(`system` 表示清掉持久化值、回到跟随系统) */
export interface LocaleSetMessage {
  type: 'locale_set';
  choice: LocaleChoice;
}

/**
 * code → UI:宿主里存着的选择(首次启动推送,UI 之后自己维护)。
 * `stored` 是 `null` 时表示「没选过 / 读了但值不可认」,UI 按跟随系统处理。
 */
export interface LocaleStateMessage {
  type: 'locale_state';
  stored: LocaleChoice | null;
}

export function isLocaleSetMessage(value: unknown): value is LocaleSetMessage {
  const m = value as Partial<LocaleSetMessage> | null | undefined;
  return m != null && m.type === 'locale_set' && isLocaleChoice(m.choice);
}

/**
 * 读到脏值(历史版本写的、手改的)时一律当「没选过」——
 * 存储是跨版本存活的外部输入,不能假设它一定合法。
 */
export function toStoredChoice(raw: unknown): LocaleChoice | null {
  return isLocaleChoice(raw) ? raw : null;
}
