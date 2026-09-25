import { describe, expect, it } from 'vitest';
import { unwrapHostMessage } from '../code/mastergo/envelope';
import { readCodeMessage } from './codeChannel';

/**
 * 信封拆包的回归守卫(0017 联调实测的 bug)。
 *
 * 症状值得写进测试:插件在 MasterGo 上 UI 已连上 daemon,但 `jsd_ping` 5 秒超时,
 * 两侧都不报错 —— 因为 Figma/jsDesign 会替我们把 `pluginMessage` 拆开,而 MasterGo
 * 不拆。这条不变式就是「两种形状都要认」。
 */
describe('code → UI 入站拆包(readCodeMessage)', () => {
  it('认 Figma/jsDesign 的信封形状', () => {
    expect(
      readCodeMessage({ pluginMessage: { type: 'selection', data: null } }),
    ).toEqual({ type: 'selection', data: null });
  });

  it('认 MasterGo 的裸形状(不拆信封)', () => {
    expect(readCodeMessage({ type: 'response', id: 'r1', ok: true })).toEqual({
      type: 'response',
      id: 'r1',
      ok: true,
    });
  });

  it('非协议帧一律拒绝(面板 iframe 会收到其它来源的 message)', () => {
    expect(readCodeMessage(undefined)).toBeNull();
    expect(readCodeMessage(null)).toBeNull();
    expect(readCodeMessage('selection')).toBeNull();
    expect(readCodeMessage({})).toBeNull();
    expect(readCodeMessage({ type: 42 })).toBeNull();
    // 只有信封没有载荷
    expect(readCodeMessage({ pluginMessage: undefined })).toBeNull();
    expect(readCodeMessage({ pluginMessage: 'plain' })).toBeNull();
  });
});

describe('UI → code 入站拆包(MasterGo 侧)', () => {
  it('有信封就取载荷,没有就用原始值', () => {
    expect(unwrapHostMessage({ pluginMessage: { method: 'ping' } })).toEqual({
      method: 'ping',
    });
    expect(unwrapHostMessage({ method: 'ping' })).toEqual({ method: 'ping' });
  });

  it('非对象原样返回(旁路消息是数字/字符串时不能被吃掉)', () => {
    expect(unwrapHostMessage('ping')).toBe('ping');
    expect(unwrapHostMessage(7)).toBe(7);
    expect(unwrapHostMessage(null)).toBeNull();
  });
});
