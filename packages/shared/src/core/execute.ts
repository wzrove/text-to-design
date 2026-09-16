import { CAPABILITY_OF_GATED_PROP } from '../dicts/capability';
import {
  CREATABLE_NODE_TYPES,
  type CreatableNodeType,
} from '../dicts/node-type';
import type { ExecuteOp, SerializedNode } from '../schemas';
import buildNode from './buildNode';
import type { DesignHost, NodeSkeleton } from './host';
import { serializeNode } from './serialize';

function coerceSpec(raw: unknown): ExecuteOp {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(
      `无效的节点指令: 期望对象,收到 ${raw === null ? 'null' : typeof raw}`,
    );
  }
  const type = (raw as { type?: string }).type;
  if (
    type !== undefined &&
    !CREATABLE_NODE_TYPES.includes(type as CreatableNodeType)
  ) {
    throw new Error(
      `无效的 type: "${type}"(支持 ${CREATABLE_NODE_TYPES.join('|')})`,
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
  host: DesignHost,
  ops: unknown,
  placement?: {
    mode?: 'center' | 'manual' | 'absolute';
    x?: number;
    y?: number;
  },
): Promise<{ created: SerializedNode[]; warnings?: string[] }> {
  const specs = coerceSpecs(ops);
  const page = host.currentPage;
  const mode = placement?.mode ?? 'center';
  const created: NodeSkeleton[] = [];
  // 能力门控字段被跳过时点名(创建路径此前完全静默:调用方以为带上了截断/样式 id)
  const skipped = new Set<string>();
  try {
    for (const spec of specs) {
      const node = await buildNode(host, spec, page, skipped);
      if (mode === 'center') {
        const center = host.viewport.center;
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
  host.viewport.scrollAndZoomIntoView(created);
  const warnings =
    skipped.size > 0
      ? [
          `以下字段由平台能力门控,当前平台运行时不具备,创建时已忽略:${[
            ...skipped,
          ]
            .map((key) => {
              const cap = CAPABILITY_OF_GATED_PROP[key];
              return cap != null ? `${key}(需 ${cap} 能力)` : key;
            })
            .join(
              '、',
            )};当前平台的能力表见 jsd_ping 的 capabilities(core 判定与该表同源)`,
        ]
      : undefined;
  return {
    created: created.map((n) => serializeNode(n)),
    ...(warnings != null ? { warnings } : {}),
  };
}

export function createSvgNode(
  host: DesignHost,
  svg: string,
  name?: string,
): { created: SerializedNode } {
  if (typeof svg !== 'string' || svg.trim() === '') {
    throw new Error('无效的 svg: 必须是非空字符串');
  }
  const node = host.createNodeFromSvg(svg);
  node.name = name ?? 'html-design';
  const page = host.currentPage;
  page.appendChild(node);
  const center = host.viewport.center;
  node.x = center.x - node.width / 2;
  node.y = center.y - node.height / 2;
  host.viewport.scrollAndZoomIntoView([node]);
  return { created: serializeNode(node) };
}
