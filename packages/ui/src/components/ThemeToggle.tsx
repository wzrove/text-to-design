import { Moon, Sun } from 'lucide-solid';
import { Show } from 'solid-js';
import { t } from '../i18n/useLocale';
import { themePref, toggleTheme } from '../theme';

/** 主题切换:图标是「会切到的那一档」(亮档显示月亮,暗档显示太阳) */
export default function ThemeToggle() {
  return (
    <button
      type="button"
      class="btn btn-ghost btn-xs shrink-0 px-1 text-base-content/60 hover:text-base-content"
      aria-label={
        themePref() === 'dark'
          ? t('header.theme.toLight')
          : t('header.theme.toDark')
      }
      title={
        themePref() === 'dark'
          ? t('header.theme.toLight')
          : t('header.theme.toDark')
      }
      onClick={toggleTheme}
    >
      <Show when={themePref() === 'dark'} fallback={<Moon size={14} />}>
        <Sun size={14} />
      </Show>
    </button>
  );
}
