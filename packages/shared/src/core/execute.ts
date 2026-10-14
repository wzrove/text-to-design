import { CAPABILITY_OF_GATED_PROP } from '../dicts/capability';
import {
  CREATABLE_NODE_TYPES,
  type CreatableNodeType,
} from '../dicts/node-type';
import {
  applicabilityMissNotice,
  propAppliesTo,
} from '../dicts/prop-applicability';
import type { ExecuteOp, SerializedNode } from '../schemas';
import buildNode, { assertSpecSupported } from './buildNode';
import type { DesignHost, NodeSkeleton } from './host';
import {
  type CreateNotes,
  emptyNotes,
  nodeLabel,
  unappliedWarning,
} from './props/outcome';
import { pinFixedAxisDrift } from './props/writers';
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

/**
 * 创建路径的**布局对账**:拿序列化后的值比请求值。
 *
 * 为什么不能只在 writer 的 settle 里判(那里已经判过一次):写入瞬间的回读是
 * **同 tick 原样回显**,引擎要到之后才把方向回写成另一头、把 FIXED 轴翻成 AUTO
 * —— 与 `fontName` 同一类坑(见 `core/utils.ts` 的 `fontNotResolved` 与
 * `props/writers.ts` 的对应注释)。序列化是这次执行里能拿到的最早可信读数。
 *
 * 实测(2026-10-12,jsDesign):建 auto-layout 行容器传 `layoutMode:"HORIZONTAL"`
 * + 两轴 FIXED + 1616×200,回包一切正常,**下一次调用 jsd_find 读回来是
 * VERTICAL + AUTO**,子卡被拉成整宽 —— 零告警。
 */
