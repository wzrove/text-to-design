import { describe, expect, it } from 'vitest';
import {
  parseSelectionMeta,
  parseSelectionSummaryData,
} from '../selection-guards';

/**
 * 面板侧手写守卫与 zod schema 的共享形状。
 * 之所以要守:UI 为了不把 zod 打进 ui.html,改用了这两个手写解析;
 * schema 增字段/收紧规则时,门禁只在 MCP 侧红,面板会静默接受坏帧。
 */
describe('selection 帧手写守卫', () => {
  it('接受合法 meta 与 summary', () => {
    expect(
      parseSelectionMeta({
        platform: 'figma',
        observedAt: '2026-11-20T00:00:00Z',
        selectionSeq: 7,
      }),
    ).toEqual({
      platform: 'figma',
      observedAt: '2026-11-20T00:00:00Z',
      selectionSeq: 7,
    });
    expect(
      parseSelectionSummaryData({
        pageName: '页面 1',
        selection: [{ id: '1:2', name: 'Card', type: 'FRAME', width: 320 }],
      }),
    ).toEqual({
      pageName: '页面 1',
      selection: [{ id: '1:2', name: 'Card', type: 'FRAME', width: 320 }],
    });
  });

  it('拒绝越界 meta', () => {
    for (const meta of [
      null,
      {},
      { platform: 'sketch', observedAt: 'x', selectionSeq: null },
      { platform: 'figma', observedAt: '', selectionSeq: null },
      { platform: 'figma', observedAt: 'x', selectionSeq: 0 },
      { platform: 'figma', observedAt: 'x', selectionSeq: 1.5 },
    ])
      expect(parseSelectionMeta(meta), JSON.stringify(meta)).toBeNull();
  });

  it('拒绝坏 summary:缺字段、未知类型、非法尺寸', () => {
    for (const data of [
      null,
      { pageName: 'p' },
      { selection: [] },
      { pageName: 'p', selection: [{ id: '', name: 'n', type: 'FRAME' }] },
      { pageName: 'p', selection: [{ id: '1', name: 'n', type: 'MAGIC' }] },
      {
        pageName: 'p',
        selection: [{ id: '1', name: 'n', type: 'FRAME', width: '3' }],
      },
    ])
      expect(parseSelectionSummaryData(data), JSON.stringify(data)).toBeNull();
  });
});
