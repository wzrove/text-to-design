import { CAPABILITY_OF_GATED_PROP } from '../dicts/capability';
import {
  CREATABLE_NODE_TYPES,
  type CreatableNodeType,
} from '../dicts/node-type';
import type { ExecuteOp, SerializedNode } from '../schemas';
import buildNode from './buildNode';
import type { DesignHost, NodeSkeleton } from './host';
import { emptyNotes, nodeLabel, unappliedWarning } from './props/outcome';
import type { RuntimeContext } from './runtime';
import { serializeNode } from './serialize';
import { fontNotResolved } from './utils';

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
  ctx: RuntimeContext,
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
  // 写后回收袋(0007):门控字段 + 回读不一致 + writer 自述告警,一次调用共用一份
  const notes = emptyNotes();
  try {
    for (const spec of specs) {
      const node = await buildNode(host, ctx, spec, page, notes);
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
  // 序列化必须在结果装配前完成:字体判定要用**序列化后**的 fontName(引擎已落库的形态),
  // 写入/结算时刻读到的还是原样回显,判不出「组合有没有被解析」(见 utils.fontNotResolved)。
  const serialized = created.map((n) => serializeNode(n));
  for (let i = 0; i < specs.length; i += 1) {
    const want = specs[i].fontName as
      | { family?: unknown; style?: unknown }
      | undefined;
    const got = serialized[i] as unknown as { fontName?: unknown };
    if (want == null || got == null) continue;
    const why = fontNotResolved(want, got.fontName);
    if (why != null) {
      notes.unapplied.push({
        key: 'fontName',
        label: nodeLabel(serialized[i]),
        detail: why,
      });
    }
  }
  const warnings: string[] = [];
  if (notes.skipped.size > 0) {
    warnings.push(
      `以下字段由平台能力门控,当前平台运行时不具备,创建时已忽略:${[
        ...notes.skipped,
      ]
        .map((key) => {
          const cap = CAPABILITY_OF_GATED_PROP[key];
          return cap != null ? `${key}(需 ${cap} 能力)` : key;
        })
        .join(
          '、',
        )};当前平台的能力表见 jsd_ping 的 capabilities(core 判定与该表同源)`,
    );
  }
  // 根节点的 x/y 由 placement 决定:给了坐标却没声明 manual/absolute 时,
  // 这份坐标会被静默丢弃(缺省 center 用视口中心覆盖)—— 明确点名。
  // 此前是「回显成功、位置却不在请求的坐标上」,调用方只能靠肉眼发现。
  const withCoords = specs.filter((s) => s.x != null || s.y != null).length;
  if (mode !== 'manual' && withCoords > 0) {
    warnings.push(
      [
        `根节点的 x/y 未生效:placement 缺省为 center(本次 mode=${mode}),根节点自身的 x/y 会被 placement 覆盖`,
        mode === 'center'
          ? '(每个根节点各自移到视口中心,多根还会互相叠放)。'
          : `(所有根统一放到 placement.x=${placement?.x}、y=${placement?.y})。`,
        '要按坐标排布:传 placement:{mode:"manual"}(保留根节点 x/y)或 placement:{mode:"absolute",x,y}(统一坐标);',
        '层级结构改用 children 嵌套 —— 子节点的 x/y 相对父节点,不受 placement 影响。',
      ].join(''),
    );
  }
  const unapplied = unappliedWarning(notes.unapplied);
  if (unapplied != null) warnings.push(unapplied);
  // writer 自述类告警(WriteOutcome.warnings):0004 预留的出口,创建路径此前没接
  warnings.push(...notes.messages);
  return {
    created: serialized,
    ...(warnings.length > 0 ? { warnings } : {}),
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
