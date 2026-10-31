import { describe, expect, it } from 'vitest';
import { detectUniformLayout } from '../core/layout-hint';

/**
 * 「像该上 auto-layout」判据的回归(判据本体见 core/layout-hint.ts)。
 *
 * 守两件事:
 * ① 该报的报 —— 同轴 + 等距 + ≥3 个,这是手摆坐标最典型的浪费场景;
 * ② 不该报的不报 —— 这是条**噪声敏感**的提示:误报一次,后面所有 warning 都会被
 *    当成背景噪音跳过(instructions 里的「warnings 一律读」就废了)。
 */

const row = [
  { x: 0, y: 0, width: 100, height: 40 },
  { x: 116, y: 0, width: 100, height: 40 },
  { x: 232, y: 0, width: 100, height: 40 },
];

describe('detectUniformLayout', () => {
  it('横排等距命中 HORIZONTAL 并给出间距', () => {
    expect(detectUniformLayout({ children: row })).toEqual({
      count: 3,
      mode: 'HORIZONTAL',
      gap: 16,
    });
  });

  it('纵列等距命中 VERTICAL', () => {
    const col = row.map((r, i) => ({ ...r, x: 0, y: i * 56 }));
    expect(detectUniformLayout({ children: col })).toEqual({
      count: 3,
      mode: 'VERTICAL',
      gap: 16,
    });
  });

  it('已声明 layoutMode 的不报 —— 那正是想要的结果', () => {
    expect(
      detectUniformLayout({ children: row, layoutMode: 'HORIZONTAL' }),
    ).toBeNull();
  });

  it('间距不等的不报', () => {
    const uneven = [row[0], row[1], { ...row[2], x: 300 }];
    expect(detectUniformLayout({ children: uneven })).toBeNull();
  });

  it('不足 3 个不报(两个元素上布局收益小于结构噪声)', () => {
    expect(detectUniformLayout({ children: row.slice(0, 2) })).toBeNull();
  });

  it('两轴都对齐(全叠在一点)不报 —— 那是先建后摆的中间态', () => {
    const stacked = row.map(() => ({ x: 0, y: 0, width: 100, height: 40 }));
    expect(detectUniformLayout({ children: stacked })).toBeNull();
  });

  it('负间距(重叠)不报', () => {
    const overlap = [row[0], { ...row[1], x: 90 }, { ...row[2], x: 180 }];
    expect(detectUniformLayout({ children: overlap })).toBeNull();
  });

  it('缺 width 时不猜', () => {
    const missing = [{ x: 0, y: 0, height: 40 }, row[1], row[2]];
    expect(detectUniformLayout({ children: missing })).toBeNull();
  });

  it('子节点不是对象时不报', () => {
    const junk: unknown[] = [...row.slice(0, 2), 1];
    expect(detectUniformLayout({ children: junk })).toBeNull();
  });
});
