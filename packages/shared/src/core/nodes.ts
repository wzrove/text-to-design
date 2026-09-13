import type {
  FindParams,
  FindResult,
  PageStructureResult,
  SerializedNode,
} from '../schemas';
import type {
  ContainerSkeleton,
  DesignHost,
  NodeSkeleton,
  PageSkeleton,
} from './host';
import { serializeNode, trySerialize } from './serialize';
import { findNode } from './utils';

/**
 * 节点在页面坐标系里的原点(绝对坐标)。
 *
 * 平台差异:jsDesign 的 `absolutePosition` **存在但字段为 undefined**(实测读出
 * `{x:undefined,y:undefined}`),写入还会触发引擎 `set_x` 断言。因此这里:
 * 1. 优先读原生 `absolutePosition`,但**必须逐字段校验有限性**,否则 NaN 会顺着
 *    后续赋值流进引擎,报错变成难以定位的 `set_x` 断言;
 * 2. 读不到就沿父链累加 x/y 兜底(忽略旋转,覆盖无旋转的常见场景)。
 *    父级若为异常代理对象其 x/y 可能 undefined,每一步都要校验。
 *
 * 用于 reparent / groupNodes 前后对齐坐标:放置类操作一律以「页面系」为基准,
 * 不依赖引擎是否自动换算(实测同一父级会换算、深层容器不换算,见 P17)。
 */
function absoluteOrigin(node: NodeSkeleton): { x: number; y: number } {
  const abs = node.absolutePosition;
  if (abs != null && Number.isFinite(abs.x) && Number.isFinite(abs.y)) {
    return { x: abs.x, y: abs.y };
  }
  let x = Number.isFinite(node.x) ? node.x : 0;
  let y = Number.isFinite(node.y) ? node.y : 0;
  let p: NodeSkeleton | null = node.parent;
  let guard = 0;
  while (p && guard < 64) {
    if (Number.isFinite(p.x)) x += p.x;
    if (Number.isFinite(p.y)) y += p.y;
    p = p.parent ?? null;
    guard += 1;
  }
  return { x, y };
}

/**
 * 容器是否开启 auto-layout。auto-layout 容器的子节点次序/坐标由布局接管:
 * 走 `insertChild` 会触发引擎布局重算路径读取子节点 layoutGrow,而插件侧节点
 * 代理在 jsDesign 上该读取会崩(实测 `get_layoutGrow: ... reading 'jsGet'`,见 P8)。
 */
function isAutoLayoutContainer(node: ContainerSkeleton): boolean {
  return (
    'layoutMode' in node &&
    (node as { layoutMode?: string }).layoutMode != null &&
    (node as { layoutMode?: string }).layoutMode !== 'NONE'
  );
}

/**
 * 临时关掉 auto-layout 时会被引擎连带重置的布局属性(P14)。
 *
 * 实测:只恢复 layoutMode 是不够的 —— 引擎在 layoutMode → NONE 时会把
 * primaryAxisSizingMode / counterAxisSizingMode 重置成另一组默认(AUTO↔FIXED 对调),
 * 结果「调个层序把容器尺寸模式改了」。下面这些一并快照、恢复。
 */
const LAYOUT_PRESERVE_KEYS = [
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'itemSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
] as const;

type LayoutRecord = Record<string, unknown>;

function snapshotLayout(container: ContainerSkeleton): LayoutRecord {
  const src = container as unknown as LayoutRecord;
  const snap: LayoutRecord = {};
  for (const key of LAYOUT_PRESERVE_KEYS) {
    if (src[key] != null) snap[key] = src[key];
  }
  return snap;
}

function restoreLayout(container: ContainerSkeleton, snap: LayoutRecord): void {
  const dst = container as unknown as LayoutRecord;
  for (const [key, value] of Object.entries(snap)) {
    try {
      dst[key] = value;
    } catch {
      // 单个属性恢复失败不影响其余属性:宁可少恢复一项,也不要把插入节点的操作整体回滚
    }
  }
}

