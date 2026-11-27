import { describe, expect, it } from 'vitest';
import {
  createSvgNode,
  type DesignHost,
  executeOps,
  getPageStructure,
  type NodeSkeleton,
  runtimeContext,
} from '../core';
import { rectangleNodeSchema, textNodeSchema } from '../schemas';

describe('error_reports 2026-11-27 regressions', () => {
  it('createSvgNode throws clear error when engine returns null', async () => {
    const host = {
      createNodeFromSvg: () => null as unknown as NodeSkeleton,
    } as unknown as DesignHost;

    await expect(
      createSvgNode(host, '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    ).rejects.toThrow('SVG 解析失败(引擎返回空节点)');
  });

  it('rectangleNodeSchema and textNodeSchema accept layoutGrow and layoutAlign', () => {
    const rect = rectangleNodeSchema.parse({
      type: 'RECTANGLE',
      name: 'bar',
      width: 100,
      height: 20,
      layoutGrow: 1,
      layoutAlign: 'STRETCH',
    });
    expect(rect.layoutGrow).toBe(1);
    expect(rect.layoutAlign).toBe('STRETCH');

    const text = textNodeSchema.parse({
      type: 'TEXT',
      characters: 'hi',
      layoutGrow: 1,
      layoutAlign: 'INHERIT',
    });
    expect(text.layoutGrow).toBe(1);
    expect(text.layoutAlign).toBe('INHERIT');
  });

  it('getPageStructure skips stale node in findAllWithCriteria', async () => {
    const stale = new Proxy({} as NodeSkeleton, {
      get() {
        throw new Error(
          'in get_name: The node with id "76:2688" does not exist',
        );
      },
    });
    const validComp = {
      id: '1:2',
      name: 'Btn',
      type: 'COMPONENT',
    } as NodeSkeleton;
    const page = {
      id: '0:1',
      name: 'Page 1',
      type: 'PAGE',
      children: [],
      findAllWithCriteria: () => [stale, validComp],
    };
    const host = {
      currentPage: page,
      root: { children: [page] },
    } as unknown as DesignHost;

    const res = await getPageStructure(host, runtimeContext([], 'jsdesign'));
    expect(res.assets?.components).toEqual([{ id: '1:2', name: 'Btn' }]);
  });

  it('executeOps writes layoutGrow/layoutAlign after parent.appendChild', async () => {
    const events: string[] = [];
    const rect: Record<string, unknown> = {
      id: '1:1',
      name: '',
      type: 'RECTANGLE',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      visible: true,
      opacity: 1,
      locked: false,
      rotation: 0,
      resize(w: number, h: number) {
        rect.width = w;
        rect.height = h;
      },
      remove() {},
    };
    let growVal = 0;
    let alignVal = 'INHERIT';
    Object.defineProperties(rect, {
      layoutGrow: {
        get: () => growVal,
        set: (v: number) => {
          events.push('set_layoutGrow');
          growVal = v;
        },
        enumerable: true,
      },
      layoutAlign: {
        get: () => alignVal,
        set: (v: string) => {
          events.push('set_layoutAlign');
          alignVal = v;
        },
        enumerable: true,
      },
    });
    const page = {
      id: '19:1',
      name: 'Page',
      type: 'PAGE',
      children: [] as NodeSkeleton[],
      appendChild(n: NodeSkeleton) {
        events.push('appendChild');
        page.children.push(n);
      },
    };
    const host = {
      currentPage: page,
      viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView() {} },
      createRectangle: () => rect as unknown as NodeSkeleton,
    } as unknown as DesignHost;

    await executeOps(host, runtimeContext([], 'jsdesign'), {
      type: 'RECTANGLE',
      name: 'r',
      width: 120,
      height: 40,
      layoutGrow: 1,
      layoutAlign: 'STRETCH',
    });
    expect(events.indexOf('appendChild')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('set_layoutGrow')).toBeGreaterThan(
      events.indexOf('appendChild'),
    );
    expect(events.indexOf('set_layoutAlign')).toBeGreaterThan(
      events.indexOf('appendChild'),
    );
  });
});
