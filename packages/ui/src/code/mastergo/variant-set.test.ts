import { describe, expect, it } from 'vitest';
import {
  describeDimensions,
  duplicateDimensions,
  findDimension,
  missingDimensions,
  newMembers,
  readDimensions,
  resolveValueTarget,
  toMemberView,
  unknownRenameSources,
  verifyDelete,
  verifyRename,
  verifyValueEdit,
} from './variant-set';

/**
 * 集合级变体管理的判定回归守卫(决策 0033)。
 *
 * 依据都是 `@mastergo/plugin-typings@2.19.2` `dist/index.d.ts`:
 * - 维度与可选值只能从 `componentPropertyValues` 的 VARIANT 项读(`variantOptions`,3011-3026 行)
 *   —— MG **没有** `variantGroupProperties`(与 Figma / jsDesign 不同);
 * - 写入口 `createVariantProperties` / `editVariantProperties` / `editVariantPropertyValues` /
 *   `deleteVariantProperty` / `createVariantComponent`(3072-3085 行)全部返回 void。
 *
 * 为什么重点测「回读比对」:本平台有「回包成功、值没变」的前科(0018 真机实测),
 * 所以每个 op 的成败判据都是**回读**而不是返回值 —— 这层判定错了,静默失效就会漏给调用方
 * (0007 不允许)。返回 void 的入口还要靠「前后比 id」认领新成分,那也是易错点。
 */

const VARIANT_TABLE = [
  {
    name: '属性 1',
    id: '20:395',
    type: 'VARIANT',
    defaultValue: '默认',
    variantOptions: ['默认', '备选'],
  },
  { name: '显示图标', id: '20:396', type: 'BOOLEAN', defaultValue: false },
  { name: '文案', id: '20:397', type: 'TEXT', defaultValue: '按钮' },
  {
    name: '尺寸',
    id: '20:398',
    type: 'VARIANT',
    variantOptions: ['a0', 'a1'],
    variantOptionsAlias: ['', '小'],
  },
];

describe('readDimensions', () => {
  it('只挑 VARIANT 项,并带上 id 与可选值(布尔/文本属性不是维度)', () => {
    expect(readDimensions(VARIANT_TABLE)).toEqual([
      { name: '属性 1', id: '20:395', options: ['默认', '备选'] },
      {
        name: '尺寸',
        id: '20:398',
        options: ['a0', 'a1'],
        optionsAlias: ['', '小'],
      },
    ]);
  });

  it('缺 id 时退回名字(宿主不一定给 id),缺 name 的项丢弃', () => {
    expect(
      readDimensions([
        { name: '尺寸', type: 'VARIANT', variantOptions: ['a0'] },
        { id: '20:399', type: 'VARIANT' },
      ]),
    ).toEqual([{ name: '尺寸', id: '尺寸', options: ['a0'] }]);
  });

  it('不是数组(字段不存在 / 拿错节点)返回空数组,由调用方按「读不到」处理', () => {
    expect(readDimensions(undefined)).toEqual([]);
    expect(readDimensions({ name: '属性 1' })).toEqual([]);
    expect(readDimensions([null, 'x', 42])).toEqual([]);
  });

  it('可选值形状不对时留空数组,不抛错也不塞脏值', () => {
    const dims = readDimensions([
      { name: '尺寸', type: 'VARIANT', variantOptions: ['a0', 7, null] },
    ]);
    expect(dims).toEqual([{ name: '尺寸', id: '尺寸', options: ['a0'] }]);
  });
});

describe('describeDimensions', () => {
  it('列出维度、id 与可选值(报错消息里要能一眼看全现状)', () => {
    expect(describeDimensions(readDimensions(VARIANT_TABLE))).toBe(
      '属性 1(id 20:395)=[默认、备选]、尺寸(id 20:398)=[a0、a1]',
    );
  });

  it('空表说「无」,读不到可选值时也说清楚(而不是留个空括号)', () => {
    expect(describeDimensions([])).toBe('无');
    expect(
      describeDimensions(readDimensions([{ name: '尺寸', type: 'VARIANT' }])),
    ).toBe('尺寸(id 尺寸)=[(读不到可选值)]');
  });
});

describe('findDimension', () => {
  const dims = readDimensions(VARIANT_TABLE);

  it('名字与 id 都能查到(宿主给不给 id 都可能)', () => {
    expect(findDimension(dims, '属性 1')?.id).toBe('20:395');
    expect(findDimension(dims, '20:398')?.name).toBe('尺寸');
    expect(findDimension(dims, '不存在的')).toBeNull();
  });
});

describe('建维度的两道检查', () => {
  it('重名要先拦(宿主可能对同名静默 no-op)', () => {
    const dims = readDimensions(VARIANT_TABLE);
    expect(duplicateDimensions(dims, ['属性 1', '状态'])).toEqual(['属性 1']);
    expect(duplicateDimensions(dims, ['状态'])).toEqual([]);
  });

  it('回读少一个就是静默失效 —— 必须能被抓到', () => {
    const after = readDimensions(VARIANT_TABLE);
    expect(missingDimensions(after, ['属性 1', '状态'])).toEqual(['状态']);
    expect(missingDimensions(after, ['属性 1'])).toEqual([]);
  });
});

