import { describe, expect, it } from 'vitest';
import { normalizeComponentPropertyKeys } from '../core/component';
import type { NodeSkeleton } from '../core/host';
import { trySerialize } from '../core/serialize';
import { serializedNodeSchema } from '../schemas/serialized-node';
import { makeInstance } from './fixtures';

/**
 * 0041:组件属性这条链上的两处静默缺口。
 *
 * 真机现场(`会话行` 组件,12 个属性成对存在)暴露的两个症状:
 * ① 短名写属性一律 `Could not find a component property with name` —— 引擎对
 *    **组件属性**只认带 `#` 后缀的完整键(免后缀只对变体属性成立);
 * ② 改错那一组时 `componentProperties` 全部回读为新值、回包 ok=true,画布不动 ——
 *    所以要能从读路径看到「哪个图层由哪个属性驱动」。
 */

/** 会话行组件的键形态(取自真机 componentProperties) */
const KNOWN = {
  '标题#32:0': { type: 'TEXT', value: '键盘车神教粉丝群 26' },
  '摘要#32:1': { type: 'TEXT', value: '[118 条] X I: [图片]' },
  '摘要2#32:7': { type: 'TEXT', value: '[118 条] X I: [图片]' },
  '显示未读#32:3': { type: 'BOOLEAN', value: true },
  '头像#32:6': { type: 'INSTANCE_SWAP', value: '32:103' },
};

describe('组件属性键归一(0041)', () => {
  it('精确命中:保留,不做任何改写', () => {
    expect(
      normalizeComponentPropertyKeys({ '标题#32:0': '李维' }, KNOWN),
    ).toEqual({ '标题#32:0': '李维' });
  });

  it('基名唯一命中:补成完整键(短名能用的唯一情形)', () => {
    expect(normalizeComponentPropertyKeys({ 标题: '李维' }, KNOWN)).toEqual({
      '标题#32:0': '李维',
    });
    // 换绑属性也走同一条:ENGINE 只认完整键,与属性类型无关
    expect(normalizeComponentPropertyKeys({ 头像: '32:113' }, KNOWN)).toEqual({
      '头像#32:6': '32:113',
    });
  });

  it('基名多头命中:报错并列出候选 —— 歧义不猜', () => {
    // 同一个基名出现两次(引擎允许同名属性,靠后缀区分)
    const duplicated = { '摘要#1:1': 1, '摘要#1:2': 2 };
    expect(() =>
      normalizeComponentPropertyKeys({ 摘要: 'x' }, duplicated),
    ).toThrowError(/有歧义/);
    expect(() =>
      normalizeComponentPropertyKeys({ 摘要: 'x' }, duplicated),
    ).toThrowError(/摘要#1:1、摘要#1:2/);
  });

  it('表里没有的键:原样透传,绝不报错', () => {
    // 变体属性不在 componentProperties 里(`variantProperties` 是另一张表)
    expect(normalizeComponentPropertyKeys({ 状态: '禁用' }, KNOWN)).toEqual({
      状态: '禁用',
    });
    // 实例侧属性表为空 / 读不到:不介入(MG 真机常态)
    expect(normalizeComponentPropertyKeys({ 标题: '李维' }, {})).toEqual({
      标题: '李维',
    });
    expect(normalizeComponentPropertyKeys({ 标题: '李维' }, undefined)).toEqual(
      {
        标题: '李维',
      },
    );
  });

  it('一次调用里混合三类键:各归各的', () => {
    expect(
      normalizeComponentPropertyKeys(
        { '标题#32:0': 'a', 摘要: 'b', 状态: '禁用' },
        KNOWN,
      ),
    ).toEqual({ '标题#32:0': 'a', '摘要#32:1': 'b', 状态: '禁用' });
  });

  it('不改形态:布尔值原样过一遍', () => {
    expect(normalizeComponentPropertyKeys({ 显示未读: false }, KNOWN)).toEqual({
      '显示未读#32:3': false,
    });
  });
});

describe('组件属性引用的读路径(0041)', () => {
  it('槽位归一:MG 的 isVisible 落到 visible;空值/null 丢掉', () => {
    const node = {
      ...makeInstance('1:1'),
      componentPropertyReferences: {
        isVisible: '显示图标#1:0',
        characters: null,
        unknownSlot: 'x',
      },
    } as unknown as NodeSkeleton;
    expect(trySerialize(node)?.componentPropertyReferences).toEqual({
      visible: '显示图标#1:0',
    });
  });

  it('无引用时整个键缺席(不是空对象)', () => {
    const withNull = {
      ...makeInstance('1:2'),
      componentPropertyReferences: null,
    } as unknown as NodeSkeleton;
    expect(trySerialize(withNull)).not.toHaveProperty(
      'componentPropertyReferences',
    );
    // 平台没有这个成员(jsDesign):`in` 为假,同样缺席
    expect(trySerialize(makeInstance('1:3'))).not.toHaveProperty(
      'componentPropertyReferences',
    );
  });

  it('回包能过线格式校验(不然 structured() 会判 isError)', () => {
    const node = {
      ...makeInstance('1:4'),
      componentPropertyReferences: { characters: '摘要2#32:7' },
    } as unknown as NodeSkeleton;
    const out = trySerialize(node);
    expect(out).not.toBeNull();
    expect(serializedNodeSchema.safeParse(out).success).toBe(true);
  });
});
