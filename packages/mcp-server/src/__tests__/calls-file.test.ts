import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * callsFile 是「清单落盘、只传路径」的主入口,文档承诺对象与裸数组两种形状等价。
 * 这里守三件事:裸数组不再被自身守卫误杀、BOM/UTF-16(Windows 工具默认产物)能读、
 * 失败策略字段写错类型时点名而不是静默按默认值跑。
 */

process.env.TEXT_TO_DESIGN_MCP_LOG = join(
  tmpdir(),
  'text-to-design-mcp-calls-file-test.log',
);

const { loadBatchCallsFile } = await import('../core/calls-file');

const dir = mkdtempSync(join(tmpdir(), 'ttd-calls-file-'));
let seq = 0;
const write = (content: string | Buffer, name = `c${++seq}.json`): string => {
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
};

const call = { id: 'a', tool: 'jsd_find', args: {} };

describe('loadBatchCallsFile', () => {
  it('接受 {"calls":[...]} 对象形状', async () => {
    const plan = await loadBatchCallsFile(
      write(JSON.stringify({ calls: [call] })),
    );
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0].tool).toBe('jsd_find');
  });

  it('接受裸数组形状(与对象形状等价)', async () => {
    const plan = await loadBatchCallsFile(write(JSON.stringify([call])));
    expect(plan.calls).toHaveLength(1);
  });

  it('剥离 UTF-8 BOM', async () => {
    const plan = await loadBatchCallsFile(
      write(`﻿${JSON.stringify({ calls: [call] })}`),
    );
    expect(plan.calls).toHaveLength(1);
  });

  it('识别 UTF-16LE BOM', async () => {
    const text = JSON.stringify({ calls: [call] });
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, 'utf16le'),
    ]);
    const plan = await loadBatchCallsFile(write(buf));
    expect(plan.calls).toHaveLength(1);
  });

  it('stopOnError/checkDrift 非布尔时点名,不静默按默认值跑', async () => {
    const file = write(JSON.stringify({ calls: [call], stopOnError: 'false' }));
    await expect(loadBatchCallsFile(file)).rejects.toThrow(/stopOnError/);
  });

  it('拒绝相对路径', async () => {
    await expect(loadBatchCallsFile('calls.json')).rejects.toThrow(/绝对路径/);
  });
});
