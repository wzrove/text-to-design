import { describe, expect, it } from 'vitest';
import {
  CROWDED_CHILDREN_THRESHOLD,
  countSemanticGroups,
  detectFlatBatch,
  siblingStepsByParent,
} from '../core/structure-hint';

/**
 * 「创建结果该不该归组」判据的回归(判据本体见 core/structure-hint.ts)。
 *
 * 守三件事:
 * ① 该报的报 —— 一批 ≥9 步进同一父级,这是「整屏分区全平铺」的形状;
 * ② 不该报的不报 —— 已按语义分好的批次每步 parentId 各不相同,不能误报
 *    (这条提示噪声敏感,误报一次后面所有 warning 都被当背景噪音);
 * ③ SVG 分组只数带 id 的 <g>,不误判注释、自闭合与无 id 的包装层。
 */

describe('detectFlatBatch', () => {
  const steps = (n: number, parentId = 'root') =>
    Array.from({ length: n }, () => ({ parentId }));

  it('阈值边界:正好命中', () => {
    expect(detectFlatBatch(steps(CROWDED_CHILDREN_THRESHOLD))).toEqual({
      parentId: 'root',
      batchCount: CROWDED_CHILDREN_THRESHOLD,
    });
  });

  it('阈值少一步不报', () => {
    expect(detectFlatBatch(steps(CROWDED_CHILDREN_THRESHOLD - 1))).toBeNull();
  });

  it('每步各进各的语义容器 → 不报', () => {
    const semantic = Array.from({ length: 20 }, (_, i) => ({
      parentId: `card-${i}`,
    }));
    expect(detectFlatBatch(semantic)).toBeNull();
  });

  it('多个父级时取最大的那个', () => {
    const mixed = [...steps(4, 'a'), ...steps(12, 'b')];
    expect(detectFlatBatch(mixed)).toEqual({ parentId: 'b', batchCount: 12 });
  });

  it('单步 reparent + 父级原有子节点数 → 按合计判', () => {
    expect(
      detectFlatBatch([{ parentId: 'root' }], { existingChildCount: 9 }),
    ).toEqual({ parentId: 'root', batchCount: 10 });
  });

  it('单步 reparent 且读不到父级子节点数 → 不报(单步不足以判)', () => {
    expect(detectFlatBatch([{ parentId: 'root' }])).toBeNull();
  });

  it('批次上下文补上后续步骤数后,同一判据能命中(jsd_batch 路径)', () => {
    // jsd_batch 里 9 步同父:本步 siblingSteps=8 → 合计 9 步,命中
    const hit = detectFlatBatch(steps(1 + 8));
    expect(hit).toEqual({ parentId: 'root', batchCount: 9 });
  });

  it('脏输入不报', () => {
    expect(detectFlatBatch([{ parentId: undefined }])).toBeNull();
    expect(detectFlatBatch([{ parentId: '' }])).toBeNull();
    expect(detectFlatBatch([])).toBeNull();
  });
});

describe('siblingStepsByParent', () => {
  const calls = [
    { tool: 'jsd_reparent_nodes', args: { ids: ['a'], parentId: 'root' } },
    { tool: 'jsd_reparent_nodes', args: { ids: ['b'], parentId: 'root' } },
    { tool: 'jsd_reparent_nodes', args: { ids: ['c'], parentId: 'card' } },
    // 占位符形态:批次执行时才会被解析成 id,数不出来(不猜)
    {
      tool: 'jsd_reparent_nodes',
      args: { ids: ['d'], parentId: '{{s1.created.id}}' },
    },
    { tool: 'jsd_move_node', args: { ids: ['e'], parentId: 'root' } },
  ];

  it('数本步之后同工具、同 parentId 的步', () => {
    expect(
      siblingStepsByParent(calls, 0, {
        tool: 'jsd_reparent_nodes',
        args: calls[0].args,
      }),
    ).toBe(1);
  });

  it('别的父级 / 别的工具 / 占位符形态都不计', () => {
    expect(
      siblingStepsByParent(calls, 3, {
        tool: 'jsd_reparent_nodes',
        args: calls[3].args,
      }),
    ).toBe(0);
    expect(
      siblingStepsByParent(calls, 2, {
        tool: 'jsd_reparent_nodes',
        args: calls[2].args,
      }),
    ).toBe(0);
  });

  it('缺 parentId 时不计', () => {
    expect(
      siblingStepsByParent(calls, 0, { tool: 'jsd_reparent_nodes', args: {} }),
    ).toBe(0);
  });
});

describe('countSemanticGroups', () => {
  it('数带 id 的 <g>', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g id="plot"><g id="grid"/></g><g id="legend"/></svg>`;
    expect(countSemanticGroups(svg)).toBe(3);
  });

  it('无 id 的包装 <g> 不计', () => {
    const svg = `<svg><g><rect/></g><g transform="translate(1,2)"/></svg>`;
    expect(countSemanticGroups(svg)).toBe(0);
  });

  it('整图只有一个 <g> 也不够 —— 一层不套等于没分组', () => {
    const svg = `<svg><g><path d="M0 0"/></g></svg>`;
    expect(countSemanticGroups(svg)).toBe(0);
  });

  it('单引号与空白的 id 写法也认', () => {
    const svg = `<svg><g  id='series-done' ></g></svg>`;
    expect(countSemanticGroups(svg)).toBe(1);
  });

  it('纯 <path> 没有 <g> → 0', () => {
    expect(countSemanticGroups('<svg><path d="M0 0h10"/></svg>')).toBe(0);
  });
});
