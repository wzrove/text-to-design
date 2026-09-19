import { describe, expect, it } from 'vitest';
import { BridgeError, errorCodeOf } from '../core/bridge-error';
import { err } from '../core/response';

/**
 * 错误链路的单点格式化不变式:
 * - 人读文本统一为 `错误: <message>`,只在这一层加前缀(插件/传输层不再拼前缀);
 * - 类别由 BridgeError 承载,非 BridgeError 一律 plugin_error;
 * - followUp 由 code 决定(not_connected 有专属引导),缺省回落到调用方传入的。
 */
describe('err 单点格式化', () => {
  it('BridgeError:统一前缀 + 保留 message', () => {
    const r = err(new BridgeError('engine_error', 'in set_fill: boom'));
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toBe('错误: in set_fill: boom');
  });

  it('not_connected:带专属 followUp', () => {
    const r = err(new BridgeError('not_connected', '插件未连接'));
    expect(r.followUp).toEqual({
      type: 'prompt',
      prompt: expect.stringContaining('运行'),
    });
  });

  it('无映射的 code:回落到调用方传入的 followUp', () => {
    const fallback = { type: 'tool', tool: 'jsd_ping' } as const;
    const r = err(
      new BridgeError('plugin_timeout', '请求超时'),
      undefined,
      fallback,
    );
    expect(r.followUp).toEqual(fallback);
  });

  it('非 BridgeError:归为 plugin_error,不误挂 not_connected 引导', () => {
    const e = new Error('boom');
    expect(errorCodeOf(e)).toBe('plugin_error');
    const r = err(e);
    expect(r.content[0]?.text).toBe('错误: boom');
    expect(r.followUp).toBeUndefined();
  });
});
