import type { DesignHost, NodeSkeleton } from './host';
import { trySerialize } from './serialize';

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
