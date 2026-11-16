import { t } from '../i18n/useLocale';
import { showToast } from './toast';

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.debug('[ui] 异步剪贴板失败，尝试兼容复制', e); // i18n-exempt: developer console only
  }
  return legacyCopy(text);
}

export async function copyWithToast(text: string): Promise<void> {
  const ok = await copyText(text);
  showToast(
    t(ok ? 'toast.copy.done' : 'toast.copy.failed'),
    ok ? 'success' : 'error',
  );
}
