import { describe, expect, it } from 'vitest';
import { executeOps } from '../core/execute';
import type { NodeSkeleton } from '../core/host';
import { runtimeContext } from '../core/runtime';
import { makeHost } from './fixtures';

/**
 * sizingMode 推断的口径:**高度优先自动高度,只有最外层节点容器钉死**。
 *
 * 现场(2026-10-20):整屏每个分区都写死高度(比如 162 / 65 / 188),812 高度一算就溢出,
 * 中文换行或内容增删还会直接裁切。高度本该由内容决定。
 * 但屏根例外 —— 它承载画板尺寸,按内容 hug 会塌成内容高度。
 */
const ctx = runtimeContext(null);

function created(host: ReturnType<typeof makeHost>, id: string): NodeSkeleton {
  const n = host.registry.get(id);
  if (n == null) throw new Error(`节点 ${id} 没建出来`);
  return n;
}

describe('sizingMode 推断:高度优先自动高度', () => {
  it('最外层节点容器:两轴都钉 FIXED(画板尺寸不能塌)', async () => {
    const host = makeHost();
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: '屏',
        width: 375,
        height: 812,
        layoutMode: 'VERTICAL',
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const n = created(host, r.created[0].id);
    expect(n.width).toBe(375);
    expect(n.height).toBe(812);
    expect(n.primaryAxisSizingMode).toBe('FIXED');
    expect(n.counterAxisSizingMode).toBe('FIXED');
  });

  it('内层纵向容器:高度轴推断成 AUTO(内容增删不裁切)', async () => {
    const host = makeHost();
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: '屏',
        width: 375,
        height: 812,
        layoutMode: 'VERTICAL',
        children: [
          {
            type: 'FRAME',
            name: '卡片',
            width: 343,
            height: 120,
            layoutMode: 'VERTICAL',
            children: [
              { type: 'RECTANGLE', name: '块', width: 100, height: 40 },
            ],
          },
        ],
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const screen = created(host, r.created[0].id);
    const card = (screen as unknown as { children: NodeSkeleton[] })
      .children[0];
    // VERTICAL:主轴=高、交叉轴=宽
    expect(card.primaryAxisSizingMode).toBe('AUTO');
    expect(card.counterAxisSizingMode).toBe('FIXED');
  });

  it('内层横向容器:宽度轴仍 FIXED(行要撑满父宽),高度轴 AUTO', async () => {
    const host = makeHost();
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: '屏',
        width: 375,
        height: 812,
        layoutMode: 'VERTICAL',
        children: [
          {
            type: 'FRAME',
            name: '行',
            width: 343,
            height: 44,
            layoutMode: 'HORIZONTAL',
          },
        ],
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const screen = created(host, r.created[0].id);
    const row = (screen as unknown as { children: NodeSkeleton[] }).children[0];
    // HORIZONTAL:主轴=宽、交叉轴=高
    expect(row.primaryAxisSizingMode).toBe('FIXED');
    expect(row.counterAxisSizingMode).toBe('AUTO');
  });

  it('显式声明的 sizingMode 不被推断抢走', async () => {
    const host = makeHost();
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: '屏',
        width: 375,
        height: 812,
        layoutMode: 'VERTICAL',
        children: [
          {
            type: 'FRAME',
            name: '固定高卡片',
            width: 343,
            height: 120,
            layoutMode: 'VERTICAL',
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
          },
        ],
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const screen = created(host, r.created[0].id);
    const card = (screen as unknown as { children: NodeSkeleton[] })
      .children[0];
    expect(card.primaryAxisSizingMode).toBe('FIXED');
    expect(card.height).toBe(120);
  });

  it('自动高度被撑开时点名(说清是意图,并给出固定出口)', async () => {
    const host = makeHost();
    // 复刻引擎 hug:开布局那一刻高度按内容重算
    const realCreate = host.createFrame;
    host.createFrame = () => {
      const f = realCreate();
      let mode = 'NONE';
      Object.defineProperty(f, 'layoutMode', {
        get: () => mode,
        set: (v: string) => {
          mode = v;
          if (v !== 'NONE') (f as unknown as { height: number }).height = 40;
        },
        configurable: true,
      });
      return f;
    };
    const r = await executeOps(
      host,
      ctx,
      {
        type: 'FRAME',
        name: '屏',
        width: 375,
        height: 812,
        layoutMode: 'VERTICAL',
        children: [
          {
            type: 'FRAME',
            name: '卡片',
            width: 343,
            height: 120,
            layoutMode: 'VERTICAL',
            children: [
              { type: 'RECTANGLE', name: '块', width: 100, height: 40 },
            ],
          },
        ],
      },
      { mode: 'absolute', x: 0, y: 0 },
    );
    const warn = r.warnings?.join('') ?? '';
    expect(warn).toContain('高度默认自动');
    expect(warn).toContain('jsd_resize_node');
  });
});
