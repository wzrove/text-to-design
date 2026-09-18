import type { ExecuteOp } from '../schemas';
import { isGatedPropUnsupported } from './capabilities';
import type { ContainerSkeleton, DesignHost, NodeSkeleton } from './host';
import { assertBooleanOperation, normalizeVectorPaths } from './normalize';
import { settleWriters, writePhase } from './props/run';
import { emptyOutcome, type WriteCtx } from './props/types';
import {
  CREATE_WRITERS,
  createStabilizeWriter,
  geometryWriter,
  layoutWriter,
} from './props/writers';
import type { RuntimeContext } from './runtime';

/** 创建路径上受平台能力门控的 spec 字段(与 dicts/capability.ts 的属性表对应) */
const GATED_SPEC_KEYS = [
  'fillStyleId',
  'strokeStyleId',
  'textStyleId',
  'effectStyleId',
  'textTruncation',
  'maxLines',
] as const satisfies readonly (keyof ExecuteOp)[];

async function buildNode(
  host: DesignHost,
  ctx: RuntimeContext,
  spec: ExecuteOp,
  parent: ContainerSkeleton,
  /** 收集「平台不具备、被静默跳过」的门控字段(由 executeOps 汇总进结果 warnings) */
  skipped?: Set<string>,
): Promise<NodeSkeleton> {
  const type = spec.type;
  let node: NodeSkeleton;
  switch (type) {
    case 'TEXT':
      node = host.createText();
      break;
    case 'RECTANGLE':
      node = host.createRectangle();
      break;
    case 'ELLIPSE':
      node = host.createEllipse();
      break;
    case 'LINE':
      node = host.createLine();
      break;
    case 'POLYGON':
      node = host.createPolygon();
      break;
    case 'STAR':
      node = host.createStar();
      break;
    case 'VECTOR':
      node = host.createVector();
      break;
    case 'BOOLEAN_OPERATION': {
      const children = spec.children ?? [];
      if (children.length < 2) {
        throw new Error('BOOLEAN_OPERATION 至少需要 2 个子节点');
      }
      const tmp = host.createFrame();
      parent.appendChild(tmp);
      for (const child of children) {
        await buildNode(host, ctx, child, tmp);
      }
      const combine: Record<
        string,
        (
          nodes: readonly NodeSkeleton[],
          parent: ContainerSkeleton,
        ) => NodeSkeleton
      > = {
        UNION: host.union,
        SUBTRACT: host.subtract,
        INTERSECT: host.intersect,
        EXCLUDE: host.exclude,
      };
      const op = assertBooleanOperation(spec.booleanOperation ?? 'UNION');
      node = combine[op]([...(tmp.children ?? [])], parent);
      tmp.remove();
      break;
    }
    case 'GROUP': {
      const children = spec.children ?? [];
      if (children.length < 2) {
        throw new Error('GROUP 至少需要 2 个子节点');
      }
      const tmp = host.createFrame();
      parent.appendChild(tmp);
      for (const child of children) {
        await buildNode(host, ctx, child, tmp);
      }
      node = tmp;
      break;
    }
    default:
      node = host.createFrame();
  }

  const wctx: WriteCtx = {
    host,
    ctx,
    node,
    src: spec as unknown as Readonly<Record<string, unknown>>,
    outcome: emptyOutcome(),
    create: true,
  };

  // ---- 属性写入:与修改路径共用同一批 writer(见 core/props/writers) ----
  // 创建路径的默认值与推断(P10 清灰底 / TEXT 默认字 / P18 padding 归零 + sizingMode
  // 推断)都在 writer 里由 ctx.create 显式触发,不再是这里另写一份 200 行。
  await writePhase(wctx, CREATE_WRITERS);

  parent.appendChild(node);
  if (spec.type === 'BOOLEAN_OPERATION') {
    return node;
  }
  if (node.type === 'VECTOR' && spec.vectorPaths != null) {
    // 归一化:data 必填,windingRule 缺省 NONZERO(引擎对 undefined 直接抛错)
    node.vectorPaths = normalizeVectorPaths(
      spec.vectorPaths,
    ) as typeof spec.vectorPaths;
  }
  for (const child of spec.children ?? []) {
    await buildNode(host, ctx, child, node);
  }

  // ---- 自动布局必须在子节点插完之后写 ----
  // 引擎会在插入子节点时按内容重算容器尺寸与方向,写在前面会被覆盖 —— 这正是 P18
  // (传 690×210 带嵌套 children,返回 630×160)的根因。
  await writePhase(wctx, [layoutWriter]);

  // ---- 稳定化(顺序固定:尺寸 → sizingMode → 方向) ----
  // ① 尺寸:P18 —— 再压一次,显式给了尺寸就以调用方为准;
  // ② sizingMode:resize 会把显式声明的 AUTO 悄悄改回 FIXED,声明过的再写回去;
  // ③ 方向:P31 —— 布局重算可能把刚写的 layoutMode 回写成另一方向,回读修正。
  await settleWriters(wctx, [
    geometryWriter,
    createStabilizeWriter,
    layoutWriter,
  ]);

  // 平台能力门控字段:判定与修改路径同源(core/capabilities.ts),不具备时不再静默跳过 ——
  // 记进 skipped 由 executeOps 汇总成 warnings 点名,否则调用方以为建的时候就带上截断/样式了
  for (const key of GATED_SPEC_KEYS) {
    if (spec[key] == null) continue;
    if (!isGatedPropUnsupported(ctx, key, node)) continue;
    skipped?.add(key);
  }

  return node;
}

export default buildNode;