/**
 * 把节点按 index 插到 parent 下(index = children 下标 = 绘制顺序,0 = 最底层)。
 *
 * 非 auto-layout 容器直接 `insertChild`。
 * auto-layout 容器**临时**把 layoutMode 置 NONE、插好再恢复:插入本身不再是布局
 * 操作,从而绕过 P8 那条会崩的布局重算路径;恢复后引擎按新的 children 顺序重排,
 * index 因此在 auto-layout 容器上也能生效(此前只能报错)。
 * 恢复时连同布局属性一起还原(见 LAYOUT_PRESERVE_KEYS),异常一律在 finally 里恢复,
 * 不留半残状态。
 */
function insertChildAt(
  parent: ContainerSkeleton,
  index: number,
  node: NodeSkeleton,
): void {
  if (!isAutoLayoutContainer(parent)) {
    parent.insertChild(index, node);
    return;
  }
  const owner = parent as ContainerSkeleton & { layoutMode?: 'NONE' };
  const mode = owner.layoutMode ?? 'NONE';
  const snap = snapshotLayout(parent);
  try {
    owner.layoutMode = 'NONE';
    parent.insertChild(index, node);
  } finally {
    owner.layoutMode = mode;
    restoreLayout(parent, snap);
  }
}

export function findNodes(host: DesignHost, params: FindParams): FindResult {
  const page = host.currentPage;
  let nodes: NodeSkeleton[];

  if (params.ids != null && params.ids.length > 0) {
    nodes = findNode(host, params.ids);
  } else if (params.type != null) {
    nodes = page.findAllWithCriteria({
      types: [params.type as NodeSkeleton['type']],
    });
  } else {
    nodes = page.findAll();
  }
  const name = params.name;
  if (name != null) {
    nodes = nodes.filter((n) => n.name.includes(name));
  }
  return {
    nodes: nodes.slice(0, 100).map((n) => serializeNode(n, params.depth ?? 1)),
    total: nodes.length,
  };
}

export function setSelection(
  host: DesignHost,
  ids: string[],
): { selected: string[] } {
  const nodes = findNode(host, ids);
  if (nodes.length === 0) {
    throw new Error('没有找到要选中的节点');
  }
  host.currentPage.selection = nodes;
  // 参考实现(set_selections)同步滚动视口,让「看一眼选中」时画面切过去
  host.viewport.scrollAndZoomIntoView(nodes);
  return { selected: nodes.map((n) => n.id) };
}

/** 页面结构总览:当前页顶层节点的轻量摘要(serializeNode depth=0,不递归子节点) */
export function getPageStructure(host: DesignHost): PageStructureResult {
  const children = host.currentPage.children ?? [];
  const nodes: PageStructureResult['nodes'] = [];
  // 下标 = 绘制顺序(z):顶层节点没有父级可回查,这里按页面 children 顺序直接给出
  for (const [z, c] of children.entries()) {
    const s = trySerialize(c, 0);
    if (s) {
      nodes.push({
        id: s.id,
        name: s.name,
        type: s.type,
        x: s.x,
        y: s.y,
        z,
        ...(s.width != null ? { width: s.width } : {}),
        ...(s.height != null ? { height: s.height } : {}),
        ...(s.childCount != null ? { childCount: s.childCount } : {}),
      });
    } else {
      // 失效节点最小壳,不整体扑灭页面总览
      nodes.push({
        id: c.id,
        name: c.name,
        type: c.type,
        x: Math.round(c.x) || 0,
        y: Math.round(c.y) || 0,
        z,
      });
    }
  }
  return { pageName: host.currentPage.name, nodes, count: nodes.length };
}

