import { describe, expect, it } from 'vitest';
import {
  classifyInstanceProps,
  describeVariant,
  mergeVariantRequest,
  pickVariantComponent,
} from './variant-swap';

/**
 * MasterGo 变体写入的回归守卫(0018)。
 *
 * 依据是真机实测:MG 的 `setProperties` 与 `setVariantPropertyValues` 对变体值
 * **静默无效**,`componentProperties[].id` 运行时也不存在 —— 唯一有效路径是
 * 「换成同一 COMPONENT_SET 里目标值的成分」,所以这几条纯函数是写路径的核心判据。
 */
describe('classifyInstanceProps', () => {
  it('按类型分:VARIANT 走换绑,TEXT/BOOLEAN 走组件属性(值同为字符串也不串台)', () => {
    expect(
      classifyInstanceProps(
        { 属性: '备选', 文案: '你好', 显示图标: false },
        { types: { 属性: 'VARIANT', 文案: 'TEXT', 显示图标: 'BOOLEAN' } },
      ),
    ).toEqual({
      variant: { 属性: '备选' },
      rest: { 文案: '你好', 显示图标: false },
      wrongType: [],
      unknown: [],
    });
  });

  it('只有「在当前变体属性名里」才算变体;认不出的名字进 unknown(不再按值类型兜底)', () => {
    expect(
      classifyInstanceProps(
        { 属性: '备选', 瞎写的: 'x', 也是瞎写: false },
        { variantKeys: ['属性'] },
      ),
    ).toEqual({
      variant: { 属性: '备选' },
      rest: {},
      wrongType: [],
      unknown: ['瞎写的', '也是瞎写'],
    });
  });

  it('声明了类型但不在变体名里 → 组件属性(裸布尔就是 setProperties 的入参)', () => {
    expect(
      classifyInstanceProps(
        { 显示图标: true },
        { types: { 显示图标: 'BOOLEAN' } },
      ),
    ).toEqual({
      variant: {},
      rest: { 显示图标: true },
      wrongType: [],
      unknown: [],
    });
  });

  it('归到变体但值不是字符串 → 进 wrongType(交给门面报错,不静默丢)', () => {
    expect(
      classifyInstanceProps({ 属性: false }, { variantKeys: ['属性'] })
        .wrongType,
    ).toEqual(['属性']);
  });
});

describe('mergeVariantRequest', () => {
  it('只传要改的属性时其余保持现值(部分更新语义)', () => {
    expect(
      mergeVariantRequest({ 尺寸: 'a1', 状态: '禁用' }, { 状态: '默认' }),
    ).toEqual({
      尺寸: 'a1',
      状态: '默认',
    });
  });

  it('没有现值时按请求构造(全量指定)', () => {
    expect(mergeVariantRequest(undefined, { 状态: '禁用' })).toEqual({
      状态: '禁用',
    });
  });
});

describe('pickVariantComponent', () => {
  const candidates = [
    { id: '1:1', variantProperties: { 尺寸: 'a1', 状态: '默认' } },
    { id: '1:2', variantProperties: { 尺寸: 'a1', 状态: '禁用' } },
    { id: '1:3', variantProperties: { 尺寸: 'a2', 状态: '默认' } },
  ];

  it('全等匹配(不是包含):多维度下落点唯一', () => {
    expect(
      pickVariantComponent({ 尺寸: 'a1', 状态: '禁用' }, candidates).matched
        ?.id,
    ).toBe('1:2');
  });

  it('匹配不到时 matched 为 null 且回可用组合(报错要用,不许静默)', () => {
    const r = pickVariantComponent({ 尺寸: 'a9' }, candidates);
    expect(r.matched).toBeNull();
    expect(r.available).toEqual([
      '尺寸=a1, 状态=默认',
      '尺寸=a1, 状态=禁用',
      '尺寸=a2, 状态=默认',
    ]);
  });

  it('成分读不到变体值时不会被误配', () => {
    const r = pickVariantComponent({ 尺寸: 'a1' }, [{ id: '1:9' }]);
    expect(r.matched).toBeNull();
    expect(r.available).toEqual(['']);
  });
});

describe('describeVariant', () => {
  it('渲染成可读的组合串', () => {
    expect(describeVariant({ 属性: '备选', 尺寸: 'a1' })).toBe(
      '属性=备选, 尺寸=a1',
    );
    expect(describeVariant({})).toBe('');
  });
});
