import { type Accessor, createSignal } from 'solid-js';

/**
 * 主题偏好。存 UI iframe 自己的 localStorage(纯视觉偏好,与 locale 不同 ——
 * 那边要跨面板会话存活才走 code 侧 clientStorage,这里重开回到系统默认无伤)。
 */
export type ThemePref = 'light' | 'dark';

const THEME_STORAGE_KEY = 'text-to-design:theme';
const THEME_ATTR = 'data-theme';
const THEME_NAME: Record<ThemePref, string> = {
  light: 'textdesign',
  dark: 'textdesign_dark',
};

const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');

function readStored(): ThemePref | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** 初始档:用户选过就沿用,没选过跟随系统 */
const [pref, setPref] = createSignal<ThemePref>(
  readStored() ?? (systemQuery.matches ? 'dark' : 'light'),
);

function apply(): void {
  document.documentElement.setAttribute(THEME_ATTR, THEME_NAME[pref()]);
}

/** 启动即调(main.tsx,render 之前):避免首帧闪白/闪黑 */
export function initTheme(): void {
  apply();
  // 没手动选过时继续跟随系统;选过后以用户选择为准
  systemQuery.addEventListener('change', () => {
    if (readStored() == null) {
      setPref(systemQuery.matches ? 'dark' : 'light');
      apply();
    }
  });
}

export const themePref: Accessor<ThemePref> = pref;

export function toggleTheme(): void {
  const next: ThemePref = pref() === 'dark' ? 'light' : 'dark';
  setPref(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {}
  apply();
}
