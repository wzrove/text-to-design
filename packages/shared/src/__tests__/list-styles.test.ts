import { describe, expect, it } from 'vitest';
import { listStylesAsync } from '../core/access';
import type { DesignHost } from '../core/host';
import { runtimeContext } from '../core/runtime';
import { makeHost } from './fixtures';

/**
 * 本地样式枚举的两条不变式。
 *
 * ① **四类各自是一次独立的引擎调用**(0042):任一类失败/缺失不该连坐其余三类。
 * ② **未声明 `styleEnumeration` ⇒ 恒空且不调**(dec 0043):即时设计四个同步 getter 实测
 *    0~1ms 就返回,永挂的是运行时透出的 `*Async`(`await` 永不 resolve,见 dec 0043 的
 *    2026-10-15 更正)—— `typeof` 探测对两条路都永远答「可以问」,判据只能是平台声明。
 *
 * 两条都断言**调用记录**而不是返回值:只看返回值会放过「取回来再丢掉」,
 * 而那种实现照样会把整条调用挂到超时。
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

/**
 * 假件的第二条:**同步与 async 入口都在** —— 复刻真实平台。
 * 即时设计就是「四个 `*Async` 运行时存在(typings 未声明)且永不 resolve」,
 * 所以「靠 `?.` 探测有没有 async」在这条路上会给出错误答案;Figma 则只有 async 能用
 * (dynamic-page 下同步入口必抛)。选路只能靠声明。
 */
function hostWithBoth(syncCalls: string[], asyncCalls: string[]): DesignHost {
  const shape = (kind: string, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${kind}:${i}`,
      name: `${kind}-${i}`,
      type: kind,
    }));
  const mkSync = (kind: string, count: number) => () => {
    syncCalls.push(kind);
    return shape(kind, count);
  };
  const mkAsync = (kind: string) => async () => {
    asyncCalls.push(kind);
    return shape(kind, 0);
  };
  return {
    ...makeHost([]),
    getLocalPaintStyles: mkSync('PAINT', 2),
    getLocalTextStyles: mkSync('TEXT', 1),
    getLocalEffectStyles: mkSync('EFFECT', 0),
    getLocalGridStyles: mkSync('GRID', 3),
    getLocalPaintStylesAsync: mkAsync('PAINT'),
    getLocalTextStylesAsync: mkAsync('TEXT'),
    getLocalEffectStylesAsync: mkAsync('EFFECT'),
    getLocalGridStylesAsync: mkAsync('GRID'),
  } as unknown as DesignHost;
}

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

  it('声明 styleEnumerationSync:只问同步入口,*Async 一次都不碰', async () => {
    const sync: string[] = [];
    const asyncCalls: string[] = [];
    const out = await listStylesAsync(
      hostWithBoth(sync, asyncCalls),
      runtimeContext(['styleEnumeration', 'styleEnumerationSync']),
    );
    expect(sync).toEqual(['PAINT', 'TEXT', 'EFFECT', 'GRID']);
    expect(
      asyncCalls,
      '即时设计的 *Async 成员 typings 没声明、运行时却有,而且永不 resolve —— 碰一下就 25s',
    ).toEqual([]);
    expect(out).toHaveLength(6);
  });

  it('未声明时仍优先 *Async(Figma 的 dynamic-page 语义不能动)', async () => {
    const sync: string[] = [];
    const asyncCalls: string[] = [];
    await listStylesAsync(hostWithBoth(sync, asyncCalls), ENUM_OK);
    expect(asyncCalls).toEqual(['PAINT', 'TEXT', 'EFFECT', 'GRID']);
    expect(sync).toEqual([]);
  });
});
