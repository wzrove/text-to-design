import { type Accessor, createSignal } from 'solid-js';

/**
 * 主题偏好。存 UI iframe 自己的 localStorage(纯视觉偏好,与 locale 不同 ——
 * 那边要跨面板会话存活才走 code 侧 clientStorage,这里重开回到系统默认无伤)。
 */
export type ThemePref = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'text-to-design:theme';
const THEME_ATTR = 'data-theme';
const THEME_NAME: Record<ResolvedTheme, string> = {
  light: 'textdesign',
  dark: 'textdesign_dark',
};
const NEXT_PREF: Record<ThemePref, ThemePref> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');

function readStored(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** 初始档:用户选过亮/暗就沿用,没选过跟随系统 */
const [pref, setPref] = createSignal<ThemePref>(readStored());

function resolveTheme(p: ThemePref): ResolvedTheme {
  return p === 'system' ? (systemQuery.matches ? 'dark' : 'light') : p;
}

// Solid 2.0 读滞后写:必须显式传目标值,不能在 setPref 后立刻回头读 pref()
function apply(p: ThemePref): void {
  document.documentElement.setAttribute(
    THEME_ATTR,
    THEME_NAME[resolveTheme(p)],
  );
}

/** 启动即调(main.tsx,render 之前):避免首帧闪白/闪黑 */
export function initTheme(): void {
  apply(readStored());
  systemQuery.addEventListener('change', () => {
    if (pref() === 'system') apply('system');
  });
}

export const themePref: Accessor<ThemePref> = pref;

export function toggleTheme(): void {
  const next = NEXT_PREF[pref()];
  setPref(next);
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {}
  apply(next);
}
