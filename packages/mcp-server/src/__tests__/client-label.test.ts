import { PLATFORM_LABEL } from 'text-to-design-shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Bridge } from '../bridge';
import { CLIENT } from '../config';
import {
  clearPlatformState,
  currentClient,
  refreshPlatformState,
} from '../platform-state';

/**
 * 客户端文案的平台无关性。
 *
 * 背景:config.CLIENT 曾写死 jsdesign,连 Figma 插件时「插件未连接」报错仍引导去
 * 即时设计客户端。平台只有 ping 回包后才可知,故兜底必须中性、命中后必须跟随平台。
 */

function stubBridge(platform: 'jsdesign' | 'figma'): Bridge {
  return {
    request: async () => ({
      platform,
      capabilities: [],
      coreCapabilities: [],
      platformOps: [],
    }),
  } as unknown as Bridge;
}

describe('客户端文案随平台', () => {
  beforeEach(() => {
    clearPlatformState('test');
  });

  it('兜底名不得写死任一平台', () => {
    const labels = Object.values(PLATFORM_LABEL);
    expect(labels).not.toContain(CLIENT.label);
    expect(labels).not.toContain(CLIENT.runtime);
  });

  it('未探测到平台时用中性兜底', () => {
    expect(currentClient()).toEqual({
      label: CLIENT.label,
      runtime: CLIENT.runtime,
    });
  });

  it('探测到 Figma 后文案指向 Figma', async () => {
    await refreshPlatformState(stubBridge('figma'));
    expect(currentClient().runtime).toBe(PLATFORM_LABEL.figma);
    expect(currentClient().label).toContain(PLATFORM_LABEL.figma);
  });

  it('断开后回到中性兜底(不拿旧平台判断新连接)', async () => {
    await refreshPlatformState(stubBridge('figma'));
    clearPlatformState('disconnected');
    expect(currentClient().runtime).toBe(CLIENT.runtime);
  });
});
