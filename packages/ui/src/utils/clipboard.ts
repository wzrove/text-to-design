import { t } from '../i18n/useLocale';
import { showToast } from './toast';

/** 复制文本到剪贴板:优先 navigator.clipboard,插件 iframe 受限时走 execCommand 兜底 */
export function copyText(text: string): boolean {
  try {
    if (navigator.clipboard?.writeText) {
      // 写入是异步的,失败也必须留痕:静默失败会让「复制了却没内容」无从排查
      navigator.clipboard.writeText(text).catch((e) => {
        // i18n-exempt: 开发者控制台诊断,不是面板文案(面板只拿到 true/false)
        console.debug('[ui] 剪贴板写入失败', e);
      });
      return true;
    }
  } catch {
    // 插件 iframe 剪贴板可能受限,走兜底
  }
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

/**
 * 复制 + 结果提示:面板里每一处复制的唯一出口(见 0037)。
 *
 * 成败判定与文案、级别三者的对应关系只写在这里。原先四个调用点各写一遍
 * 「✓ 已复制」的局部态:同一件事四份实现,而且成功那半只改按钮自己的字 ——
 * 复制的结果在系统剪贴板里,那个字一淡出就什么都不剩了。
 */
export function copyWithToast(text: string): void {
  const ok = copyText(text);
  showToast(
    t(ok ? 'toast.copy.done' : 'toast.copy.failed'),
    ok ? 'success' : 'error',
  );
}
