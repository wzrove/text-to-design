import type { AssetRef } from '../schemas';
import { hostCapabilityState } from './capabilities';
import type { DesignHost, NodeSkeleton, StyleSummary } from './host';
import type { RuntimeContext } from './runtime';
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
 * 本平台能不能安全地读「非当前页」(2026-10-10 真机实测,0039 的修订)。
 *
 * 判据是**平台声明**(`documentScopeRead`),不是 `loadAllPagesAsync` 的符号存在性:
 * 即时设计的 typings 是 Figma API v1 update 40 的 fork(没有该声明),而 host 是
 * `Object.create(native)` —— 原生成员整个透出来,于是该符号**在运行时存在且永不返回**
 * (先按符号判据收口一次后,`find scope=document` 照样 25008ms `forward_timeout`)。
 * 这与 dec 0042 / dec 0043 的样式枚举是**同一个模式**:typings 没声明的成员运行时照样在,
 * 符号在 ≠ 能问(dec 0043 于 2026-10-15 更正:那次永挂的是 `*Async`,不是同步 getter)。
 *
 * ⇒ 未声明时**连 `ensurePagesLoaded` 都不能调**(它 await 的正是那个永不返回的调用),
 * 一切跨页读退回当前页。它是异步成员 ⇒ `await` 永不 settle,既 `catch` 不到、
 * 加超时也只是放弃这次调用 —— 判断必须在**调用前**做出。
 *
 * 0011 那句「jsDesign 无 dynamic-page、文档常驻,直接遍历即可」在这条实测面前不成立:
 * 文档常驻不等于非当前页可随时读。
 */
export function canReadDocumentScope(ctx: RuntimeContext): boolean {
  return hostCapabilityState(ctx, 'documentScopeRead') !== false;
}

/**
 * 全量加载文档页:dynamic-page 下跨页遍历 / `documentchange` 事件的前置
 * (0011 批次 5 的显式门控)。幂等:本插件生命周期内只有**第一次**调用真正
 * await 加载(返回 true),之后直接 false —— 调用方可以无脑放在跨页读取前,
 * 不必自己记状态;成本标注(note)也以此为事实来源,只出现一次。
 *
 * ⚠ 只有 `canReadDocumentScope` 为真时才可调用:即时设计的运行时**有**这个符号
 * 但永不返回,无脑 await 等于把整条调用挂到转发超时(见上)。
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

/**
 * 本地样式枚举:两条入口(同步 getter / `*Async`)按**声明**选路。
 *
 * ⚠ **dec 0043 的判据写在最前面**:「这个平台能不能问」必须在**调用前**定下来 ——
 * 真机(2026-10-15)测得永挂的那条路是**异步**的:`getLocal*StylesAsync` 从不
 * settle ⇒ `await` 撞满 25s 转发上限,既 `catch` 不到、加超时也只是放弃这次调用。
 * 唯一答得出来的是平台声明的能力位 `styleEnumeration`:能力缺失 ⇒ 恒空、一次都不调。
 *
 * ⚠ **选路同样不能靠探测**:这里是「有 async 就用 async」(dec 0010)—— 每类先取
 * `host.getLocal*StylesAsync?.bind(host)`,`?.` 成立就 `await` 它,**只有该成员不存在
 * 时才退同步 getter**。而 typings 里的「没有」≠ 运行时的「没有」:即时设计的
 * `Object.create(native)` 把这四个未声明的成员整透出来 ⇒ `?.` 恒成立 ⇒ 同步 getter
 * 从头到尾没被调用过(而它实测 0~1ms 就返回、数据正确)。故由 `styleEnumerationSync`
 * 声明只问同步入口(即时设计声明;Figma 不声明:dynamic-page 下同步入口必抛,只能走 async)。
 * 决策记录:dec e1e66f0a。
 *
 * `ctx.capabilities == null`(未注入)时沿用 `typeof` 探测(fail-open,与 0002 一致)。
 */
export async function listStylesAsync(
  host: DesignHost,
  ctx: RuntimeContext,
): Promise<StyleSummary[]> {
  if (hostCapabilityState(ctx, 'styleEnumeration') === false) return [];
  // 选路见上面的注释:**只认声明**,不靠 `?.` 探测(在这平台探测恒答「有 async」)。
  const preferSync = hostCapabilityState(ctx, 'styleEnumerationSync') === true;
  // 四类**逐个独立调用**,不是一次批量查询:任一类失败不该连坐其余三类
  // (dec 0042 的结论;当初为「哪一类挂死」取证加的 `kinds` 筛选已随 dec 0043 摘掉 ——
  //  判据换成平台声明后,不该问的平台一个 getter 都不会调)。
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
    if (!preferSync && asyncGet != null) {
      try {
        out.push(...((await asyncGet()) ?? []));
        continue;
      } catch {
        // 异步入口失败不回落同步入口:dynamic-page 下同步入口必然抛
      }
    }
    if (syncGet != null) {
      // ⚠ 同步入口**不可中断**:它若在引擎侧永不返回,插件线程直接冻死,
      // 这里既 catch 不到、也没有任何超时可加(对**同步**调用这条始终成立)。
      // 唯一能做的是**调用前**决定问不问、走哪条路 —— 闸在上面(能力位),不在这里。
      try {
        out.push(...(syncGet() ?? []));
      } catch {
        // 单个 getter 失败不影响其余
      }
    }
  }
  return out;
}

/**
 * 本地变量枚举(0039):未声明 `variables` 能力、没有这个面的入口、或读了抛错,
 * 一律返回空数组。
 *
 * 为什么不报错:变量面的缺席是**常态**(即时设计 typings 无变量声明,结构上接不了),
 * 它只是资源清单的一个字段 —— 让平台缺口把整条 `get_page` 打成 isError 会把
 * 「读页面结构」这件事也一起废掉,收益为零。同 `listStylesAsync` 的处理。
 */
export async function listVariablesAsync(
  host: DesignHost,
  ctx: RuntimeContext,
): Promise<AssetRef[]> {
  if (hostCapabilityState(ctx, 'variables') === false) return [];
  if (typeof host.getLocalVariablesAsync !== 'function') return [];
  try {
    const list = await host.getLocalVariablesAsync();
    return (list ?? []).map((v) => ({ id: v.id, name: v.name }));
  } catch {
    return [];
  }
}
