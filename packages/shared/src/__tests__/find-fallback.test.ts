import { describe, expect, it } from 'vitest';
import { findNodes } from '../core/nodes';
import { type FakeHost, makeFrame, makeHost, makeRect } from './fixtures';

/**
 * 收集阶段的兜底。序列化阶段早已逐节点保护(坏节点降级成最小摘要),但**收集**
 * 阶段没有:引擎的 findAll 会因文档里任何一个坏节点整体抛,整页一个节点都拿不到
 * —— 连「查出来再删掉它」这条路都断了。
 */
describe('findNodes 收集阶段', () => {
  it('findAll 整体抛 → 退化成自己走 children,结果不空', async () => {
    const parent = makeFrame('1:1');
    const child = makeRect('1:2');
    parent.appendChild?.(child);
    const host: FakeHost = makeHost([parent]);
    host.currentPage.findAll = () => {
      throw new Error('in findAll: The node with id "1:9" does not exist');
    };
    const r = await findNodes(host, {});
    expect(r.total).toBe(2);
    expect(r.nodes.map((n) => n.id)).toEqual(['1:1', '1:2']);
  });

  it('children getter 抛的节点只丢它自己的子树', async () => {
    const good = makeRect('1:1');
    const bad = makeRect('1:2');
    Object.defineProperty(bad, 'children', {
      get() {
        throw new Error('boom');
      },
    });
    const host: FakeHost = makeHost([good, bad]);
    host.currentPage.findAll = () => {
      throw new Error('nope');
    };
    const r = await findNodes(host, {});
    expect(r.total, '两个顶层节点都该在,坏节点只丢它的子树').toBe(2);
  });
});
