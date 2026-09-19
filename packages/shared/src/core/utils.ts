import type { DesignHost, NodeSkeleton } from './host';
import { trySerialize } from './serialize';

/**
 * 引擎 resize 校验的最小尺寸(实测 0.01,小于该值报
 * `Expected "width" to have value >= 0.01`)。
 * LINE 的「线长 + 零厚」是合法形态(画布上已有线段序列化就是 `height: 0`),
 * 但引擎校验要求两维都 >= 该值:创建与改尺寸两条路径都对 LINE 做零轴豁免。
 * 其他类型低于该值时给可读报错,而不是把引擎断言原样抛给调用方。
 */
export const MIN_RESIZE_SIZE = 0.01;

export function findNode(host: DesignHost, ids: string[]): NodeSkeleton[] {
  const nodes: NodeSkeleton[] = [];
  for (const id of ids) {
    try {
      const n = host.getNodeById(id);
      if (n && isUsable(n)) {
        nodes.push(n);
        continue;
      }
    } catch {
      // 失效 id,继续
    }
    try {
      const n = host.currentPage.findOne((x) => x.id === id);
      if (n && isUsable(n)) nodes.push(n);
    } catch (e) {
      console.error(
        `[core] findOne 失败,跳过 id=${id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return nodes;
}

/** 悬挂节点(底层记录失效,读属性必崩)用 trySerialize 检出并静默剔除 */
function isUsable(n: NodeSkeleton): boolean {
  return trySerialize(n, 0) !== null;
}

export async function loadFont(
  host: DesignHost,
  family: string,
  style: string,
): Promise<void> {
  try {
    await host.loadFontAsync({ family, style });
  } catch {
    // 字体不可用时忽略,保持默认字体
  }
}

/**
 * family 的归一键:`jsd_list_fonts` 的清单里形如 `SourceHanSansCN_family`,
 * 引擎解析成功后落库是短名 `SourceHanSansCN` —— 判等时两边都去掉这个后缀。
 */
export function fontFamilyKey(family: unknown): string {
  return typeof family === 'string'
    ? family
        .trim()
        .toLowerCase()
        .replace(/_family$/, '')
    : '';
}

/**
 * `fontName` 是否**真的被引擎解析**。
 *
 * ⚠️ 必须用**结果里序列化后的** fontName 判,不能用写/结算时刻回读的值:实测
 * (2026-09-19,jsDesign 0.8.0 插件)写入瞬间读回的是**原样回显**(请求什么读什么),
 * 引擎的规范化要等到后续读取才可见 —— 拿写后立刻回读的值判,会把合法写法误报成
 * 「未生效」(上一轮实测踩过这个坑,见 docs/design-decisions/0007)。
 * 结果里的 fontName 已是引擎落库形态,判据于是稳定(四组实测):
 *
 * | 请求 family | 请求 style | 回读 family | 实际 |
 * |---|---|---|---|
 * | `SourceHanSansCN_family` | `SourceHanSansCN-Bold` | `SourceHanSansCN` | 解析成功 |
 * | `SourceHanSansCN` | `Bold` | `SourceHanSansCN` | 解析成功 |
 * | `SourceHanSansCN_family` | `Bold`(简称) | `SourceHanSansCN_family` | **未解析** |
 * | `NoSuchFontXYZ_family` | `NoSuchFontXYZ-Bold` | 被换成别的字面 | **未解析** |
 *
 * 即:请求带 `_family` 却回读**仍带** `_family` ⇒ 没被解析(这正是「style 写成简称」
 * 的失败形态);回读的族与请求不是同一个族 ⇒ 整族回退。反之放行 —— 判不出来时
 * **宁可漏报**(family 不带 `_family` 的少数族无法用这个信号)。
 *
 * @returns null = 本次字形请求成立;否则给一句「为什么没成立」
 * (修法文案由 `dicts/unapplied-prop.ts` 提供,两条写路径共用)
 */
export function fontNotResolved(
  want: { family?: unknown; style?: unknown },
  got: unknown,
): string | null {
  if (typeof got !== 'object' || got === null) return null;
  const wantFamily = typeof want.family === 'string' ? want.family.trim() : '';
  if (wantFamily === '') return null;
  const gotFamily = (got as { family?: unknown }).family;
  const gotStyle = (got as { style?: unknown }).style;
  // 引擎对解析不了的组合会用 `@@` 前缀的哨兵字面(实测 style 落成 "@@Regular")
  if (typeof gotStyle === 'string' && gotStyle.startsWith('@@')) {
    return `回读的字型是哨兵值「${gotStyle}」,引擎没有解析这个 family/style`;
  }
  if (fontFamilyKey(gotFamily) !== fontFamilyKey(wantFamily)) {
    return `回读的族是「${String(gotFamily)}」,与请求的「${wantFamily}」不同(整族回退)`;
  }
  const isListForm = (v: unknown): boolean =>
    typeof v === 'string' && /_family$/.test(v.trim());
  if (isListForm(wantFamily) && isListForm(gotFamily)) {
    return `回读仍是清单形态「${String(gotFamily)}」,说明该 family/style 组合没被解析`;
  }
  return null;
}

/** 容器布局方向三态(各文件不再各写一份字面量联合) */
export type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL';

/**
 * 写 `layoutMode` 并**回读校验**(P31,与 P14 / P19 补丁同族:布局属性写完不能假定它还在)。
 *
 * 实测:引擎在布局重算之后会回写容器方向 —— 出现「显式传 `HORIZONTAL`、回读却是
 * `VERTICAL`」,子节点于是按垂直方向排布、全叠在同一点(两个导航按钮叠在 (16,8),
 * 渲染上只看得见一个,极易误判成样式或 z-order 问题)。
 * 触发点不确定(切方向 / 改尺寸 / 往 auto-layout 容器插子节点都可能命中),所以不赌
 * 是哪一次写丢了:统一「写 → 回读 → 不一致再压一次」。
 *
 * @returns 最终是否与 `expected` 一致。`false` = 压不住,调用方必须点名
 * (进 `warnings` 或报错),不允许「回显成功实则没生效」。
 */
export function ensureLayoutMode(node: object, expected: LayoutMode): boolean {
  const target = node as { layoutMode?: LayoutMode };
  if (!('layoutMode' in target)) return true;
  if (target.layoutMode !== expected) target.layoutMode = expected;
  return target.layoutMode === expected;
}

export interface CollectTargetsOptions {
  /**
   * recursive=true 时是否连目标节点自身一起改,默认 false(P26)。
   * 历史行为是「自身 + 全部后代」,照字面理解「子树/后代」的调用方会中招:
   * 给 12 个图标 FRAME 传 recursive 刷描边,容器自己也被套上 strokeWeight:1 的
   * 矩形框(渲染成「每个图标一个方框」)。现在默认只作用于后代,要连自身一起改
   * 必须显式传 true。
   */
  includeSelf?: boolean;
}

export function collectTargets(
  base: readonly NodeSkeleton[],
  matchName: string | undefined,
  recursive: boolean,
  out: NodeSkeleton[] = [],
  options: CollectTargetsOptions = {},
): NodeSkeleton[] {
  for (const node of base) {
    const children = 'children' in node ? (node.children ?? []) : null;
    // 叶子节点(无子节点)例外:此时「自身」就是整棵子树,跳过会让 recursive 变成
    // 空操作,调用方的合理请求会被回一句「没有命中」。
    const includeSelf =
      !recursive ||
      options.includeSelf === true ||
      (children?.length ?? 0) === 0;
    if (includeSelf && (matchName == null || node.name === matchName)) {
      out.push(node);
    }
    if (recursive && children != null) {
      collectTargets(children, matchName, recursive, out, options);
    }
  }
  return out;
}
