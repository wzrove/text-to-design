/**
 * 「创建结果该不该归组」的机械判据。
 *
 * ## 为什么要有这个东西(2026-11 真机教训)
 *
 * 一次「照当前页某帧的配色画同风格图」的任务里,模型建了 38 个原生节点
 * (标题 2 + 指标卡 12 + 列标题 3 + 标签 20 + 底图 1)后**逐个 reparent 到屏根**,
 * 全部平铺在同一层 —— 用户看完问「为何你的结构都没有分组」。
 * 配方(skill://canvas/references/design-strategy.md 第 4 条「结构分层」)与 instructions 都写了规矩,
 * 但两条通路都不保证被读到(instructions 多数宿主读完即弃,见 dec 0030);
 * 模型当时的动作序列是「建 → reparent → 建 → reparent」,每一步都合规、每一步都在平铺。
 *
 * 这里在**成功结果**上补一条提示:它落在模型必然要读的位置(工具返回值 + warnings),
 * 且判据客观 —— 只报观测事实(某帧的直属子节点数),不猜设计意图。
 *
 * ## 与 core/layout-hint.ts 的分工
 *
 * layout-hint 判的是「进参里 children 等距但没声明 layoutMode」,命中条件依赖调用方
 * 一次性塞 3+ 子节点;而上述失败形态是**建后逐个 reparent**,永远凑不齐 children,
 * 所以它救不到。本文件判的是**归并后的形态**:同一父级下直属子节点太多 = 该分层。
 * 判据实际执行在两处:批次内由 tools/batch.ts 把后续步骤数放进 ExecutorOptions.batch;
 * 批次外只能靠父级现有子节点数,而本文件**不读画布**,读不到就不报(见 detectFlatBatch)。
 *
 * ## 阈值为什么是 9
 *
 * 一屏通常 5~8 个语义分区(状态栏 / 页头 / 主视觉 / 列表 / 运营位 / 底栏);
 * 9 个以上直属子节点意味着至少有一层语义分区没建出来。取 9 而不是 5,
 * 是因为这条提示噪声敏感 —— 误报一次,后续所有 warning 都会被当背景噪音跳过
 * (layout-hint 的同一顾虑,见其测试注释)。
 */

/** 直属子节点数达到这个值就提示分层 */
export const CROWDED_CHILDREN_THRESHOLD = 9;

export type CrowdedParentHit = {
  /** 被归入的父节点 id */
  parentId: string;
  /** 判据用的合计步数 = 本批步数 + 父级原有直属子节点数(缺省即本批步数) */
  batchCount: number;
};

/**
 * 判「这类 reparent 是不是又在往同一个父级平铺」。两个来源各缺一半,故都收:
 *
 * - `steps`:`jsd_batch` 里的**后续步骤**(不含本步,由 batch 从整批 calls 里数出来,
 *   见 tools/batch.ts)。这是唯一能看见「后面还有几步进同一个父级」的地方 ——
 *   单步执行体拿到的是**解析后**的 args,占位符已换成 id,同批其余步骤它根本看不见;
 * - `existingChildCount`:**非批次**路径(逐个 reparent 的历史失败形态)只能靠
 *   「父级本来就有几个孩子」判,而那个数要额外往返读画布 —— 这里不读,读不到就只按
 *   steps 数判。单发调用传不出这两样,于是单发永不命中:这是有意的,单步 reparent
 *   本身不足以判「平铺」。
 *
 * 命中口径:`steps 数 + existingChildCount ≥ CROWDED_CHILDREN_THRESHOLD`。
 * 已按语义分好的批次不会命中:它们每步的 parentId 各不相同(每张卡一个容器)。
 */
export function detectFlatBatch(
  steps: { parentId?: unknown }[],
  options: {
    /** 父级当前的直属子节点数(读得到才传,读不到别猜) */
    existingChildCount?: number;
  } = {},
): CrowdedParentHit | null {
  const counts = new Map<string, number>();
  for (const step of steps) {
    const pid = step.parentId;
    if (typeof pid !== 'string' || pid === '') continue;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  const existing = options.existingChildCount;
  const base = typeof existing === 'number' && existing >= 0 ? existing : 0;
  let best: CrowdedParentHit | null = null;
  for (const [parentId, batchCount] of counts) {
    const projected = batchCount + base;
    if (projected < CROWDED_CHILDREN_THRESHOLD) continue;
    if (best == null || projected > best.batchCount) {
      best = { parentId, batchCount: projected };
    }
  }
  return best;
}

/**
 * 本批里与本步「同工具、同 parentId」的**后续步骤**数(不含本步),给
 * `ExecutorOptions.batch.siblingSteps` 用。只读已经解析好的字面 args:占位符
 * 形态的 parentId 数不出来,那是刻意的 —— 猜一个「大概指向同一个父级」只会制造误报,
 * 而这条提示的代价是误报一次后面全被当噪音(见文件头)。
 */
export function siblingStepsByParent(
  calls: readonly { tool: string; args?: unknown }[],
  index: number,
  resolved: { tool: string; args: Record<string, unknown> },
): number {
  const parentId = resolved.args.parentId;
  if (typeof parentId !== 'string' || parentId === '') return 0;
  let n = 0;
  for (let j = index + 1; j < calls.length; j++) {
    const later = calls[j];
    if (later.tool !== resolved.tool) continue;
    const args = later.args;
    if (args == null || typeof args !== 'object') continue;
    if ((args as Record<string, unknown>).parentId === parentId) n++;
  }
  return n;
}

/**
 * 判 SVG 源码里有没有按语义切 `<g id>`。
 *
 * chart-by-code 第 5 节要求「每个语义层一个 <g>,各带一个 ASCII 语义 id」;
 * 实测失败形态是整张图一次 `<g>` 都不套(或只套一个),导入后画布上就是一个
 * 不可拆的矢量,想单独调某一层只能回源重导。
 *
 * 判据只数**带 id 的 g 元素**,不判 id 起得好不好(那是主观的);上限不设,
 * 因为切多了只是分组更细,不是错误。
 */
export function countSemanticGroups(svg: string): number {
  const ids = new Set<string>();
  const re = /<g\b[^>]*\bid\s*=\s*["']([^"']+)["']/g;
  for (;;) {
    const m = re.exec(svg);
    if (m == null) break;
    ids.add(m[1]);
  }
  return ids.size;
}
