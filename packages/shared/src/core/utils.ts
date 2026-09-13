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

export function collectTargets(
  base: readonly NodeSkeleton[],
  matchName: string | undefined,
  recursive: boolean,
  out: NodeSkeleton[] = [],
): NodeSkeleton[] {
  for (const node of base) {
    if (matchName == null || node.name === matchName) out.push(node);
    if (recursive && 'children' in node) {
      collectTargets(node.children ?? [], matchName, recursive, out);
    }
  }
  return out;
}
