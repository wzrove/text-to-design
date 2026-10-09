import {
  NPM_PACKAGES,
  registryLatestUrl,
  VERSION_CHECK_MS,
  VERSION_QUERY_TIMEOUT_MS,
} from 'text-to-design-shared';
import { debug, warn } from './logger';

/**
 * npm 上两个包的最新版本(daemon 代查,见 0038)。
 *
 * **为什么不是面板自己查**:面板 iframe 的外网受宿主白名单管 —— Figma 的
 * `networkAccess.allowedDomains` 只有 localhost,直连 registry 必被拒;
 * jsDesign 未声明、MasterGo 无该字段。daemon 是 Node 进程,不受这套约束。
 *
 * **失败语义**:查不到(超时/非 200/无 version 字段)一律返回 `null` 并留 warn,
 * 绝不抛。版本提示是锦上添花,不能因为 registry 抖一下就把 daemon 拖下水;
 * 而「不提示」与「静默失效」的区别就在那条 warn 上(0007/0013)。
 */

export type LatestVersions = {
  ui: string | null;
  mcp: string | null;
};

let cache: { at: number; latest: LatestVersions } | null = null;

async function fetchOne(pkg: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VERSION_QUERY_TIMEOUT_MS);
  try {
    const res = await fetch(registryLatestUrl(pkg), { signal: ctrl.signal });
    if (!res.ok) {
      warn(`查询 ${pkg} 最新版本失败: HTTP ${res.status}(本次不提示升级)`);
      return null;
    }
    const json = (await res.json()) as { version?: unknown };
    if (typeof json.version !== 'string') {
      warn(`查询 ${pkg} 最新版本失败: 响应无 version 字段(本次不提示升级)`);
      return null;
    }
    return json.version;
  } catch (e) {
    warn(
      `查询 ${pkg} 最新版本失败(${e instanceof Error ? e.message : String(e)}):本次不提示升级`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 取最新版本(带进程内缓存)。
 *
 * 缓存不是为了省一次 HTTP,是为了让**推送频率**(跟着心跳,30s)和**查询频率**
 * (VERSION_CHECK_MS)解耦 —— 面板刚连上时要立刻拿到结论,而 registry 不该被
 * 每个心跳打一次。
 */
export async function latestVersions(): Promise<LatestVersions> {
  const now = Date.now();
  if (cache != null && now - cache.at < VERSION_CHECK_MS) return cache.latest;
  const [ui, mcp] = await Promise.all([
    fetchOne(NPM_PACKAGES.ui),
    fetchOne(NPM_PACKAGES.mcp),
  ]);
  debug(`npm 最新版本: ui=${ui ?? '未知'} mcp=${mcp ?? '未知'}`);
  cache = { at: now, latest: { ui, mcp } };
  return cache.latest;
}