export function removeNodes(
  host: DesignHost,
  params: { ids?: string[]; matchName?: string },
): {
  removed: string[];
} {
  let nodes: NodeSkeleton[];
  if (params.ids != null && params.ids.length > 0) {
    nodes = findNode(host, params.ids);
  } else {
    nodes = [...host.currentPage.selection];
  }
  if (params.matchName != null) {
    nodes = nodes.filter((n) => n.name === params.matchName);
  }
  if (nodes.length === 0) {
    throw new Error('没有要删除的节点');
  }
  const removed = nodes.map((n) => n.id);
  for (const n of nodes) {
    n.remove();
  }
  return { removed };
}

export function cloneNodes(
  host: DesignHost,
  ids: string[],
): { created: SerializedNode[] } {
  const nodes = findNode(host, ids);
  if (nodes.length === 0) {
    throw new Error(
      `没有找到要复制的节点(请求 ids: ${ids.length ? JSON.stringify(ids) : '无'});请先用 jsd_find 确认节点存在且 id 有效`,
    );
  }
  const page = host.currentPage;
  const created: NodeSkeleton[] = [];
  for (const n of nodes) {
    const c = n.clone();
    c.x = n.x + 24;
    c.y = n.y + 24;
    page.appendChild(c);
    created.push(c);
  }
  host.viewport.scrollAndZoomIntoView(created);
  return { created: created.map((n) => serializeNode(n)) };
}

