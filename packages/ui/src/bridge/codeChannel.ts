/**
 * UI → 插件 code 的单点信封。
 *
 * 宿主约定:UI 侧发 `parent.postMessage({ pluginMessage: <载荷> }, '*')`,插件外壳
 * 解出 `<载荷>` 后交给 `host.ui.onmessage`。此前这条信封在 `router.ts` 里手写了两遍;
 * 面板改高度(0014)又要走同一条路,再抄第三遍就是三次机会写漂移。
 */
export function postToCode(message: unknown): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

/**
 * code → UI 的**入站**拆包(与上面成对,收在同一文件)。
 *
 * 为什么两种形状都收:MasterGo **不拆** `pluginMessage`(官方开发指南里 UI 发
 * `parent.postMessage({ count: 3 })` 后代码侧直接打出 `{ count: 3 }`),而 Figma /
 * jsDesign 拆。若只认带信封的那种,MasterGo 上所有回包都会被静默丢弃 ——
 * 实测症状是 daemon 的 `jsd_ping` 超时,而两侧都不报错(见 0017 联调记录)。
 *
 * 拆完仍要求是「带字符串 type 的对象」:面板 iframe 里会收到其它来源的 message,
 * 不能因为放宽信封就把它们当协议帧。
 */
export function readCodeMessage(data: unknown): { type: string } | null {
  if (data == null || typeof data !== 'object') return null;
  const inner =
    'pluginMessage' in (data as Record<string, unknown>)
      ? (data as { pluginMessage?: unknown }).pluginMessage
      : data;
  if (inner == null || typeof inner !== 'object') return null;
  const type = (inner as { type?: unknown }).type;
  return typeof type === 'string' ? (inner as { type: string }) : null;
}
