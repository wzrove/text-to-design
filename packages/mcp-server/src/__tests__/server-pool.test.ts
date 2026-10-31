import { describe, expect, it, vi } from 'vitest';
import {
  createServerPool,
  DEFAULT_POOL_MAX,
  DEFAULT_POOL_SIZE,
} from '../daemon/server-pool';

/**
 * 实例池的回归(背景见 daemon/server-pool.ts 的注释:2.3.0 起一个 McpServer
 * 同时只服务一个连接)。
 *
 * 守两条:① 重叠请求必须落到**不同**实例;② 顺序请求必须**复用**,不能每次新建
 * —— 后者才是这次改造的意义(装配 51.7 ms/次)。
 */

function countingBuild() {
  const built: { id: number }[] = [];
  const build = vi.fn(() => {
    const server = { id: built.length };
    built.push(server);
    return server as never;
  });
  return { build, built };
}

describe('createServerPool', () => {
  it('并发槽位 0/1/2 拿到三个不同实例', () => {
    const { build } = countingBuild();
    const pool = createServerPool(build, { size: 3, max: 3 });
    const a = pool.acquire(0);
    const b = pool.acquire(1);
    const c = pool.acquire(2);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('顺序请求复用实例,不重复装配', () => {
    const { build } = countingBuild();
    const pool = createServerPool(build, { size: 2, max: 8 });
    const first = pool.acquire(0);
    const callsAfterWarm = build.mock.calls.length;
    for (let i = 0; i < 5; i += 1) pool.acquire(0);
    expect(pool.acquire(0)).toBe(first);
    expect(build.mock.calls.length).toBe(callsAfterWarm);
  });

  it('槽位涨到池大小以上时按需扩容', () => {
    const { build } = countingBuild();
    const pool = createServerPool(build, { size: 1, max: 4 });
    expect(pool.size).toBe(1);
    pool.acquire(2);
    expect(pool.size).toBe(3);
  });

  it('超过上限后取模复用,不再新建(不无限吃内存)', () => {
    const { build } = countingBuild();
    const pool = createServerPool(build, { size: 2, max: 2 });
    const before = build.mock.calls.length;
    for (let slot = 0; slot < 10; slot += 1) pool.acquire(slot);
    expect(pool.size).toBe(2);
    expect(build.mock.calls.length).toBe(before);
  });

  it('负数/小数槽位不崩,归到槽位 0', () => {
    const { build } = countingBuild();
    const pool = createServerPool(build, { size: 1, max: 2 });
    expect(pool.acquire(-3)).toBe(pool.acquire(0));
    expect(pool.acquire(1.9)).toBe(pool.acquire(1));
  });

  it('warm 只增不重建', () => {
    const { build } = countingBuild();
    const pool = createServerPool(build, { size: 1, max: 4 });
    const before = pool.size;
    pool.warm(3);
    expect(pool.size).toBe(3);
    pool.warm(1);
    expect(pool.size).toBe(3);
    expect(build.mock.calls.length).toBe(3);
    expect(before).toBe(1);
  });

  it('默认池大小不超过默认上限', () => {
    expect(DEFAULT_POOL_SIZE).toBeLessThanOrEqual(DEFAULT_POOL_MAX);
  });
});
