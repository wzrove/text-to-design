/**
 * MasterGo 的宿主信封差异(0017 联调实测)。
 *
 * 实测症状:插件在 MasterGo 里 UI 已连上 daemon(WS 通、`ui-probe` ping 有回包),
 * 但 daemon 发起的 `jsd_ping` **5 秒超时** —— 因为本仓 UI 侧按 Figma 约定发
 * `parent.postMessage({ pluginMessage: <载荷> })`,而 MasterGo **不做拆包**:
 * 官方开发指南里 UI 发 `parent.postMessage({ count: 3 }, '*')`,代码侧
 * `mg.ui.onmessage = (msg) => console.log(msg)` 直接打出 `{ count: 3 }`。
 * 于是代码侧看到的 `msg.method` 永远是 undefined(回的是「未知方法」),
 * 回包又因 UI 侧只认 `event.data.pluginMessage` 被丢掉 —— 两侧同时错位,
 * 表现为纯粹的超时,没有任何报错指向信封。
 *
 * 口径:代码侧入口做一次**兼容拆包**(有 `pluginMessage` 就取它),UI 侧同样两种都收
 * (见 `bridge/codeChannel.ts` 的 `readCodeMessage`)。这样无论宿主拆不拆都能工作,
 * 不必赌某个平台的实现细节。
 *
 * 纯函数、无 `mg` 依赖:便于在 Node 里做单元测试(宿主沙箱跑不进来)。
 */
export function unwrapHostMessage(raw: unknown): unknown {
  if (raw != null && typeof raw === 'object' && 'pluginMessage' in raw) {
    return (raw as { pluginMessage?: unknown }).pluginMessage;
  }
  return raw;
}
