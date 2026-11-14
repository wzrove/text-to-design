import { describe, expect, it } from 'vitest';
import { daemonIsStale } from '../daemon/probe';

/**
 * daemon 轮换的判据 —— 纯决策,不连真 daemon。
 *
 * 回归的 bug:shim 重启(宿主断线重连)曾被当成「产物换了」,无条件请常驻
 * daemon 退役。宿主抖动时 daemon 被连环杀掉、每次都不及就绪,15s 预算耗尽,
 * MCP 面永久 disconnected(实测:256 次 shim 启动 / 125 次轮换 / 22 次超时)。
 * 修法 = 轮换前先问 daemonIsStale():只有 daemon 启动时刻 < 产物 mtime 才换。
 */

const BUILD = 1_700_000_000_000; // 产物 mtime
const health = (startedAt?: number) => () =>
  Promise.resolve(
    startedAt === undefined
      ? { name: 'text-to-design-mcp', version: '0.13.9' }
      : { name: 'text-to-design-mcp', version: '0.13.9', startedAt },
  );

describe('daemonIsStale:轮换决策', () => {
  it('daemon 启动晚于产物 → 已是最新构建,不轮换', async () => {
    const stale = await daemonIsStale({
      artifactMtime: () => BUILD,
      readHealth: health(BUILD + 60_000),
    });
    expect(stale).toBeNull();
  });

  it('daemon 启动早于产物(重建过 dist)→ 陈旧,轮换', async () => {
    const stale = await daemonIsStale({
      artifactMtime: () => BUILD,
      readHealth: health(BUILD - 60_000),
    });
    expect(stale).toEqual({ mtime: BUILD, startedAt: BUILD - 60_000 });
  });

  it('启动时刻正好等于产物 mtime → 视为当前构建,不换', async () => {
    const stale = await daemonIsStale({
      artifactMtime: () => BUILD,
      readHealth: health(BUILD),
    });
    expect(stale).toBeNull();
  });

  it('daemon 不在(health 为 null)→ 不在此处判陈旧', async () => {
    const stale = await daemonIsStale({
      artifactMtime: () => BUILD,
      readHealth: () => Promise.resolve(null),
    });
    expect(stale).toBeNull();
  });

  it('旧版 daemon 没上报 startedAt → 交给版本自检,不在此处判', async () => {
    const stale = await daemonIsStale({
      artifactMtime: () => BUILD,
      readHealth: health(),
    });
    expect(stale).toBeNull();
  });

  it('读不到产物 mtime → 保守复用,不轮换', async () => {
    const stale = await daemonIsStale({
      artifactMtime: () => null,
      readHealth: health(BUILD - 60_000),
    });
    expect(stale).toBeNull();
  });
});
