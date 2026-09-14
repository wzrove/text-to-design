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
