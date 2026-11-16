import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function legacyDocument(result: boolean) {
  const textarea = {
    value: '',
    style: {} as Record<string, string>,
    select: vi.fn(),
    remove: vi.fn(),
  };
  const execCommand = vi.fn(() => result);
  vi.stubGlobal('document', {
    createElement: vi.fn(() => textarea),
    body: { appendChild: vi.fn() },
    execCommand,
  });
  return { textarea, execCommand };
}

describe('异步剪贴板', () => {
  it('writeText 真实完成后才返回成功', async () => {
    let resolve!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    let settled = false;
    const pending = copyText('task').then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolve();
    await expect(pending).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('task');
  });

  it('异步写入拒绝后走兼容复制并返回其结果', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const legacy = legacyDocument(false);
    await expect(copyText('task')).resolves.toBe(false);
    expect(legacy.execCommand).toHaveBeenCalledWith('copy');
  });

  it('无异步剪贴板时保留兼容复制', async () => {
    vi.stubGlobal('navigator', {});
    const legacy = legacyDocument(true);
    await expect(copyText('raw-json')).resolves.toBe(true);
    expect(legacy.textarea.value).toBe('raw-json');
    expect(legacy.textarea.remove).toHaveBeenCalled();
  });
});