describe('改名:旧名检查与回读比对', () => {
  const dims = readDimensions(VARIANT_TABLE);

  it('旧名不存在时点名(不是所有旧名都报,只报不存在的那些)', () => {
    expect(
      unknownRenameSources(dims, { '属性 1': '状态', 尺寸X: '大小' }),
    ).toEqual(['尺寸X']);
    expect(unknownRenameSources(dims, { '属性 1': '状态' })).toEqual([]);
  });

  it('回读两个方向都查:旧名还在(没改)与新名没出现(改丢了)要分开说', () => {
    // 宿主完全没动
    expect(verifyRename(dims, { '属性 1': '状态' })).toEqual([
      '旧名 属性 1 仍在',
      '新名 状态 没出现',
    ]);
    // 宿主动了一半(旧名已消失但新名不是我们要的)
    const renamed = readDimensions([
      {
        name: '状态X',
        id: '20:395',
        type: 'VARIANT',
        variantOptions: ['默认'],
      },
    ]);
    expect(verifyRename(renamed, { '属性 1': '状态' })).toEqual([
      '新名 状态 没出现',
    ]);
    // 正常改名
    const ok = readDimensions([
      { name: '状态', id: '20:395', type: 'VARIANT', variantOptions: ['默认'] },
    ]);
    expect(verifyRename(ok, { '属性 1': '状态' })).toEqual([]);
  });
});

describe('改取值:目标检查与回读比对', () => {
  const dims = readDimensions(VARIANT_TABLE);

  it('维度不存在时给出可抛出的消息(带当前维度清单)', () => {
    const got = resolveValueTarget(dims, '不存在的维度', 'a0');
    expect('message' in got && got.message).toContain(
      '集合没有维度「不存在的维度」',
    );
    expect('message' in got && got.message).toContain('属性 1(id 20:395)');
  });

  it('旧取值不在该维度的可选值里时点名可选值', () => {
    const got = resolveValueTarget(dims, '尺寸', 'a9');
    expect('message' in got && got.message).toContain('没有取值「a9」');
    expect('message' in got && got.message).toContain('可选值:a0、a1');
  });

  it('命中时返回维度(按名字或 id 都算命中)', () => {
    expect(resolveValueTarget(dims, '尺寸', 'a1')).toEqual({
      dimension: {
        name: '尺寸',
        id: '20:398',
        options: ['a0', 'a1'],
        optionsAlias: ['', '小'],
      },
    });
    expect(resolveValueTarget(dims, '20:398', 'a0')).toHaveProperty(
      'dimension',
    );
  });

  it('回读:新值没出现 / 旧值仍在,两种失败都要报', () => {
    const untouched = readDimensions(VARIANT_TABLE);
    expect(verifyValueEdit(untouched, '尺寸', 'a1', '小')).toEqual([
      '新取值「小」没出现',
      '旧取值「a1」仍在',
    ]);
    const ok = readDimensions([
      {
        name: '尺寸',
        id: '20:398',
        type: 'VARIANT',
        variantOptions: ['a0', '小'],
      },
    ]);
    expect(verifyValueEdit(ok, '尺寸', 'a1', '小')).toEqual([]);
  });
});

describe('删维度:回读比对', () => {
  it('维度还在就是失败(宿主静默 no-op / 收的键不对)', () => {
    const dims = readDimensions(VARIANT_TABLE);
    expect(verifyDelete(dims, '属性 1')).toEqual(['维度「属性 1」仍在']);
    const after = readDimensions([
      { name: '尺寸', id: '20:398', type: 'VARIANT', variantOptions: ['a0'] },
    ]);
    expect(verifyDelete(after, '属性 1')).toEqual([]);
  });
});

describe('成员(成分)', () => {
  it('toMemberView 把原生数组取值投影成记录,空值不塞空对象', () => {
    expect(
      toMemberView({
        id: '1:2',
        name: '属性 1[a0]=默认',
        variantProperties: [{ property: '属性 1', value: '默认' }],
      }),
    ).toEqual({
      id: '1:2',
      name: '属性 1[a0]=默认',
      variantProperties: { '属性 1': '默认' },
    });
    expect(toMemberView({ id: '1:3' })).toEqual({ id: '1:3' });
    expect(toMemberView({ id: '1:4', variantProperties: [] })).toEqual({
      id: '1:4',
    });
  });

  it('createVariantComponent 返回 void → 新成分只能靠前后比 id 认领', () => {
    const created = newMembers(
      ['1:2', '1:3'],
      [
        { id: '1:2', name: '旧' },
        { id: '1:3', name: '旧2' },
        {
          id: '1:9',
          name: '新',
          variantProperties: [{ property: '属性 1', value: '备选' }],
        },
      ],
    );
    expect(created).toEqual([
      { id: '1:9', name: '新', variantProperties: { '属性 1': '备选' } },
    ]);
    // 什么都没加(静默失效)→ 空数组,调用方据此抛错
    expect(newMembers(['1:2'], [{ id: '1:2' }])).toEqual([]);
  });
});
