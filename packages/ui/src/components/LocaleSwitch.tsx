import { LOCALES, type Locale } from 'text-to-design-shared';
import { locale, selectLocale, t } from '../i18n/useLocale';
import SegmentedSwitch, { type SegmentedItem } from './SegmentedSwitch';

/**
 * 语言切换器:两档直切(`中` / `EN`),不做下拉。
 *
 * 默认语言跟随系统(`navigator.language`,见 dec 0016):面板上没有「跟随系统」这一档,
 * 因为**没选过**本身就是那个状态;用户点过任一侧后记成显式选择并持久化。
 * 两档都摊在明面上,点即切,比「展开再选」少一次交互。
 *
 * 语言名显示**自称**(`中文` / `English` 两侧原样),不随当前语言翻译 —— 这是
 * 语言选择器的惯例。缩写只上屏 `中` / `EN`,全名进 aria-label。
 * 造型与 Copy 模式开关共用 `SegmentedSwitch`(见该组件)。
 */
export default function LocaleSwitch() {
  const items = (): SegmentedItem[] =>
    LOCALES.map((value) => ({
      value,
      label: t(`locale.abbr.${value}`),
      ariaLabel: t(`locale.${value}`),
    }));

  return (
    <SegmentedSwitch
      items={items()}
      value={locale()}
      label={t('locale.menu')}
      onChange={(value) => {
        // 点当前档不会触发 onChange(组件已挡):没有变化就不该产生「显式选择」
        if (value !== locale()) selectLocale(value as Locale);
      }}
    />
  );
}
