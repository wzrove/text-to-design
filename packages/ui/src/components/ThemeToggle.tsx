import { Monitor, Moon, Sun } from '@lucide/solid';
import { Match, Switch } from 'solid-js';
import type { MessageKey } from 'text-to-design-shared';
import { t } from '../i18n/useLocale';
import { type ThemePref, themePref, toggleTheme } from '../theme';
import Tooltip from './Tooltip';

const NEXT_TIP: Record<ThemePref, MessageKey> = {
  system: 'header.theme.toLight',
  light: 'header.theme.toDark',
  dark: 'header.theme.toSystem',
};

/**
 * 主题三态切换:system(Monitor) → light(Sun) → dark(Moon) → system。
 * 图标展示当前档,Tooltip 提示点击后会切到的下一档。
 */
export default function ThemeToggle() {
  const tip = () => t(NEXT_TIP[themePref()]);
  return (
    <Tooltip tip={tip()}>
      <button
        type="button"
        class="btn btn-ghost btn-xs shrink-0 px-1 text-base-content/60 hover:text-base-content"
        aria-label={tip()}
        onClick={toggleTheme}
      >
        <Switch fallback={<Monitor size={14} />}>
          <Match when={themePref() === 'light'}>
            <Sun size={14} />
          </Match>
          <Match when={themePref() === 'dark'}>
            <Moon size={14} />
          </Match>
        </Switch>
      </button>
    </Tooltip>
  );
}
