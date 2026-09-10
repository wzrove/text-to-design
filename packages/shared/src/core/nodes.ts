import type {
  FindParams,
  FindResult,
  PageStructureResult,
  SerializedNode,
} from '../schemas';
import type { ContainerSkeleton, DesignHost, NodeSkeleton } from './host';
import { serializeNode, trySerialize } from './serialize';
import { findNode } from './utils';

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
  for (const c of children) {
    const s = trySerialize(c, 0);
    if (s) {
      nodes.push({
        id: s.id,
        name: s.name,
        type: s.type,
        x: s.x,
        y: s.y,
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
      absolutePosition?: { x: number; y: number };
      absoluteBoundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null;
    };
    // 兜底:原生属性缺失时沿父链累加 x/y(忽略旋转,仅覆盖无旋转常见场景)
    const fallbackPos = (): { x: number; y: number } => {
      let x = n.x;
      let y = n.y;
      let p = n.parent;
      let guard = 0;
      while (p && guard < 64) {
        x += p.x;
        y += p.y;
        p = (p as NodeSkeleton).parent ?? null;
        guard += 1;
      }
      return { x, y };
    };
    const pos = native.absolutePosition
      ? { x: native.absolutePosition.x, y: native.absolutePosition.y }
      : fallbackPos();
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
    parent.insertChild(firstIndex, frame);
  } else {
    parent.appendChild(frame);
  }

  // 定位组框到包围盒原点(绝对坐标)。此时组框已在树中,absolutePosition 可写。
  // 平台差异(Figma 有 / jsDesign 实测会抛 set_x 断言):写 absolutePosition 需
  // 兜底为「相对父级」坐标赋值,不再让引擎断言冒泡成难以理解的 NaN 报错。
  const frameNative = frame as NodeSkeleton & {
    absolutePosition?: { x: number; y: number };
  };
  const parentNative = parent as NodeSkeleton;
  const parentPos =
    parentNative.absolutePosition != null &&
    finite(parentNative.absolutePosition.x) &&
    finite(parentNative.absolutePosition.y)
      ? parentNative.absolutePosition
      : { x: 0, y: 0 };
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
    frame.layoutMode = params.layoutMode!;
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

export function reparentNodes(
  host: DesignHost,
  params: {
    ids: string[];
    parentId?: string;
    index?: number;
  },
): { moved: SerializedNode[] } {
  const nodes = findNode(host, params.ids);
  if (nodes.length === 0) {
    throw new Error('没有找到要移动的节点');
  }
  const parent =
    params.parentId != null
      ? findNode(host, [params.parentId])[0]
      : host.currentPage.selection[0];
  if (!parent) {
    throw new Error('没有找到目标父节点');
  }
  const isAutoLayout =
    'layoutMode' in parent &&
    (parent as NodeSkeleton).layoutMode != null &&
    (parent as NodeSkeleton).layoutMode !== 'NONE';
  for (const n of nodes) {
    // 如果节点已经在目标父级下,跳过
    if (parent.id === n.parent?.id) continue;

    // auto-layout 父容器:insertChild 会走引擎的布局重算路径读取子节点
    // layoutGrow,而插件侧节点代理在 jsDesign 上该读取会崩
    // (实测 "get_layoutGrow: Cannot read properties of undefined (reading 'jsGet')")。
    // 改用 appendChild 追加,规避该路径;非 auto-layout 仍走 insertChild 以支持 index。
    if (params.index != null && !isAutoLayout) {
      parent.insertChild(params.index, n);
    } else {
      parent.appendChild(n);
    }

    // 验证父级是否真正改变
    if (n.parent?.id !== parent.id) {
      throw new Error(
        `节点 ${n.id} 移动到 ${parent.id} 失败:父级未变化(仍为 ${n.parent?.id ?? 'undefined'})。可能是目标父级不支持子节点或引擎限制`,
      );
    }
  }
  return { moved: nodes.map((n) => serializeNode(n)) };
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
