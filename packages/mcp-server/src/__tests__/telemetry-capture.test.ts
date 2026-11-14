import type { LogRecord } from 'text-to-design-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `captureError` 的两条核心不变量(dec 1a135e6a):
 * 1. 同**形状**的错误只累加 `count`,不占新队列位(否则一次批量里同一条错误占满队列);
 * 2. **在途**条目(count 已随请求体定格)既不参与去重、也不被溢出裁剪删掉 ——
 *    删了它的处理结果就无处可回写。
 *
 * 队列是模块级可变状态,故用 `__telemetryTest` 的最小钩子重置与观察。三重门里的
 * endpoint/key 取模块加载时的 env,所以每条用例都先 stubEnv 再 `resetModules` 重新 import。
 */

const ENDPOINT_KEY = 'TEXT_TO_DESIGN_TELEMETRY_URL';
const API_KEY_KEY = 'TELEMETRY_API_KEY';

async function freshTelemetry(): Promise<{
  captureError: typeof import('../telemetry').captureError;
  test: typeof import('../telemetry').__telemetryTest;
}> {
  vi.resetModules();
  vi.stubEnv(ENDPOINT_KEY, 'https://example.invalid/v1/errors');
  vi.stubEnv(API_KEY_KEY, 'test-key');
  const consent = await import('../consent');
  await consent.writeConsent(true);
  const mod = await import('../telemetry');
  return { captureError: mod.captureError, test: mod.__telemetryTest };
}

const fatal = (message: string): LogRecord => ({
  level: 'fatal',
  scope: 'daemon',
  message,
});

describe('captureError 队列不变量', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('同形状错误只占一条,重复出现累加 count', async () => {
    const { captureError, test } = await freshTelemetry();
    captureError(fatal('boom'));
    captureError(fatal('boom'));
    captureError(fatal('boom'));

    const queue = test.queue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.count).toBe(3);
  });

  it('形状不同(scope/code/subject 或 message)各占一条', async () => {
    const { captureError, test } = await freshTelemetry();
    captureError(fatal('boom'));
    captureError({ ...fatal('boom'), scope: 'tool' });
    captureError({ ...fatal('boom'), subject: 'jsd_set_fill' });
    captureError(fatal('other'));

    expect(test.queue()).toHaveLength(4);
  });

  it('在途条目不再被去重累加:另起一条', async () => {
    const { captureError, test } = await freshTelemetry();
    captureError(fatal('boom'));
    test.markInflight(0);

    captureError(fatal('boom'));

    const queue = test.queue();
    // 首条在途(先被标成 inflight),新来的同形状错误另起一条
    expect(queue).toHaveLength(2);
    expect(queue[0]?.inflight).toBe(true);
    expect(queue[1]?.inflight).toBeUndefined();
  });

  it('非上报级别(debug/info)被丢弃', async () => {
    const { captureError, test } = await freshTelemetry();
    captureError({ level: 'debug', scope: 'daemon', message: 'verbose' });
    captureError({ level: 'info', scope: 'daemon', message: 'noise' });

    expect(test.queue()).toHaveLength(0);
  });

  it('message / stack 按共享上限截断', async () => {
    const { captureError, test } = await freshTelemetry();
    captureError({ ...fatal('x'.repeat(20_000)), stack: 'y'.repeat(40_000) });

    const e = test.queue()[0] as unknown as {
      message: string;
      stack?: string;
    };
    expect(e.message).toHaveLength(8000);
    expect(e.stack).toHaveLength(20_000);
  });
});
