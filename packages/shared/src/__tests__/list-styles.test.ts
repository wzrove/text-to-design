import { describe, expect, it } from 'vitest';
import { listStylesAsync } from '../core/access';
import type { DesignHost } from '../core/host';
import { runtimeContext } from '../core/runtime';
import { makeHost } from './fixtures';

/**
 * 本地样式枚举的两条不变式。
 *
 * ① **四类各自是一次独立的引擎调用**(0042):任一类失败/缺失不该连坐其余三类。
 * ② **未声明 `styleEnumeration` ⇒ 恒空且不调**(0043):同步 getter 不可中断 ——
 *    即时设计四个 getter 全在、也全都不返回,`typeof` 探测永远答「可以问」,
 *    判据只能是平台声明。
 *
 * 两条都断言**调用记录**而不是返回值:只看返回值会放过「取回来再丢掉」,
 * 而那种实现照样会冻死插件线程。
 */
function hostWithStyles(calls: string[]): DesignHost {
  const make = (kind: string, count: number) => () => {
    calls.push(kind);
    return Array.from({ length: count }, (_, i) => ({
      id: `${kind}:${i}`,
      name: `${kind}-${i}`,
      type: kind,
    }));
  };
  return {
    ...makeHost([]),
    getLocalPaintStyles: make('PAINT', 2),
    getLocalTextStyles: make('TEXT', 1),
    getLocalEffectStyles: make('EFFECT', 0),
    getLocalGridStyles: make('GRID', 3),
  } as unknown as DesignHost;
}

/** 声明了样式枚举能力的平台(与未注入的 fail-open 路径同行为) */
const ENUM_OK = runtimeContext(['styleEnumeration']);

describe('本地样式枚举(0042 的四次独立调用 + 0043 的能力闸)', () => {
  it('四类全问,且空的一类不报错', async () => {
    const calls: string[] = [];
    const out = await listStylesAsync(hostWithStyles(calls), ENUM_OK);
    expect(calls).toEqual(['PAINT', 'TEXT', 'EFFECT', 'GRID']);
    expect(out).toHaveLength(6);
  });

  it('getter 缺失的类别:跳过而不报错', async () => {
    const calls: string[] = [];
    const host = {
      ...makeHost([]),
      getLocalPaintStyles: () => {
        calls.push('PAINT');
        return [{ id: 'P:1', name: 'P', type: 'PAINT' }];
      },
      // TEXT / EFFECT / GRID 三个 getter 都不存在
    } as unknown as DesignHost;
    const out = await listStylesAsync(host, ENUM_OK);
    expect(calls).toEqual(['PAINT']);
    expect(out).toHaveLength(1);
  });

  it('未声明 styleEnumeration:恒空且不调任何 getter', async () => {
    const calls: string[] = [];
    const out = await listStylesAsync(
      hostWithStyles(calls),
      runtimeContext(['styles']),
    );
    expect(calls).toEqual([]);
    expect(out).toEqual([]);
  });

  it('只声明 styles(按 id 应用)不算声明枚举:两条能力位不互相隐含', async () => {
    const calls: string[] = [];
    const out = await listStylesAsync(
      hostWithStyles(calls),
      runtimeContext(['styles', 'inPlaceVariants']),
    );
    expect(calls).toEqual([]);
    expect(out).toEqual([]);
  });

  it('能力表未注入:fail-open,退回 typeof 探测(与 0002 同口径)', async () => {
    const calls: string[] = [];
    const out = await listStylesAsync(
      hostWithStyles(calls),
      runtimeContext(null),
    );
    expect(calls).toEqual(['PAINT', 'TEXT', 'EFFECT', 'GRID']);
    expect(out).toHaveLength(6);
  });
});
