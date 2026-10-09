/**
 * 版本升级提示的跨侧契约:daemon → 面板 UI 的**推送帧**(不进 `PluginRequest`,
 * 理由同 camera-lock / locale-channel:不过 MCP,没有外部调用方)。
 *
 * 分工:**谁去查**由宿主网络白名单决定 —— 面板 iframe 直连 registry 在 Figma 上
 * 必被拒(`vite-plugin-manifest.ts` 的 `networkAccess.allowedDomains` 只有
 * localhost),jsDesign 未声明、MasterGo 无该字段;而 daemon 是 Node 进程,不受
 * 宿主约束。所以只有 daemon 查得动,查到后推给面板(见 0038)。
 *
 * **查不到就是查不到**:`latest` 的两项都可以是 `null`。面板拿 `null` 必须当作
 * 「无事实」而不提示 —— 宁可不报,也不能拿陈旧或半截的结论报一个错的升级建议。
 */

/** 两个发布包的 npm 名(与各自 package.json 的 name 同源,改包名要同步) */
export const NPM_PACKAGES = {
  ui: 'text-to-design-ui',
  mcp: 'text-to-design-mcp',
} as const;

/** registry 的 latest 端点(只认 latest dist-tag,不看预发布) */
export const REGISTRY_HOST = 'https://registry.npmjs.org';

export function registryLatestUrl(pkg: string): string {
  return `${REGISTRY_HOST}/${pkg}/latest`;
}

/**
 * 复查周期:一个 daemon 进程内只按这个节奏查 registry。
 * 它不是「用户多久能看到提示」的上界 —— 连上即推一次缓存/新查的结果,周期只是为了
 * 让常驻 daemon 跟上涨版本。
 */
export const VERSION_CHECK_MS = 30 * 60 * 1000;

/** registry 查询超时:面板不依赖它,超时就当没查到 */
export const VERSION_QUERY_TIMEOUT_MS = 4_000;

/** daemon → UI:npm 上两个包的最新版本(任一项可为 null = 没查到) */
export interface VersionPushFrame {
  type: 'version';
  latest: {
    ui: string | null;
    mcp: string | null;
  };
}

export function isVersionPushFrame(value: unknown): value is VersionPushFrame {
  const m = value as Partial<VersionPushFrame> | null | undefined;
  if (m == null || m.type !== 'version') return false;
  const latest = m.latest as
    | Partial<VersionPushFrame['latest']>
    | null
    | undefined;
  if (latest == null) return false;
  // 两项都允许 null,但键必须在 —— 缺键意味着对端版本更老,按「无事实」处理
  return 'ui' in latest && 'mcp' in latest;
}
