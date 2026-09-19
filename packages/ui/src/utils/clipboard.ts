/** 复制文本到剪贴板:优先 navigator.clipboard,插件 iframe 受限时走 execCommand 兜底 */
export function copyText(text: string): boolean {
  try {
    if (navigator.clipboard?.writeText) {
      // 写入是异步的,失败也必须留痕:静默失败会让「复制了却没内容」无从排查
      navigator.clipboard.writeText(text).catch((e) => {
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
