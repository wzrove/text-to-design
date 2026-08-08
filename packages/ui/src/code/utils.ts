import { trySerialize } from './serialize';

export function findNode(ids: string[]): SceneNode[] {
  const nodes: SceneNode[] = [];
  for (const id of ids) {
    try {
      const n = jsDesign.getNodeById(id) as SceneNode | null;
      if (n && isUsable(n)) {
        nodes.push(n);
        continue;
      }
    } catch {
      // 失效 id,继续
    }
    try {
      const n = jsDesign.currentPage.findOne(
        (x) => x.id === id,
      ) as SceneNode | null;
      if (n && isUsable(n)) nodes.push(n);
    } catch (e) {
      console.error(
        `[code] findOne 失败,跳过 id=${id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return nodes;
}

/** 悬挂节点(底层记录失效,读属性必崩)用 trySerialize 检出并静默剔除 */
function isUsable(n: SceneNode): boolean {
  return trySerialize(n, 0) !== null;
}

export async function loadFont(family: string, style: string): Promise<void> {
  try {
    await jsDesign.loadFontAsync({ family, style });
  } catch {
    // 字体不可用时忽略,保持默认字体
  }
}

export function collectTargets(
  base: readonly SceneNode[],
  matchName: string | undefined,
  recursive: boolean,
  out: SceneNode[] = [],
): SceneNode[] {
  for (const node of base) {
    if (matchName == null || node.name === matchName) out.push(node);
    if (recursive && 'children' in node) {
      collectTargets(node.children as SceneNode[], matchName, recursive, out);
    }
  }
  return out;
}
