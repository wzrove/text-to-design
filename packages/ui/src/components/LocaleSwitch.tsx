import { For } from 'solid-js';
import { LOCALES } from 'text-to-design-shared';
import { locale, selectLocale, t } from '../i18n/useLocale';

/**
 * 语言切换器:两档直切(`中` / `EN`),不做下拉。
 *
 * 默认语言跟随系统(`navigator.language`,见 dec 0016):面板上没有「跟随系统」这一档,
 * 因为**没选过**本身就是那个状态;用户点过任一侧后记成显式选择并持久化。
 * 两档都摊在明面上,点即切,比「展开再选」少一次交互。
 *
 * 语言名显示**自称**(`中文` / `English` 两侧原样),不随当前语言翻译 —— 这是
 * 语言选择器的惯例。缩写只上屏 `中` / `EN`,全名进 aria-label。
 */
export default function LocaleSwitch() {
  return (
    <div
      role="group"
      aria-label={t('locale.menu')}
      class="flex items-center gap-0.5 rounded border border-base-300 p-0.5"
    >
      <For each={LOCALES}>
        {(value) => (
          <button
            type="button"
            aria-label={t(`locale.${value}`)}
            aria-pressed={locale() === value}
            class={`rounded px-1.5 py-0.5 font-mono text-[10px] leading-none transition  cursor-pointer ${
              locale() === value
                ? 'bg-base-content/10 font-bold text-base-content'
                : 'text-base-content/50 hover:text-base-content/80'
            }`}
            onClick={() => {
              // 点当前档不写存储:没有变化就不该产生一条「显式选择」
              if (locale() !== value) selectLocale(value);
            }}
          >
            {t(`locale.abbr.${value}`)}
          </button>
        )}
      </For>
    </div>
  );
}
