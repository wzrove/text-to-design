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
