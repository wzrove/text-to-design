import { describe, expect, it, vi } from 'vitest';
import {
  type DesignHost,
  executeOps,
  type NodeSkeleton,
  type PageSkeleton,
  runtimeContext,
  setSelection,
  updateSelection,
} from '../core';

function makeNode(
  id: string,
  type: NodeSkeleton['type'],
  extra: Partial<NodeSkeleton> = {},
): NodeSkeleton {
  const children: NodeSkeleton[] = [];
  const node: Record<string, unknown> = {
    id,
    name: id,
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    opacity: 1,
    locked: false,
    rotation: 0,
    parent: null,
    children,
    remove() {
      const p = node.parent as { children?: NodeSkeleton[] } | null;
      if (p?.children) {
        const idx = p.children.indexOf(node as unknown as NodeSkeleton);
        if (idx >= 0) p.children.splice(idx, 1);
      }
      node.parent = null;
    },
    appendChild(child: NodeSkeleton) {
      const prev = child.parent as { children?: NodeSkeleton[] } | null;
      if (prev?.children) {
        const idx = prev.children.indexOf(child);
        if (idx >= 0) prev.children.splice(idx, 1);
      }
      (child as { parent: unknown }).parent = node;
      children.push(child);
    },
    insertChild(index: number, child: NodeSkeleton) {
      (child as { parent: unknown }).parent = node;
      children.splice(index, 0, child);
    },
    resize(w: number, h: number) {
      node.width = w;
      node.height = h;
    },
    ...extra,
  };
  return node as unknown as NodeSkeleton;
}

function makePage(id: string, name: string): PageSkeleton {
  const children: NodeSkeleton[] = [];
  const page: Record<string, unknown> = {
    id,
    name,
    type: 'PAGE',
    selection: [],
    children,
    appendChild(child: NodeSkeleton) {
      const prev = child.parent as { children?: NodeSkeleton[] } | null;
      if (prev?.children) {
        const idx = prev.children.indexOf(child);
        if (idx >= 0) prev.children.splice(idx, 1);
      }
      (child as { parent: unknown }).parent = page;
      children.push(child);
    },
    insertChild(index: number, child: NodeSkeleton) {
      (child as { parent: unknown }).parent = page;
      children.splice(index, 0, child);
    },
    findOne: () => null,
    findAll: () => [],
    findAllWithCriteria: () => [],
  };
  return page as unknown as PageSkeleton;
}

function makeHost(
  page: PageSkeleton,
  nodesById: Map<string, NodeSkeleton>,
  extra: Partial<DesignHost> = {},
): DesignHost {
  let seq = 0;
  const create = (type: NodeSkeleton['type']) => {
    const n = makeNode(`n${++seq}`, type);
    page.appendChild(n);
    nodesById.set(n.id, n);
    return n;
  };
  return {
    currentPage: page,
    root: { children: [page] },
    viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView: vi.fn() },
    getNodeById: (id: string) => nodesById.get(id) ?? null,
    createFrame: () => create('FRAME'),
    createRectangle: () => create('RECTANGLE'),
    createEllipse: () => create('ELLIPSE'),
    createText: () => create('TEXT'),
    createLine: () => create('LINE'),
    createPolygon: () => create('POLYGON'),
    createStar: () => create('STAR'),
    createVector: () => create('VECTOR'),
    createComponent: () => create('COMPONENT'),
    loadFontAsync: async () => {},
    ...extra,
  } as unknown as DesignHost;
}

