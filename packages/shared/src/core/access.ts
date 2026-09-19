import type { DesignHost, NodeSkeleton, StyleSummary } from './host';
import { trySerialize } from './serialize';

/**
 * 文档访问层(0011):**唯一的异步边界**。
 *
 * Figma `documentAccess: "dynamic-page"` 下,凡「触碰文档」的同步 API 都无条件抛
 * (`Cannot call with documentAccess: dynamic-page`)—— 与页面是否已加载无关。
 * 而**加载完成后节点属性读写仍是同步的**,所以 await 只该出现在这一层:
 * 这里把节点解析成「已加载骨架」交出去,下游(0001 的属性管线、0004 的回读、
 * serialize)保持同步,不被 async 污染。
 *
 * 平台差异也只在这一层兜:jsDesign 没有 dynamic-page、typings 里没有
 * `getNodeByIdAsync` 等符号,回退分支写在这里一处,不在每个调用点各写一遍。
 */

/** 悬挂节点(底层记录失效,读属性必崩)用 trySerialize 检出并剔除 */
export function isUsable(n: NodeSkeleton): boolean {
  return trySerialize(n, 0) !== null;
}

/**
 * 按 id 解析单个节点。
 *
 * 顺序:异步入口(有则用) → 同步入口(jsDesign / legacy) → 当前页 findOne 兜底。
 * 任一步拿到「读属性会崩」的悬挂节点都当作不存在,交给上层报「未找到」,而不是
 * 把引擎断言冒泡出去。
 */
export async function resolveOne(
  host: DesignHost,
  id: string,
): Promise<NodeSkeleton | null> {
  if (typeof host.getNodeByIdAsync === 'function') {
    try {
      const n = await host.getNodeByIdAsync(id);
      if (n != null && isUsable(n)) return n;
    } catch {
      // 失效 id / 未加载页,落到下面的兜底
    }
  }
  try {
    const n = host.getNodeById(id);
    if (n && isUsable(n)) return n;
  } catch {
    // dynamic-page 下这里必抛(同步入口被禁);legacy 下可能是失效 id,继续
  }
  try {
    const n = host.currentPage.findOne((x) => x.id === id);
    return n != null && isUsable(n) ? n : null;
  } catch (e) {
    console.error(
      `[core] findOne 失败,跳过 id=${id}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/**
 * 批量解析:**一次 await**(内部 `Promise.all`)。
 * 不要把循环里的单 id 解析写成逐个 await —— 节点多时会退化成串行等待。
 */
export async function resolveNodes(
  host: DesignHost,
  ids: readonly string[],
): Promise<NodeSkeleton[]> {
  const found = await Promise.all(ids.map((id) => resolveOne(host, id)));
  return found.filter((n): n is NodeSkeleton => n != null);
}

/** 批量解析成 id → 节点的映射:循环内按 id 查表用,避免 N+1 */
export async function resolveNodesMap(
  host: DesignHost,
  ids: readonly string[],
): Promise<Map<string, NodeSkeleton>> {
  const pairs = await Promise.all(
    ids.map(async (id) => [id, await resolveOne(host, id)] as const),
  );
  const map = new Map<string, NodeSkeleton>();
  for (const [id, n] of pairs) if (n != null) map.set(id, n);
  return map;
}

/**
 * 实例的主组件:dynamic-page 下 `node.mainComponent` 直接抛,只有
 * `getMainComponentAsync` 能读;jsDesign 无该符号时回退同步字段。
 */
export async function resolveMainComponent(
  instance: NodeSkeleton,
): Promise<NodeSkeleton | null> {
  if (typeof instance.getMainComponentAsync === 'function') {
    try {
      return await instance.getMainComponentAsync();
    } catch {
      return null;
    }
  }
  try {
    return instance.mainComponent ?? null;
  } catch {
    // dynamic-page 下同步字段必抛;该平台必然同时提供异步入口,这里只是兜底
    return null;
  }
}

/**
 * 全量加载文档页:dynamic-page 下跨页遍历 / `documentchange` 事件的前置
 * (0011 批次 5 的显式门控)。幂等:本插件生命周期内只有**第一次**调用真正
 * await 加载(返回 true),之后直接 false —— 调用方可以无脑放在跨页读取前,
 * 不必自己记状态;成本标注(note)也以此为事实来源,只出现一次。
 * false 还表示平台无此符号(jsDesign 没有 dynamic-page,文档常驻,恒 false)。
 */
let pagesLoadedOnce = false;
let pagesLoadPromise: Promise<void> | null = null;

export function ensurePagesLoaded(host: DesignHost): Promise<boolean> {
  if (typeof host.loadAllPagesAsync !== 'function')
    return Promise.resolve(false);
  if (pagesLoadedOnce) return Promise.resolve(false);
  if (pagesLoadPromise == null) {
    pagesLoadPromise = host.loadAllPagesAsync().then(() => {
      pagesLoadedOnce = true;
    });
  }
  return pagesLoadPromise.then(
    () => true,
    (e: unknown) => {
      // 加载失败不缓存:下次调用重试,失败原因交由调用方冒泡
      pagesLoadPromise = null;
      throw e;
    },
  );
}

/** 本地样式枚举:优先 `*Async`(dynamic-page),无则回落同步 getter */
export async function listStylesAsync(
  host: DesignHost,
): Promise<StyleSummary[]> {
  const sources: {
    asyncGet?: () => Promise<readonly StyleSummary[]>;
    syncGet?: () => readonly StyleSummary[];
  }[] = [
    {
      asyncGet: host.getLocalPaintStylesAsync?.bind(host),
      syncGet: host.getLocalPaintStyles?.bind(host),
    },
    {
      asyncGet: host.getLocalTextStylesAsync?.bind(host),
      syncGet: host.getLocalTextStyles?.bind(host),
    },
    {
      asyncGet: host.getLocalEffectStylesAsync?.bind(host),
      syncGet: host.getLocalEffectStyles?.bind(host),
    },
    {
      asyncGet: host.getLocalGridStylesAsync?.bind(host),
      syncGet: host.getLocalGridStyles?.bind(host),
    },
  ];
  const out: StyleSummary[] = [];
  for (const { asyncGet, syncGet } of sources) {
    if (asyncGet != null) {
      try {
        out.push(...((await asyncGet()) ?? []));
        continue;
      } catch {
        // 异步入口失败不回落同步入口:dynamic-page 下同步入口必然抛
      }
    }
    if (syncGet != null) {
      try {
        out.push(...(syncGet() ?? []));
      } catch {
        // 单个 getter 失败不影响其余
      }
    }
  }
  return out;
}
