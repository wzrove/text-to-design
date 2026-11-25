import { describe, expect, it } from 'vitest';
import type { NodeSkeleton } from '../core/host';
import { runtimeContext } from '../core/runtime';
import { updateSelection } from '../core/update';
import { makeHost, makeRect } from './fixtures';

/**
 * 线上错误组 `jsd_rename_node / jsd_resize_node / jsd_set_stroke / jsd_set_fill_color /
 * jsd_group_nodes / jsd_clone_node {code:engine_error}`:
 * `in get_strokeCap: Value is not a string` 与 `in get_effects: 阴影存在脏数据`。
 *
 * 脏字段与本次改动无关(改名不读效果),序列化是写操作的回读出口 —— 一个读即抛的
 * 摘要字段必须被省略,而不是把整条调用打成失败。
 */

const CTX = runtimeContext([]);

function dirtyNode(
  key: 'strokeCap' | 'effects',
  message: string,
): NodeSkeleton {
  const node = makeRect('1:1', '原名');
  Object.defineProperty(node, key, {
    get: () => {
      throw new Error(message);
    },
    configurable: true,
  });
  return node;
}

describe('脏属性不连坐无关操作', () => {
  it('strokeCap 读即抛:改名照常完成,该字段省略', async () => {
    const node = dirtyNode(
      'strokeCap',
      'in get_strokeCap: Value is not a string',
    );
    const host = makeHost([node]);

    const result = await updateSelection(host, CTX, {
      ids: ['1:1'],
      props: { name: '新名字' },
    });

    expect(result.updated[0].name).toBe('新名字');
    expect(result.updated[0].strokeCap).toBeUndefined();
  });

  it('effects 读即抛:设填充照常完成,阴影字段省略', async () => {
    const node = dirtyNode('effects', 'in get_effects: 阴影存在脏数据');
    const host = makeHost([node]);

    const result = await updateSelection(host, CTX, {
      ids: ['1:1'],
      props: { fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }] },
    });

    expect(node.fills?.[0]).toMatchObject({ type: 'SOLID' });
    expect(result.updated[0].fills?.[0]).toMatchObject({ type: 'SOLID' });
    expect(result.updated[0].effects).toBeUndefined();
  });
});
