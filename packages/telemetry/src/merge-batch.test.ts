import { describe, expect, it } from 'vitest';
import { mergeBatchByFingerprint } from './merge-batch';

/**
 * 批内合并的不变量:同一 (安装, 错误形状) 在一批里只能出现一次。
 *
 * 理由(见 `index.ts` 原注释与 `src/index.ts` 的 ON CONFLICT):Postgres 的
 * `ON CONFLICT DO UPDATE` 不允许同一批里同一冲突键出现两次(报 21000),
 * 而老客户端只按原始 message 去重、归一化后仍可能撞键 —— 不先合并就是整批 500。
 */

const USER = '00000000-0000-0000-0000-000000000000';
const S = 'daemon';

describe('mergeBatchByFingerprint', () => {
  it('同形状多条合并成一行,count 相加', () => {
    const rows = mergeBatchByFingerprint(
      [
        { level: 'fatal', scope: S, message: 'boom', count: 1 },
        { level: 'fatal', scope: S, message: 'boom', count: 2 },
        { level: 'fatal', scope: S, message: 'boom', count: 3 },
      ],
      USER,
    );
    expect(rows.size).toBe(1);
    expect([...rows.values()][0]?.count).toBe(6);
  });

  it('归一化后撞键的也会合并(易变片段被抹平)', () => {
    const rows = mergeBatchByFingerprint(
      [
        { level: 'fatal', scope: S, message: '请求超时 耗时=12ms' },
        { level: 'fatal', scope: S, message: '请求超时 耗时=340ms' },
      ],
      USER,
    );
    expect(rows.size).toBe(1);
  });

  it('形状不同(scope/code/subject/message)各占一行', () => {
    const rows = mergeBatchByFingerprint(
      [
        { level: 'fatal', scope: S, message: 'boom' },
        { level: 'fatal', scope: 'tool', message: 'boom' },
        { level: 'fatal', scope: S, message: 'boom', code: 'engine_error' },
        { level: 'fatal', scope: S, message: 'boom', subject: 'jsd_ping' },
        { level: 'fatal', scope: S, message: 'other' },
      ],
      USER,
    );
    expect(rows.size).toBe(5);
  });

  it('缺省字段落 NULL,userId 统一注入', () => {
    const rows = mergeBatchByFingerprint(
      [{ level: 'fatal', scope: S, message: 'boom' }],
      USER,
    );
    const row = [...rows.values()][0];
    expect(row?.errorId).toBeNull();
    expect(row?.code).toBeNull();
    expect(row?.subject).toBeNull();
    expect(row?.userId).toBe(USER);
    expect(row?.count).toBe(1);
  });

  it('空批次返回空表', () => {
    expect(mergeBatchByFingerprint([], USER).size).toBe(0);
  });
});
