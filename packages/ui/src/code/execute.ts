import type { ExecuteOp, SerializedNode } from 'text-to-design-shared';
import buildNode from './buildNode';
import { serializeNode } from './serialize';

const TYPES = [
  'FRAME',
  'RECTANGLE',
  'ELLIPSE',
  'LINE',
  'POLYGON',
  'STAR',
  'VECTOR',
  'BOOLEAN_OPERATION',
  'TEXT',
  'GROUP',
] as const;

function coerceSpec(raw: unknown): ExecuteOp {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(
      `无效的节点指令: 期望对象,收到 ${raw === null ? 'null' : typeof raw}`,
    );
  }
  const type = (raw as { type?: string }).type;
  if (type !== undefined && !TYPES.includes(type as (typeof TYPES)[number])) {
    throw new Error(
      `无效的 type: "${type}"(支持 ${TYPES.join('|')})`,
    );
  }
  return raw as ExecuteOp;
}

function coerceSpecs(ops: unknown): ExecuteOp[] {
  if (Array.isArray(ops)) {
    if (ops.length === 0) throw new Error('ops 为空数组,无可执行指令');
    return ops.map(coerceSpec);
  }
  return [coerceSpec(ops)];
}

export async function executeOps(
  ops: unknown,
  placement?: {
    mode?: 'center' | 'manual' | 'absolute';
    x?: number;
    y?: number;
  },
): Promise<{ created: SerializedNode[] }> {
  const specs = coerceSpecs(ops);
  const page = jsDesign.currentPage;
  const mode = placement?.mode ?? 'center';
  const created: SceneNode[] = [];
  try {
    for (const spec of specs) {
      const node = await buildNode(spec, page);
      if (mode === 'center') {
        const center = jsDesign.viewport.center;
        const dx = center.x - node.x - node.width / 2;
        const dy = center.y - node.y - node.height / 2;
        node.x += dx;
        node.y += dy;
      } else if (mode === 'absolute') {
        if (placement?.x != null) node.x = placement.x;
        if (placement?.y != null) node.y = placement.y;
      }
      created.push(node);
    }
  } catch (e) {
    for (const node of created) {
      try {
        node.remove();
      } catch {
        // 忽略回滚中的二次错误
      }
    }
    throw e;
  }
  jsDesign.viewport.scrollAndZoomIntoView(created);
  return { created: created.map((n) => serializeNode(n)) };
}

export function createSvgNode(
  svg: string,
  name?: string,
): { created: SerializedNode } {
  if (typeof svg !== 'string' || svg.trim() === '') {
    throw new Error('无效的 svg: 必须是非空字符串');
  }
  const node = jsDesign.createNodeFromSvg(svg);
  node.name = name ?? 'html-design';
  const page = jsDesign.currentPage;
  page.appendChild(node);
  const center = jsDesign.viewport.center;
  node.x = center.x - node.width / 2;
  node.y = center.y - node.height / 2;
  jsDesign.viewport.scrollAndZoomIntoView([node]);
  return { created: serializeNode(node) };
}
