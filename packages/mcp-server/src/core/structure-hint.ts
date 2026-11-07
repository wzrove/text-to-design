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
  /** 该父级下的直属子节点数(只数本批移入的,用于提示文案的「这一批」) */
  batchCount: number;
};

/**
 * 判「这一批 reparent 是不是又在往同一个父级平铺」。
 *
 * 只做一件事:数**本批**有多少步指向同一个 parentId。它不知道父级原有子节点数
 * (那需要一次额外往返读画布,代价大于提示本身的价值),所以阈值口径是
 * 「本批 ≥ 9 步进同一父级」—— 这正好是「一次整屏任务把分区全塞进屏根」的形状。
 *
 * 已按语义分好的批次不会命中:它们每步的 parentId 各不相同(每张卡一个容器)。
 */
export function detectFlatBatch(
  steps: { parentId?: unknown }[],
  options: {
    /**
     * 父级当前的直属子节点数(可选)。
     *
     * 单步 reparent 拿不到「这批几次」的信息 —— 它是第 N 次调用,不是第 N 步。
     * 调用方若能便宜地读到父级现有子节点数就传进来,这时判据变成
     * 「归入后该父级直属子节点数 ≥ 阈值」;读不到就只按本批计数判(见下)。
     */
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
  let best: CrowdedParentHit | null = null;
  for (const [parentId, batchCount] of counts) {
    // 两个口径取大的那个:
    // ① 本批就够多 = 一次整屏任务把分区全塞进屏根(批量层能看见);
    // ② 本批 + 父级原有 ≥ 阈值 = 单步 reparent 反复进同一屏根(拿到 existingChildCount 时才判)。
    const projected =
      typeof existing === 'number' && existing >= 0
        ? batchCount + existing
        : batchCount;
    if (projected < CROWDED_CHILDREN_THRESHOLD) continue;
    if (best == null || projected > best.batchCount) {
      best = { parentId, batchCount: projected };
    }
  }
  return best;
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
