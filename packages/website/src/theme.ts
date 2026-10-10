import { createSignal, onCleanup } from 'solid-js';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Resolved = 'light' | 'dark';

const KEY = 'tdd-theme';
const QUERY = '(prefers-color-scheme: light)';

const NEXT: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export const THEME_LABEL: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '亮色',
  dark: '暗色',
};

function media() {
  return window.matchMedia(QUERY);
}

/** system 落到实际主题;显式选择压过系统偏好 */
export function resolve(mode: ThemeMode): Resolved {
  return mode === 'system' ? (media().matches ? 'light' : 'dark') : mode;
}

export function readMode(): ThemeMode {
  const stored = localStorage.getItem(KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** 首屏渲染前调用:把系统/已存偏好写进 <html data-theme>,避免闪一下错主题 */
export function applyStoredTheme() {
  document.documentElement.dataset.theme = resolve(readMode());
}

export function createTheme() {
  const [mode, setMode] = createSignal<ThemeMode>(readMode());
  const [resolved, setResolved] = createSignal<Resolved>(resolve(readMode()));

  const apply = (m: ThemeMode) => {
    const next = resolve(m);
    setResolved(next);
    document.documentElement.dataset.theme = next;
  };

  const set = (m: ThemeMode) => {
    localStorage.setItem(KEY, m);
    setMode(m);
    apply(m);
  };

  // 只在「跟随系统」时响应系统切换,手动选过就不再被覆盖
  const onChange = () => {
    if (mode() === 'system') apply('system');
  };
  const mql = media();
  mql.addEventListener('change', onChange);
  onCleanup(() => mql.removeEventListener('change', onChange));

  apply(mode());

  return { mode, resolved, set, cycle: () => set(NEXT[mode()]) };
}