function reconcileCreatedLayout(
  spec: Readonly<Record<string, unknown>>,
  node: SerializedNode,
  notes: CreateNotes,
): void {
  const label = nodeLabel(node);
  const wantMode = spec.layoutMode;
  const modeLanded = wantMode != null && wantMode === node.layoutMode;
  if (wantMode != null && !modeLanded) {
    notes.unapplied.push({
      key: 'layoutMode',
      label,
      detail: `请求 ${String(wantMode)},回读 ${node.layoutMode ?? 'NONE'}`,
    });
  }
  // 没开布局的容器上这些字段本就不参与排布(与 writers 的 create 分支同口径):
  // 拿请求值对账只会自造「没生效」
  const layoutOn = wantMode != null || node.layoutMode != null;
  if (layoutOn) {
    for (const key of [
      'primaryAxisSizingMode',
      'counterAxisSizingMode',
    ] as const) {
      const want = spec[key];
      if (want == null) continue;
      const got = node[key];
      if (got === want) continue;
      notes.unapplied.push({
        key,
        label,
        detail: `请求 ${String(want)},回读 ${got ?? '读不到'}`,
      });
    }
  }
  // 布局没落地时不比 spacing/padding:没进布局的容器这些值本就不参与排布
  if (modeLanded) {
    for (const key of [
      'itemSpacing',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
    ] as const) {
      const want = spec[key];
      if (typeof want !== 'number' || node[key] === want) continue;
      notes.unapplied.push({
        key,
        label,
        detail: `请求 ${want},回读 ${node[key] ?? '读不到'}`,
      });
    }
  }
  // 声明了尺寸、该轴回读也写着 FIXED,引擎却仍按内容 hug 改了尺寸 ——
  // 实测(2026-10-12 jsDesign)传 120×260 开 VERTICAL 布局后回读 100×80,
  // 而 primaryAxisSizingMode/counterAxisSizingMode 两个字段本身是落库的,
  // 所以 sizingMode 的对账抓不到它:尺寸要单独比。
  if (node.layoutMode != null) {
    const primaryIsWidth = node.layoutMode === 'HORIZONTAL';
    for (const dim of ['width', 'height'] as const) {
      const want = spec[dim];
      if (typeof want !== 'number') continue;
      const got = node[dim];
      if (typeof got !== 'number' || Math.abs(got - want) <= 0.5) continue;
      const axisMode = primaryIsWidth
        ? dim === 'width'
          ? node.primaryAxisSizingMode
          : node.counterAxisSizingMode
        : dim === 'height'
          ? node.primaryAxisSizingMode
          : node.counterAxisSizingMode;
      // AUTO 轴按内容撑开属预期,不是没生效
      if (axisMode === 'AUTO') continue;
      notes.messages.push(
        [
          `${label} 的 ${dim} 未落地:请求 ${want},回读 ${got}(该轴 sizingMode 回读为 ${axisMode ?? '读不到'})。`,
          'auto-layout 容器即使 sizingMode 写着 FIXED,引擎仍可能在开启布局/插入子节点时按内容重算尺寸。',
          '处理:布局与子节点都就位后,用 jsd_resize_node 传 width/height 钉回尺寸(重发 set_layout 会再被吃掉一次);',
          '要按内容撑开就别传该维尺寸,直接声明该轴 sizingMode 为 AUTO,免得对账口径互相打架。',
        ].join(''),
      );
    }
  }
  const kids = node.children;
  const specKids = spec.children;
  if (kids == null || !Array.isArray(specKids) || specKids.length === 0) return;
  // 次序基线 = spec 数组序(创建时按它逐个 append);引擎开布局会按几何重排
  const wantOrder = (specKids as readonly Record<string, unknown>[]).map((s) =>
    typeof s?.name === 'string' ? s.name : '',
  );
  const gotOrder = kids.map((k) => k.name);
  if (
    wantOrder.length === gotOrder.length &&
    wantOrder.some((n, i) => n !== gotOrder[i])
  ) {
    notes.messages.push(
      [
        `${label} 的子节点次序被 auto-layout 重排:${wantOrder.join('→')} 变成 ${gotOrder.join('→')}(次序即绘制顺序,也是布局排布顺序)。`,
        '表现:期望的层叠/排列关系变了,遮挡可能反过来。',
        '处理:用 jsd_reparent_nodes(传 parentId + index)按目标次序归位;引擎按几何位置排布,',
        '想让顺序稳定就先把手动排好的 x/y 摆成期望次序,再开布局。',
      ].join(''),
    );
  }
  // 引擎可能已按几何重排 children,位置对不上 —— 按 name 配对(创建工具强制语义名)
  const pending = new Map<string, Record<string, unknown>[]>();
  for (const s of specKids as readonly Record<string, unknown>[]) {
    const key = typeof s?.name === 'string' ? s.name : '';
    const queue = pending.get(key);
    if (queue) queue.push(s);
    else pending.set(key, [s]);
  }
  for (const kid of kids) {
    const queue = pending.get(kid.name);
    const specKid = queue?.shift();
    if (specKid == null) continue;
    reconcileCreatedLayout(specKid, kid, notes);
  }
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
  // 出错回滚按「页面顶层新增了什么」清扫,而不是只删 created 里的:抛在 buildNode 半途时
  // 那个节点还没进 created(实测 icon 子节点报错后留下建了一半的空父层)
  const pageTopBefore = new Set(
    ((page as { children?: readonly NodeSkeleton[] }).children ?? []).map(
      (c) => c.id,
    ),
  );
  try {
    for (const spec of specs) {
      assertSpecSupported(spec);
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
    // 先取静态快照再删:children 是活数组,边删边迭代会跳过元素
    const topNow = [
      ...((page as { children?: readonly NodeSkeleton[] }).children ?? []),
    ];
    for (const n of topNow) {
      if (pageTopBefore.has(n.id)) continue;
      try {
        n.remove();
      } catch {}
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
  // 布局字段对账(创建路径 settle 的回读是同 tick 回显,判不出引擎事后回写)
  for (let i = 0; i < specs.length; i += 1) {
    reconcileCreatedLayout(
      specs[i] as unknown as Readonly<Record<string, unknown>>,
      serialized[i],
      notes,
    );
  }
  // 声明了 FIXED 的轴被引擎按内容重算 → 按请求值钉回(判据与修改路径同一份)
  for (let i = 0; i < specs.length; i += 1) {
    warnings.push(
      ...pinFixedAxisDrift(
        created[i],
        serialized[i],
        specs[i] as unknown as { width?: unknown; height?: unknown },
      ),
    );
  }
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
  // 属性 × 节点类型不匹配:创建路径此前**不点名**(给矩形写 layoutGrids 会静默丢弃,
  // 回包却是成功),而修改路径早有这句话 —— 同一个事实两处只说一处。
  // 文案与允许类型都由 dicts/prop-applicability 派生,两条路径共用(2026-09-24)。
  const missKeys = new Set<string>();
  for (let i = 0; i < specs.length; i += 1) {
    const created0 = serialized[i] as unknown as { type?: string };
    if (created0?.type == null) continue;
    for (const key of Object.keys(specs[i])) {
      if (!propAppliesTo(key, created0.type)) missKeys.add(key);
    }
  }
  const missed = applicabilityMissNotice([...missKeys]);
  if (missed != null) warnings.push(missed);
  // writer 自述类告警(WriteOutcome.warnings):0004 预留的出口,创建路径此前没接
  warnings.push(...notes.messages);
  return {
    created: serialized,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function createSvgNode(
  host: DesignHost,
  svg: string,
  name?: string,
): Promise<{ created: SerializedNode }> {
  if (typeof svg !== 'string' || svg.trim() === '') {
    throw new Error('无效的 svg: 必须是非空字符串');
  }
  // 异步建节点(MasterGo 只有 *Async 变体,见 host.ts 的契约注释 / 0017)
  const node = await host.createNodeFromSvgAsync(svg);
  node.name = name ?? 'html-design';
  const page = host.currentPage;
  page.appendChild(node);
  const center = host.viewport.center;
  node.x = center.x - node.width / 2;
  node.y = center.y - node.height / 2;
  host.viewport.scrollAndZoomIntoView([node]);
  return { created: serializeNode(node) };
}