export function groupNodes(
  host: DesignHost,
  params: {
    ids: string[];
    name?: string;
    ungroup?: boolean;
    layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    itemSpacing?: number;
    paddingTop?: number;
    paddingRight?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    primaryAxisSizingMode?: 'FIXED' | 'AUTO';
    counterAxisSizingMode?: 'FIXED' | 'AUTO';
    primaryAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
    counterAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER';
  },
): { created: SerializedNode } | { ungrouped: string[] } {
  if (params.ungroup) {
    const nodes = findNode(host, params.ids);
    const grouped = nodes.filter(
      (n) => n.type === 'GROUP' || n.type === 'FRAME',
    );
    for (const g of grouped) {
      if (g.type === 'FRAME' && 'layoutMode' in g && g.layoutMode !== 'NONE') {
        g.layoutMode = 'NONE';
      } else {
        g.ungroup?.();
      }
    }
    return { ungrouped: grouped.map((n) => n.id) };
  }
  const nodes = findNode(host, params.ids);
  if (nodes.length < 2) {
    throw new Error('分组至少需要 2 个节点');
  }

  // 记录每个节点的绝对原点与绝对包围盒。reparent(appendChild)在 Figma/jsDesign
  // 中不会自动换算坐标——子节点保留旧的相对 x/y,导致绝对位置漂移。这里先快照,
  // 归组后再用 absolutePosition 还原,实现「原地编组」。
  const absInfo = nodes.map((n) => {
    const native = n as NodeSkeleton & {
      absoluteBoundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null;
    };
    // absoluteOrigin 内部已处理 jsDesign「absolutePosition 存在但字段为
    // undefined」的坑并校验有限性,这里直接取页面系原点。
    const pos = absoluteOrigin(n);
    const box = native.absoluteBoundingBox
      ? {
          x: native.absoluteBoundingBox.x,
          y: native.absoluteBoundingBox.y,
          width: native.absoluteBoundingBox.width,
          height: native.absoluteBoundingBox.height,
        }
      : { x: pos.x, y: pos.y, width: n.width, height: n.height };
    return { node: n, pos, box };
  });

  // 包围盒(绝对坐标):组框原点 = 左上角,尺寸 = 包围盒大小。
  // 平台差异:jsDesign 的 absolutePosition / absoluteBoundingBox 可能返回
  // undefined 或非有限值(实测写入 absolutePosition 会触发引擎 set_x 断言)。
  // 这里过滤掉无效项,全部无效时退回「沿父链累加」的相对坐标路径。
  const finite = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v);
  const validBoxes = absInfo.filter((a) => finite(a.box.x) && finite(a.box.y));
  if (validBoxes.length === 0) {
    throw new Error(
      '无法计算节点包围盒(平台未提供有效坐标),已中止分组以免产生错位容器',
    );
  }
  const minX = Math.min(...validBoxes.map((a) => a.box.x));
  const minY = Math.min(...validBoxes.map((a) => a.box.y));
  const maxX = Math.max(
    ...validBoxes.map((a) =>
      finite(a.box.width) ? a.box.x + a.box.width : a.box.x,
    ),
  );
  const maxY = Math.max(
    ...validBoxes.map((a) =>
      finite(a.box.height) ? a.box.y + a.box.height : a.box.y,
    ),
  );
  if (!finite(minX) || !finite(minY) || !finite(maxX) || !finite(maxY)) {
    throw new Error('节点包围盒含非法坐标,已中止分组');
  }

  // 目标父级:优先原地归组到第一个节点的父级(且所有节点同父);否则落到当前页。
  // 旧实现无条件 page.appendChild,把组框挂到页面根,破坏层级与绝对位置。
  const firstParent = nodes[0].parent;
  const sameParent =
    firstParent != null && nodes.every((n) => n.parent === firstParent);
  const parent: ContainerSkeleton =
    sameParent && firstParent ? firstParent : host.currentPage;

  // 建组框:透明(清掉 createFrame 默认白底)、不裁剪,避免遮挡/裁掉溢出子节点
  const frame = host.createFrame();
  frame.name = params.name ?? 'group';
  frame.fills = [];
  frame.clipsContent = false;

  // 插入到第一个被编组节点的原索引处,保持 z-order(原地),而不是追加到末尾
  const parentChildren = (parent as { children?: readonly NodeSkeleton[] })
    .children;
  const firstIndex = parentChildren
    ? parentChildren.findIndex((c) => c.id === nodes[0].id)
    : -1;
  if (firstIndex >= 0) {
    // 走 insertChildAt:目标父级若是 auto-layout 容器,直接 insertChild 会崩(P8),
    // 这里内部临时关掉布局插入再恢复,原索引位与 z-order 都能保住。
    insertChildAt(parent, firstIndex, frame);
  } else {
    parent.appendChild(frame);
  }

  // 定位组框到包围盒原点(绝对坐标)。此时组框已在树中,absolutePosition 可写。
  // 平台差异(Figma 有 / jsDesign 实测会抛 set_x 断言):写 absolutePosition 需
  // 兜底为「相对父级」坐标赋值,不再让引擎断言冒泡成难以理解的 NaN 报错。
  const frameNative = frame as NodeSkeleton & {
    absolutePosition?: { x: number; y: number };
  };
  const parentPos = absoluteOrigin(parent as NodeSkeleton);
  const localX = minX - parentPos.x;
  const localY = minY - parentPos.y;
  let usedAbsolute = false;
  if (frameNative.absolutePosition !== undefined) {
    try {
      frameNative.absolutePosition = { x: minX, y: minY };
      usedAbsolute = true;
    } catch {
      // jsDesign 等平台不支持 absolutePosition 写入,落到相对坐标
    }
  }
  if (!usedAbsolute) {
    frame.x = localX;
    frame.y = localY;
  }

  const useLayout = params.layoutMode != null && params.layoutMode !== 'NONE';

  // reparent 子节点进组框
  for (const a of absInfo) {
    frame.appendChild(a.node);
    if (!useLayout) {
      // 纯归组:还原子节点绝对位置(此时相对组框,setter 按组框原点自动换算)
      const childNative = a.node as NodeSkeleton & {
        absolutePosition?: { x: number; y: number };
      };
      let childUsedAbsolute = false;
      if (childNative.absolutePosition !== undefined) {
        try {
          childNative.absolutePosition = a.pos;
          childUsedAbsolute = true;
        } catch {
          // 不支持 absolutePosition 的平台落到相对坐标
        }
      }
      if (!childUsedAbsolute) {
        a.node.x = a.pos.x - minX;
        a.node.y = a.pos.y - minY;
      }
    }
  }

  if (useLayout) {
    // auto-layout:引擎接管子节点排布与组框尺寸,因此无需手动还原子节点坐标。
    // useLayout 已保证 layoutMode 非空且非 NONE,这里用局部变量承接以收窄类型(免非空断言)
    const layoutMode = params.layoutMode ?? 'NONE';
    frame.layoutMode = layoutMode;
    frame.itemSpacing = params.itemSpacing ?? 0;
    // 默认让组框按内容自适应尺寸(贴合子节点),除非调用方显式要求 FIXED
    frame.primaryAxisSizingMode = params.primaryAxisSizingMode ?? 'AUTO';
    frame.counterAxisSizingMode = params.counterAxisSizingMode ?? 'AUTO';
    if (params.primaryAxisAlignItems != null)
      frame.primaryAxisAlignItems = params.primaryAxisAlignItems;
    if (params.counterAxisAlignItems != null)
      frame.counterAxisAlignItems = params.counterAxisAlignItems;
    if (params.paddingTop != null) frame.paddingTop = params.paddingTop;
    if (params.paddingRight != null) frame.paddingRight = params.paddingRight;
    if (params.paddingBottom != null)
      frame.paddingBottom = params.paddingBottom;
    if (params.paddingLeft != null) frame.paddingLeft = params.paddingLeft;
  } else {
    // 纯归组:组框尺寸贴合包围盒,正好容纳所有子节点。
    // 引擎 resize 校验要求 >= 0.01(实测),同尺寸/单点节点会算出 0,
    // 这里夹到最小值避免 "Expected width to have value >= 0.01" 报错。
    frame.resize(Math.max(maxX - minX, 0.01), Math.max(maxY - minY, 0.01));
  }

  return { created: serializeNode(frame) };
}

