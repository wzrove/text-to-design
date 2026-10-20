import { describe, expect, it } from 'vitest';
import type { NodeSkeleton } from '../core/host';
import { serializeNode } from '../core/serialize';
import {
  normalizeVariantGroupProperties,
  normalizeVariantProperties,
  resolveVariantWriteKey,
} from '../core/variant';
import { makeInstance } from './fixtures';

/**
 * 变体表的**实际运行期形状**(真机 2026-10-20,即时设计)—— typings 说是字符串,
 * 运行时给的是 `{name}` 对象;且集合维度键与成员键**可能不是同一套**。
 *
 * 这两条一旦不归一,后果不是「少个字段」而是**整条只读调用失败**
 * (`jsd_find` / `get_page` 撞穿输出校验),或写入键打不中(回包成功、画布不动)。
 * 故这里是行为基线,不是实现细节。
 */
describe('变体维度表:values 元素归一(typings 说 string[],运行时给对象)', () => {
  it('字符串原样、{name} 取 name、其余字符串化', () => {
    expect(
      normalizeVariantGroupProperties({
        状态: { values: ['ccc'] },
        分类: { values: [{ name: '默认' }, { name: '禁用' }] },
      }),
    ).toEqual({ 状态: ['ccc'], 分类: ['默认', '禁用'] });
  });

  it('读不到(undefined)→ undefined(键缺席),不是空对象', () => {
    expect(normalizeVariantGroupProperties(undefined)).toBeUndefined();
  });

  it('engine getter 抛也不掀翻序列化:该字段省略,其余照常', () => {
    const set = {
      id: '1:1',
      name: 'set',
      type: 'COMPONENT_SET',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    } as unknown as NodeSkeleton;
    Object.defineProperty(set, 'variantGroupProperties', {
      get: () => {
        throw new Error('Component set for node has existing errors');
      },
      configurable: true,
    });
    const out = serializeNode(set);
    expect(out.id).toBe('1:1');
    expect(out.variantGroupProperties).toBeUndefined();
  });

  it('序列化把对象取值投影成字符串数组(不再撞穿输出校验)', () => {
    const set = {
      id: '1:2',
      name: 'set',
      type: 'COMPONENT_SET',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      variantGroupProperties: { 状态: { values: [{ name: '默认' }] } },
    } as unknown as NodeSkeleton;
    expect(serializeNode(set).variantGroupProperties).toEqual({
      状态: ['默认'],
    });
  });

  it('单节点 variantProperties 同样归一(与集合表共用口径)', () => {
    expect(normalizeVariantProperties({ 分类1: '默认', X: { name: 'Y' } })).toEqual(
      { 分类1: '默认', X: 'Y' },
    );
    expect(normalizeVariantProperties({})).toBeUndefined();
    const inst = makeInstance('5:1', 'inst');
    (inst as unknown as Record<string, unknown>).variantProperties = {
      分类1: { name: '默认' },
    };
    expect(serializeNode(inst).variantProperties).toEqual({ 分类1: '默认' });
  });
});

describe('变体写入键:集合维度键按取值映射到成员键', () => {
  const member = { 分类1: '默认' };
  const dims = { 状态: ['默认', '禁用'] };

  it('成员键直接命中 → 原样(不改写)', () => {
    expect(resolveVariantWriteKey('分类1', '默认', member, dims)).toEqual({
      key: '分类1',
    });
  });

  it('集合维度键 + 唯一取值匹配 → 改写成成员键并回传原名', () => {
    expect(resolveVariantWriteKey('状态', '默认', member, dims)).toEqual({
      key: '分类1',
      rewrittenFrom: '状态',
    });
  });

  it('取值对不上任何成员 → 报错并列出成员现状(不猜)', () => {
    const r = resolveVariantWriteKey('状态', '不存在的值', member, dims);
    expect(r != null && 'error' in r).toBe(true);
    expect(r != null && 'error' in r ? r.error : '').toContain('分类1=默认');
  });

  it('歧义(同一取值命中多个成员键)→ 报错列出候选', () => {
    const r = resolveVariantWriteKey('状态', 'A', { a: 'A', b: 'A' }, dims);
    expect(r != null && 'error' in r ? r.error : '').toContain('a');
  });

  it('两边都没有该键 → null(交给组件属性分支/后续点名)', () => {
    expect(resolveVariantWriteKey('Foo', 'x', member, dims)).toBeNull();
  });
});