describe('error_reports 2026-11-26 回归', () => {
  it('setSelection 拦截跨页节点并给出可读提示,混合时跳过异页节点并附 warnings', async () => {
    const page1 = makePage('p1', 'Page 1');
    const page2 = makePage('p2', 'Page 2');
    const onP1 = makeNode('1:1', 'FRAME');
    const onP2 = makeNode('2:1', 'FRAME');
    page1.appendChild(onP1);
    page2.appendChild(onP2);
    const map = new Map([
      [onP1.id, onP1],
      [onP2.id, onP2],
    ]);
    const host = makeHost(page1, map);
    const ctx = runtimeContext(['nodeResolveSync'], 'jsdesign');

    await expect(setSelection(host, ctx, ['2:1'])).rejects.toThrow(
      /不在当前页「Page 1」中/,
    );

    const mixed = await setSelection(host, ctx, ['1:1', '2:1']);
    expect(mixed.selected).toEqual(['1:1']);
    expect(mixed.warnings?.[0]).toContain('2:1');
    expect(page1.selection.map((n) => n.id)).toEqual(['1:1']);
  });

  it('updateSelection(set_layout) 跳过同值 layoutMode 并在引擎抛错时附带节点与实例上下文', async () => {
    const page = makePage('p1', 'Page 1');
    const inst = makeNode('i1', 'INSTANCE');
    const setter = vi.fn(() => {
      throw new Error(
        "in set_layoutMode: Cannot read properties of undefined (reading 'MIN')",
      );
    });
    const inner = makeNode('f1', 'FRAME');
    let mode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' = 'NONE';
    Object.defineProperty(inner, 'layoutMode', {
      get: () => mode,
      set: (v: 'NONE' | 'HORIZONTAL' | 'VERTICAL') => {
        setter();
        mode = v;
      },
      enumerable: true,
      configurable: true,
    });
    page.appendChild(inst);
    inst.appendChild(inner);
    const host = makeHost(page, new Map([[inner.id, inner]]));
    const ctx = runtimeContext(['nodeResolveSync'], 'jsdesign');

    // 同值 NONE 跳过冗余 setter,不触发引擎崩溃
    await updateSelection(
      host,
      ctx,
      { ids: ['f1'], props: { layoutMode: 'NONE' } },
      'set_layout',
    );
    expect(setter).not.toHaveBeenCalled();

    // 异值抛错时附带节点信息与 INSTANCE 提示
    await expect(
      updateSelection(
        host,
        ctx,
        { ids: ['f1'], props: { layoutMode: 'VERTICAL' } },
        'set_layout',
      ),
    ).rejects.toThrow(/INSTANCE/);
  });

  it('executeOps 回滚只删除本次调用自建节点,不误删并发调用的在途节点', async () => {
    const page = makePage('p1', 'Page 1');
    const map = new Map<string, NodeSkeleton>();
    let releaseFont!: () => void;
    const fontGate = new Promise<void>((r) => {
      releaseFont = r;
    });
    const host = makeHost(page, map, {
      loadFontAsync: () => fontGate,
    });
    const ctx = runtimeContext(['nodeResolveSync'], 'jsdesign');

    const callA = executeOps(host, ctx, {
      type: 'FRAME',
      name: 'A',
      width: 100,
      height: 100,
      children: [
        {
          type: 'TEXT',
          name: 't',
          characters: 'hi',
          fontName: { family: 'F', style: 'R' },
        },
      ],
    });
    // 等 callA 挂起在 loadFontAsync
    await Promise.resolve();

    const callB = executeOps(host, ctx, {
      type: 'FRAME',
      name: 'B',
      width: 0,
      height: 100,
    });
    await expect(callB).rejects.toThrow(/最小为/);

    releaseFont();
    const resA = await callA;
    expect(resA.created).toHaveLength(1);
    expect(page.children.map((c) => c.name)).toEqual(['A']);
  });

  it('buildNode GROUP 不重复创建子节点', async () => {
    const page = makePage('p1', 'Page 1');
    const host = makeHost(page, new Map());
    const ctx = runtimeContext(['nodeResolveSync'], 'jsdesign');
    const res = await executeOps(host, ctx, {
      type: 'GROUP',
      name: 'G',
      children: [
        { type: 'RECTANGLE', name: 'r1', width: 10, height: 10 },
        { type: 'RECTANGLE', name: 'r2', width: 10, height: 10 },
      ],
    });
    expect(res.created[0].children).toHaveLength(2);
  });
});