export function flattenNodes(
  host: DesignHost,
  ids: string[],
): { created: SerializedNode } {
  const nodes = findNode(host, ids);
  if (nodes.length < 2) {
    throw new Error('flatten 至少需要 2 个节点');
  }
  const vector = host.flatten(nodes, host.currentPage);
  host.viewport.scrollAndZoomIntoView([vector]);
  return { created: serializeNode(vector) };
}

export function outlineStrokeNodes(
  host: DesignHost,
  ids: string[],
): {
  created: SerializedNode[];
} {
  const nodes = findNode(host, ids);
  if (nodes.length === 0) {
    throw new Error('没有找到要转描边的节点');
  }
  const created: NodeSkeleton[] = [];
  for (const n of nodes) {
    const v = n.outlineStroke?.();
    if (v) created.push(v);
  }
  if (created.length === 0) {
    throw new Error('所选节点没有可转换的描边');
  }
  host.viewport.scrollAndZoomIntoView(created);
  return { created: created.map((n) => serializeNode(n)) };
}

/** 解析 index(层序调整)时,候选父级里是否真的能装下这批节点 */
function canReorderInto(
  container: ContainerSkeleton,
  nodes: readonly NodeSkeleton[],
): boolean {
  const children = (container as { children?: readonly NodeSkeleton[] })
    .children;
  if (children == null) return false;
  return nodes.every((n) => children.some((c) => c.id === n.id));
}

