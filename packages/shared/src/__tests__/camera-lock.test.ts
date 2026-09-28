import { describe, expect, it } from 'vitest';
import {
  CAMERA_LOCK_DEFAULT,
  isCameraLockSetMessage,
  withCameraLock,
} from '../camera-lock';
import type { DesignHost, NodeSkeleton } from '../core/host';

const NODE_A = { id: 'a' } as unknown as NodeSkeleton;
const NODE_B = { id: 'b' } as unknown as NodeSkeleton;

function fakeHost() {
  const scrolled: unknown[][] = [];
  const host = {
    get viewport() {
      return {
        get center() {
          return { x: 100, y: 200 };
        },
        scrollAndZoomIntoView(nodes: readonly unknown[]) {
          scrolled.push([...nodes]);
        },
      };
    },
  };
  return { host: host as unknown as DesignHost, scrolled };
}

describe('withCameraLock', () => {
  it('锁定时跳过 scrollAndZoomIntoView,center 照常可读', () => {
    const { host, scrolled } = fakeHost();
    const gated = withCameraLock(host, () => true);
    expect(gated.viewport.center).toEqual({ x: 100, y: 200 });
    gated.viewport.scrollAndZoomIntoView([NODE_A]);
    expect(scrolled).toHaveLength(0);
  });

  it('解锁后透传,且锁状态可中途翻转', () => {
    const { host, scrolled } = fakeHost();
    let locked = true;
    const gated = withCameraLock(host, () => locked);
    gated.viewport.scrollAndZoomIntoView([NODE_A]);
    locked = false;
    gated.viewport.scrollAndZoomIntoView([NODE_B]);
    expect(scrolled).toEqual([[NODE_B]]);
  });

  it('其余 host 成员经原型委派照常可达', () => {
    const { host } = fakeHost();
    const raw = { ...host, ping: () => 'pong' } as unknown as DesignHost;
    const gated = withCameraLock(raw, () => true);
    expect((gated as unknown as { ping: () => string }).ping()).toBe('pong');
  });
});

describe('camera_lock_set 守卫', () => {
  it('默认锁定', () => {
    expect(CAMERA_LOCK_DEFAULT).toBe(true);
  });

  it('只认 type + boolean locked', () => {
    expect(
      isCameraLockSetMessage({ type: 'camera_lock_set', locked: false }),
    ).toBe(true);
    expect(
      isCameraLockSetMessage({ type: 'camera_lock_set', locked: '1' }),
    ).toBe(false);
    expect(isCameraLockSetMessage({ type: 'camera_lock_set' })).toBe(false);
    expect(isCameraLockSetMessage(null)).toBe(false);
  });
});
