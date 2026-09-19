import type { ToolHook, ToolHookFactory } from '../core/registry';
import { lookupExecutor } from '../core/registry';

/** 当前页顶层 children 在图里的伪层键 */
const PAGE_KEY = '(page)';

/** 复核规模上限:层数 × 每层子节点数,避免复核本身变成大头 */
const MAX_LAYERS = 8;
const MAX_CHILDREN = 200;

/** 点名几个漂移节点,其余折叠成计数 */
const MAX_REPORTED = 5;

interface Geo {
  id: string;
  name: string;
  x: number;
  y: number;
}

/**
 * 结构变更类 node_op:删除/移父之后引擎可能重算同层约束,把没碰到的兄弟挪走。
 *
 * 这份名单是**唯一真源**:tools/nodes.ts 的 opTool 用它给固定 op 小工具挂漂移复核钩子,
 * 聚合入口 jsd_manage_nodes 的钩子也在 tools/manage.ts 挂上、由本文件的
 * `isStructuralArgs` 按入参 op 判断该不该查。此前 `isDriftRisky` 手抄 6 个工具名 +
 * 6 个 op 名,与 opTool 的清单是两份事实 —— 加一个结构类工具忘了改那边,就静默失去复核。
 */
export const STRUCTURAL_NODE_OPS = new Set([
  'remove',
  'reparent',
  'group',
  'ungroup',
  'flatten',
  'repair',
]);

/** 该次调用的 op 是否属于结构变更(聚合入口按入参判断) */
function isStructuralArgs(args: Record<string, unknown>): boolean {
  const op = args.op;
  return typeof op === 'string' && STRUCTURAL_NODE_OPS.has(op);
}

/** reparent 需要额外盯住目标父级(它多了个孩子,原有兄弟同样可能被重算) */
function isReparentArgs(args: Record<string, unknown>): boolean {
  return args.op === 'reparent';
}

/** 从步骤入参里捡出会被结构变更影响的节点 id */
function collectArgIds(args: unknown, out: Set<string>): void {
  if (args == null || typeof args !== 'object') return;
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (k === 'ids' && Array.isArray(v)) {
      for (const x of v) if (typeof x === 'string' && x !== '') out.add(x);
      continue;
    }
    if (
      (k === 'parentId' || k === 'nodeId' || k === 'componentId') &&
      typeof v === 'string' &&
      v !== ''
    ) {
      out.add(v);
    }
  }
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is Record<string, unknown> => x != null && typeof x === 'object',
  );
}

function toGeo(raw: unknown): Geo | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== 'string' ||
    typeof o.x !== 'number' ||
    typeof o.y !== 'number'
  ) {
    return null;
  }
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : o.id,
    x: o.x,
    y: o.y,
  };
}

/** 内部直调另一个已注册工具的执行体(绕开 MCP 往返);失败/离线一律返回 null */
async function callExecutor(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const exec = lookupExecutor(name);
  if (exec == null) return null;
  const res = (await exec(args, undefined)) as {
    isError?: boolean;
    structuredContent?: unknown;
  };
  if (res?.isError === true) return null;
  const data = res?.structuredContent;
  return data != null && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : null;
}

/** 读一层的子节点几何;读不到(层被删/失效/离线)返回 null */
async function readLayer(layer: string): Promise<Map<string, Geo> | null> {
  const out = new Map<string, Geo>();
  if (layer === PAGE_KEY) {
    const data = await callExecutor('jsd_get_page', {});
    if (data == null) return null;
    for (const n of asArray(data.nodes).slice(0, MAX_CHILDREN)) {
      const g = toGeo(n);
      if (g != null) out.set(g.id, g);
    }
    return out;
  }
  const data = await callExecutor('jsd_find', { ids: [layer], depth: 1 });
  if (data == null) return null;
  const node = asArray(data.nodes)[0];
  if (node == null) return null;
  for (const c of asArray(node.children).slice(0, MAX_CHILDREN)) {
    const g = toGeo(c);
    if (g != null) out.set(g.id, g);
  }
  return out;
}

/**
 * P25-B 自动复核:批量含 remove/reparent 等结构变更时,引擎可能把本次操作
 * **没碰到**的兄弟节点静默挪走(实测 78:2 里 cta-button (24,720)→(28,618)、
 * lang-card (24,430)→(28,458),x 双双 +4;无报错、回显正常,渲染上看起来像
 * 样式问题 —— cta-halo 与按钮脱钩,呈「悬在导航区的孤光」)。
 *
 * 调用侧原本的手工纪律是「收尾拿 jsd_find 复核同层其它节点的 x/y」,这里把它
 * 自动化:执行结构变更步骤**之前**记下受影响父层(含当前页顶层)的子节点坐标,
 * 批次收尾再读一次逐节点比对,漂移就点名并给出回填值。
 *
 * 覆盖面:本次操作触及的父层(含 reparent 的目标父级)。彻底的全页体检需要读整棵
 * 树,当前协议没有这种读法 —— 漂移发生在别的层时查不到,这一点在批次描述里写明。
 * 任何一步读失败只意味着「这次不查」,绝不影响批次成败。
 */