export function reparentNodes(
  host: DesignHost,
  params: {
    ids: string[];
    parentId?: string;
    index?: number;
  },
): { moved: SerializedNode[]; updated: SerializedNode[] } {
  const nodes = findNode(host, params.ids);
  if (nodes.length === 0) {
    throw new Error('没有找到要移动的节点');
  }
  const selection = host.currentPage.selection;
  const movingIds = new Set(params.ids);
  // 只给 index 不给 parentId 时的语义歧义(旧实现直接把 selection[0] 当父节点用,
  // 于是「调整层序」变成了「移进当前选中的第一个节点下」):
  // - 若当前选中里含被移动节点本身(调层序的常见情形:选中一个先调它自己的 z),
  //   把第一个**不是被移动节点**的选中项当父节点;一个都没有则说明调用方要的是
  //   「在同级内调整层序」,按原父级解析;
  // - 若选中里不含被移动节点,维持旧语义:selection[0] 即目标父节点。
  const selectionHasTarget = selection.some((s) => movingIds.has(s.id));
  const firstParent = (nodes[0].parent as NodeSkeleton | null) ?? null;
  let parent: NodeSkeleton | PageSkeleton | undefined;
  if (params.parentId != null) {
    parent = findNode(host, [params.parentId])[0];
  } else if (selectionHasTarget) {
    parent =
      selection.find((s) => !movingIds.has(s.id)) ??
      (params.index != null ? (firstParent ?? undefined) : selection[0]);
  } else {
    parent = selection[0];
  }
  // 仍解析不到时再兜一次:index + 全部节点同父 → 按原父级调层序
  if (!parent && params.index != null && firstParent) {
    if (
      nodes.every((n) => n.parent === nodes[0].parent) &&
      canReorderInto(firstParent, nodes)
    ) {
      parent = firstParent;
    }
  }
  if (!parent) {
    const got = params.parentId != null ? `parentId="${params.parentId}"` : '';
    throw new Error(
      `没有找到目标父节点${
        got ? `(${got} 不是有效节点 id,或节点已失效)` : ''
      };传 parentId 指定目标容器,或用 jsd_select_nodes 先选中父容器;只调整层序可传 index 且选中被调整节点本身`,
    );
  }
  const isAutoLayout = isAutoLayoutContainer(parent);
  // 目标父级的绝对原点:reparent 后用它把子节点还原回原绝对位置。
  // 父级本身不移动,故移动前取值即可。
  const parentOrigin = absoluteOrigin(parent as NodeSkeleton);
  const inserted: { node: NodeSkeleton; index: number; target: number }[] = [];
  for (const n of nodes) {
    const alreadyChild = parent.id === n.parent?.id;

    // 已在目标父级下、又没要求位置:确实无需移动
    if (alreadyChild && params.index == null) continue;

    if (alreadyChild) {
      // 同父级 = 只调层序(P11:旧实现在这里直接 continue,
      // 导致「用 reparent 调层序」静默失效)
      reorderChild(host, parent, n, params.index ?? 0);
      continue;
    }

    // 移动前的绝对原点(P17):引擎是否自动换算坐标**不稳定**
    // (实测同父级的一层容器会换算,嵌在 auto-layout 里的深层容器不换算,
    // 后者会让节点保留旧相对 x/y 而飞出画布)。这里自页面系记账,移动后统一还原。
    const origin = absoluteOrigin(n);

    if (params.index != null) {
      // 指定插入位置:insertChildAt 在 auto-layout 父级上临时关布局再插,
      // 不再像旧实现那样把 index 静默丢掉、只往后追加。
      const target = clampIndex(parent, params.index);
      insertChildAt(parent, target, n);
      inserted.push({ node: n, index: parentIndex(parent, n), target });
    } else {
      parent.appendChild(n);
    }

    // 验证父级是否真正改变
    if (n.parent?.id !== parent.id) {
      throw new Error(
        `节点 ${n.id} 移动到 ${parent.id} 失败:父级未变化(仍为 ${n.parent?.id ?? 'undefined'})。可能是目标父级不支持子节点或引擎限制`,
      );
    }

    // 还原绝对位置。auto-layout 父级例外:子节点排布由布局接管,写 x/y 无效
    // 且会被引擎覆盖,交给布局即可。
    if (!isAutoLayout) {
      const x = origin.x - parentOrigin.x;
      const y = origin.y - parentOrigin.y;
      if (Number.isFinite(x)) n.x = x;
      if (Number.isFinite(y)) n.y = y;
    }
  }
  for (const it of inserted) {
    if (it.index !== it.target) {
      throw new Error(
        `节点 ${it.node.id} 插入 ${parent.id} 的位置未生效:期望 children 下标 ${it.target},实际 ${it.index}${
          isAutoLayout
            ? '(auto-layout 容器:次序由布局接管,可改用 itemSpacing / 对齐 控制)'
            : ''
        }`,
      );
    }
  }
  // P23:同一聚合入口(jsd_manage_nodes)下各 op 的返回键互不相同 —— reparent 回
  // moved,而 batch 里最顺手的写法是 {{步骤id.updated[0].id}}。调用方按 updated 写
  // 就报「无法解析占位符引用」,节点其实已经移好了(状态与回显不一致,整批还会被
  // stopOnError 掐断)。这里让两个键同时出现:同一份数组,习惯用哪个都能解析。
  const moved = nodes.map((n) => serializeNode(n));
  return { moved, updated: moved };
}

