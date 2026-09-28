import type { DesignHost, NodeSkeleton } from './core/host';

/**
 * 相机锁定的跨侧契约:UI ↔ 插件 code 的**旁路消息**(不进 `PluginRequest`,
 * 理由同 locale-channel / panel:不过 MCP、没有外部调用方)。
 *
 * 分工:**锁不锁**是面板用户的选择,只有 UI 知道;**相机动不动**发生在 code 侧
 * (`host.viewport.scrollAndZoomIntoView` 的唯一咽喉)。所以 UI 只发意图,
 * code 侧用 `withCameraLock` 在 host 契约层拦截 —— 不散落到 core 各调用点。
 */

/** 默认锁定:相机不动是常态,「跟随」才是用户显式打开的例外 */
export const CAMERA_LOCK_DEFAULT = true;

/** UI → code:用户切换了相机锁定 */
export interface CameraLockSetMessage {
  type: 'camera_lock_set';
  locked: boolean;
}

export function isCameraLockSetMessage(
  value: unknown,
): value is CameraLockSetMessage {
  const m = value as Partial<CameraLockSetMessage> | null | undefined;
  return (
    m != null && m.type === 'camera_lock_set' && typeof m.locked === 'boolean'
  );
}

/**
 * 给 host 包一层受锁的 viewport:锁定时 `scrollAndZoomIntoView` 变空操作,
 * `center` 照常可读(「放在视口中心」的定位语义保留,只是相机不跟过去)。
 *
 * 走 `Object.create` 原型委派而非展开:与 figma/host.ts 同款纪律 ——
 * `currentPage` / `viewport` 这类 getter 在启动早期立即求值会抛。
 */
export function withCameraLock(
  host: DesignHost,
  isLocked: () => boolean,
): DesignHost {
  const wrapped = Object.create(host) as DesignHost;
  Object.defineProperty(wrapped, 'viewport', {
    get(): DesignHost['viewport'] {
      const vp = host.viewport;
      return {
        get center() {
          return vp.center;
        },
        scrollAndZoomIntoView(nodes: readonly NodeSkeleton[]) {
          if (!isLocked()) vp.scrollAndZoomIntoView(nodes);
        },
      };
    },
  });
  return wrapped;
}