export class DriftWatch implements ToolHook {
  private readonly snapshots = new Map<string, Map<string, Geo>>();
  private readonly dead = new Set<string>();
  /** 本次调用是否真的做了快照;非结构变更的调用不该产生任何复核动作 */
  private engaged = false;

  /** ToolHook.before:执行前确定受影响父层并记下它们的几何 */
  async before(args: Record<string, unknown>): Promise<void> {
    // 钩子同时挂在固定 op 小工具(注册时按 tag 挂)与聚合入口 jsd_manage_nodes 上:
    // 后者 op 由入参给出,这里按 STRUCTURAL_NODE_OPS 判断本次要不要查
    const op = args.op;
    if (op !== undefined && !isStructuralArgs(args)) return;
    this.engaged = true;
    try {
      const ids = new Set<string>();
      collectArgIds(args, ids);
      if (ids.size === 0) return;
      const data = await callExecutor('jsd_find', {
        ids: [...ids],
        depth: 0,
      });
      const layers = new Set<string>();
      let pageLevel = false;
      for (const n of asArray(data?.nodes)) {
        const pid = typeof n.parentId === 'string' ? n.parentId : '';
        if (pid === '') pageLevel = true;
        else layers.add(pid);
      }
      // reparent 的目标父级也要看:它多了个孩子,原有兄弟同样可能被重算
      if (isReparentArgs(args) && typeof args.parentId === 'string') {
        layers.add(args.parentId);
      }
      if (pageLevel) layers.add(PAGE_KEY);
      for (const layer of layers) {
        if (this.snapshots.has(layer) || this.dead.has(layer)) continue;
        if (this.snapshots.size >= MAX_LAYERS) {
          this.dead.add(layer);
          continue;
        }
        const snap = await readLayer(layer);
        if (snap == null) {
          this.dead.add(layer);
          continue;
        }
        this.snapshots.set(layer, snap);
      }
    } catch {
      // 复核能力是尽力而为,不能因为读不到画布就把批次搞挂
    }
  }

  /** ToolHook.after:返回漂移告警(空数组 = 没查或没漂移) */
  async after(): Promise<string[]> {
    if (!this.engaged) return [];
    const warnings: string[] = [];
    for (const [layer, snapshot] of this.snapshots) {
      try {
        const after = await readLayer(layer);
        if (after == null) continue;
        const drifted: { from: Geo; to: Geo }[] = [];
        for (const [id, b] of snapshot) {
          const a = after.get(id);
          if (a == null) continue;
          if (a.x !== b.x || a.y !== b.y) drifted.push({ from: b, to: a });
        }
        if (drifted.length === 0) continue;
        const sample = drifted
          .slice(0, MAX_REPORTED)
          .map(
            (d) =>
              `${d.from.name}(${d.from.id}) (${d.from.x},${d.from.y}) → (${d.to.x},${d.to.y})`,
          );
        const rest =
          drifted.length > MAX_REPORTED ? ` 等 ${drifted.length} 个节点` : '';
        warnings.push(
          [
            `同层几何漂移(平台缺陷 P25-B):${
              layer === PAGE_KEY ? '当前页顶层' : `父级 ${layer}`
            } 内有未被本次操作触及的节点自行移位:${sample.join('、')}${rest}。`,
            '根因疑似删除/移父后引擎重算同层约束(无报错、回显正常),别当成样式问题排查。',
            '处理:用 jsd_move_node 按上述原值回填,或先 jsd_find 复核该层全部节点 x/y。',
          ].join(''),
        );
      } catch {
        // 同 before:复核失败静默跳过
      }
    }
    return warnings;
  }
}

/**
 * 漂移复核钩子。
 *
 * 挂在工具定义上而不是写在 `jsd_batch` 里:同一个平台缺陷,走 batch 的步骤有复核、
 * 直接调 `jsd_delete_node` 却没有 —— 那是覆盖面漏洞,不是编排细节。
 * 现在任何调用路径(单工具 / 编排)都会经过 `bridgeTool` 的钩子槽。
 */
export const driftWatch: ToolHookFactory = () => new DriftWatch();