/** 节点在父级 children 里的实际下标;读不到返回 -1 */
function parentIndex(parent: ContainerSkeleton, node: NodeSkeleton): number {
  return (
    (parent as { children?: readonly NodeSkeleton[] }).children?.findIndex(
      (c) => c.id === node.id,
    ) ?? -1
  );
}

/** 把下标夹到父容器 children 的合法区间 */
function clampIndex(parent: ContainerSkeleton, index: number): number {
  const len =
    (parent as { children?: readonly NodeSkeleton[] }).children?.length ?? 0;
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(len, 0));
}

/**
 * 同父级调层序(P11)。
 *
 * `index` 语义 = 目标在父节点 `children` 数组里的最终下标,
 * 而 `children` 是**绘制顺序**(下标 0 = 最底层,末位 = 最上层)。
 *
 * 两步走:
 * 1. 直接按 index 插(insertChildAt;auto-layout 容器内部临时关布局再恢复,
 *    因此 auto-layout 也走这条路,不再一上来就报错);
 * 2. 若引擎对「已是该父级子级」的节点不重排(实测 jsDesign 为 no-op,
 *    返回成功但顺序不变),兜底走「先移出到当前页 → 再按 index 插回」,
 *    这条路径已验证可行。往返后把 x/y 原样写回,同父级下坐标不变。
 *    auto-layout 容器不适用该兜底(移出即被布局摘掉),此时直接报错点名。
 */
function reorderChild(
  host: DesignHost,
  parent: NodeSkeleton,
  node: NodeSkeleton,
  index: number,
): void {
  const actual = (): number => parentIndex(parent, node);
  const target = (): number => clampIndex(parent, index);

  insertChildAt(parent, index, node);
  if (actual() === target()) return;

  if (isAutoLayoutContainer(parent)) {
    throw new Error(
      `节点 ${node.id} 在 auto-layout 父级 ${parent.id} 下调层序未生效:期望下标 ${target()},实际 ${actual()};auto-layout 容器次序由布局接管,请改 itemSpacing / primaryAxisAlignItems,或先把 layoutMode 设为 NONE`,
    );
  }

  const { x, y } = node;
  host.currentPage.appendChild(node);
  insertChildAt(parent, index, node);
  node.x = x;
  node.y = y;

  if (actual() !== target()) {
    throw new Error(
      `节点 ${node.id} 在父级 ${parent.id} 下调整层序失败:期望下标 ${target()},实际 ${actual()}`,
    );
  }
}

function collectAll(node: NodeSkeleton, out: NodeSkeleton[]): void {
  out.push(node);
  if ('children' in node) {
    for (const c of node.children ?? []) {
      collectAll(c, out);
    }
  }
}

export function repairNodes(host: DesignHost): { cleaned: string[] } {
  const cleaned: string[] = [];
  const todo: NodeSkeleton[] = [];
  for (const child of host.currentPage.children) {
    collectAll(child, todo);
  }
  for (const node of todo) {
    if (trySerialize(node, 0) === null) {
      try {
        node.remove();
        cleaned.push(node.id);
      } catch {
        // 引擎级损坏,跳过
      }
    }
  }
  return { cleaned };
}
