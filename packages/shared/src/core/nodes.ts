import type { FindParams, FindResult, SerializedNode } from '../schemas';
import type { DesignHost, NodeSkeleton } from './host';
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
  return { selected: nodes.map((n) => n.id) };
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
    throw new Error('没有找到要复制的节点');
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
  const page = host.currentPage;
  const frame = host.createFrame();
  frame.name = params.name ?? 'group';
  page.appendChild(frame);
  for (const n of nodes) {
    frame.appendChild(n);
  }
  if (params.layoutMode != null && params.layoutMode !== 'NONE') {
    frame.layoutMode = params.layoutMode;
    frame.itemSpacing = params.itemSpacing ?? 0;
    if (params.primaryAxisSizingMode != null)
      frame.primaryAxisSizingMode = params.primaryAxisSizingMode;
    if (params.counterAxisSizingMode != null)
      frame.counterAxisSizingMode = params.counterAxisSizingMode;
    if (params.primaryAxisAlignItems != null)
      frame.primaryAxisAlignItems = params.primaryAxisAlignItems;
    if (params.counterAxisAlignItems != null)
      frame.counterAxisAlignItems = params.counterAxisAlignItems;
    if (params.paddingTop != null) frame.paddingTop = params.paddingTop;
    if (params.paddingRight != null) frame.paddingRight = params.paddingRight;
    if (params.paddingBottom != null)
      frame.paddingBottom = params.paddingBottom;
    if (params.paddingLeft != null) frame.paddingLeft = params.paddingLeft;
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
  for (const n of nodes) {
    if (params.index != null) parent.insertChild(params.index, n);
    else parent.appendChild(n);
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
