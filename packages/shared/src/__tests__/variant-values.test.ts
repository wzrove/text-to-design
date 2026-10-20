import { describe, expect, it } from 'vitest';
import { listDocumentAssets } from '../core/assets';
import type { DesignHost, NodeSkeleton } from '../core/host';
import { runtimeContext } from '../core/runtime';
import { makeHost } from './fixtures';

/**
 * 真机 2026-10-20(即时设计):同一个 `variantGroupProperties.values` 元素**不保证是字符串** ——
 * 单成员集合回 `["ccc"]`,两成员集合回 `[{"name":"默认"},{"name":"禁用"}]`。
 * 后者直接撞穿 `assets.variants[].properties` 的 `string[]` 校验,让 `get_page` 整条失败。
 * 这里锁「投影归一」:字符串原样、对象取 name。
 */
function hostWithSet(values: unknown[]): DesignHost {
  const set = {
    id: '1:1',
    name: '画板 1',
    type: 'COMPONENT_SET',
    variantGroupProperties: { 状态: { values } },
    children: [],
  } as unknown as NodeSkeleton;
  // makeHost 会把传入节点同时登记进 registry 与 currentPage.children(自己拼 page 会丢遍历)
  return makeHost([set]) as unknown as DesignHost;
}

describe('变体维度投影:值对象归一为名字', () => {
  it('字符串值原样', async () => {
    const r = await listDocumentAssets(hostWithSet(['ccc']), runtimeContext(['styleEnumeration', 'variables']));
    expect(r.assets.variants?.[0]?.properties).toEqual({ 状态: ['ccc'] });
  });

  it('{name} 对象值取 name(真机形状)', async () => {
    const r = await listDocumentAssets(
      hostWithSet([{ name: '默认' }, { name: '禁用' }]),
      runtimeContext(['styleEnumeration', 'variables']),
    );
    expect(r.assets.variants?.[0]?.properties).toEqual({ 状态: ['默认', '禁用'] });
  });
});
