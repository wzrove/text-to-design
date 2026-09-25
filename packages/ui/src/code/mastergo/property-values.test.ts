import { describe, expect, it } from 'vitest';
import {
  readComponentProperties,
  readComponentPropertyValues,
  readVariantProperties,
  remapPropertyIds,
  unwrapPropertyValues,
} from './property-values';

/**
 * 组件/变体属性投影的回归守卫(0017 真机联调 + typings 复核)。
 *
 * 依据都是 `@mastergo/plugin-typings` 的声明:
 * - `variantProperties: Array<VariantProperty>`(2958 / 3092 行)而契约是 `Record<string, string>`;
 * - `componentProperties: Array<ComponentProperties>`(3020 / 3096 行)而契约是
 *   `Record<string, ComponentPropertyValue>`;
 * - `setProperties({[propertyId]: string|boolean})`(3097 行)键是 **id**;
 * - 变体属性必须走 `setVariantPropertyValues`(3057 / 3094 行)——走 `setProperties`
 *   静默无效(真机实测 5 种写法都不生效、也不报错)。
 */
describe('readVariantProperties', () => {
  it('数组 → Record(键原样,属性名是自由文本)', () => {
    expect(
      readVariantProperties([
        { property: '属性 1', value: 'Default' },
        { property: 'size', value: 'a1', alias: '小' },
      ]),
    ).toEqual({ '属性 1': 'Default', size: 'a1' });
  });

  it('空数组 / 非数组 / 项不合格 → undefined(契约里是可选字段,「读不到」要能区分)', () => {
    expect(readVariantProperties([])).toBeUndefined();
    expect(readVariantProperties(undefined)).toBeUndefined();
    expect(
      readVariantProperties([{ property: 'x' }, null, 'y']),
    ).toBeUndefined();
  });
});

describe('readComponentProperties', () => {
  it('数组 → Record,键取 id ?? name,只透传契约认得的字段', () => {
    expect(
      readComponentProperties([
        {
          name: '显示图标',
          id: 'Property 1#1:0',
          type: 'BOOLEAN',
          value: false,
          alias: 'MG 专有',
          isDefaultValue: true,
        },
        { name: '文案', type: 'TEXT', value: '你好' },
        {
          name: '图标',
          type: 'INSTANCE_SWAP',
          value: '1:2',
          preferredValues: [{ type: 'COMPONENT', key: 'k1' }, { bad: true }],
        },
      ]),
    ).toEqual({
      显示图标: { type: 'BOOLEAN', value: false },
      文案: { type: 'TEXT', value: '你好' },
      图标: {
        type: 'INSTANCE_SWAP',
        value: '1:2',
        preferredValues: [{ type: 'COMPONENT', key: 'k1' }],
      },
    });
  });

  it('变体项(type: VARIANT)照投影(契约枚举含 VARIANT)', () => {
    expect(
      readComponentProperties([
        {
          name: '属性 1',
          type: 'VARIANT',
          value: 'a1',
          variantOptions: ['a0', 'a1'],
        },
      ]),
    ).toEqual({ '属性 1': { type: 'VARIANT', value: 'a1' } });
  });

  it('缺字段的项被跳过;数组存在但无有效项 → 空表(**可读且没有**,与读不到区分)', () => {
    expect(
      readComponentProperties([
        { name: '缺 type', value: 'x' },
        { name: '缺 value', type: 'TEXT' },
        { type: 'TEXT', value: 'x' },
        'not-an-object',
      ]),
    ).toEqual({});
    expect(readComponentProperties(undefined)).toBeUndefined();
    expect(readComponentProperties('nope')).toBeUndefined();
  });
});

describe('readComponentPropertyValues', () => {
  it('组件侧:defaultValue 映射成契约的 value,键取 id ?? name', () => {
    expect(
      readComponentPropertyValues([
        { name: '显示图标', type: 'BOOLEAN', defaultValue: true },
        {
          name: '文案',
          id: 'Property 3#3:0',
          type: 'TEXT',
          defaultValue: '你好',
          alias: 'MG 专有',
        },
        {
          name: '图标',
          type: 'INSTANCE_SWAP',
          defaultValue: '1:2',
          preferredValues: [{ type: 'COMPONENT', key: 'k1' }, null],
        },
      ]),
    ).toEqual({
      显示图标: { type: 'BOOLEAN', value: true },
      文案: { type: 'TEXT', value: '你好' },
      图标: {
        type: 'INSTANCE_SWAP',
        value: '1:2',
        preferredValues: [{ type: 'COMPONENT', key: 'k1' }],
      },
    });
  });

  it('缺 name/type/defaultValue 的项跳过;数组存在 → 空表,字段不存在 → undefined', () => {
    expect(
      readComponentPropertyValues([
        { type: 'TEXT', defaultValue: 'x' },
        { name: '缺默认值', type: 'TEXT' },
        'nope',
      ]),
    ).toEqual({});
    expect(readComponentPropertyValues(undefined)).toBeUndefined();
  });
});

describe('remapPropertyIds', () => {
  it('名字能对上 id 的键被改写,对不上的原样', () => {
    expect(
      remapPropertyIds({ 显示图标: false, 未知: true }, [
        { name: '显示图标', id: 'Property 1#1:0' },
        { name: '没有 id' },
      ]),
    ).toEqual({ 'Property 1#1:0': false, 未知: true });
  });

  it('拿不到清单(非数组 / 无可用 id)时整体原样', () => {
    expect(remapPropertyIds({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(remapPropertyIds({ a: 1 }, [{ name: 'a' }])).toEqual({ a: 1 });
  });

  it('两张表都收:主组件侧(带 id)优先,实例侧兜底 —— MG 实例侧常为空表', () => {
    expect(
      remapPropertyIds(
        { 图标: 'x', 文案: 'y' },
        [{ name: '图标', id: '20:702' }],
        [
          { name: '文案', id: '20:703' },
          { name: '图标', id: '旧id不覆盖' },
        ],
      ),
    ).toEqual({ '20:702': 'x', '20:703': 'y' });
  });
});

describe('unwrapPropertyValues', () => {
  it('对象取 .value,标量原样', () => {
    expect(
      unwrapPropertyValues({
        布尔: { type: 'BOOLEAN', value: true },
        文本: { type: 'TEXT', value: '禁用' },
        直接: '原样',
      }),
    ).toEqual({ 布尔: true, 文本: '禁用', 直接: '原样' });
  });

  it('非对象入参原样返回(让宿主自己报错,不在这里静默吞)', () => {
    expect(unwrapPropertyValues(null)).toBeNull();
    expect(unwrapPropertyValues('x')).toBe('x');
    expect(unwrapPropertyValues(3)).toBe(3);
  });
});
