import { Lock, Unlock } from 'lucide-solid';
import { createSignal, onMount } from 'solid-js';
import {
  CAMERA_LOCK_DEFAULT,
  type CameraLockSetMessage,
} from 'text-to-design-shared';
import { postToCode } from '../bridge/codeChannel';
import { t } from '../i18n/useLocale';

const CAMERA_LOCK_STORAGE_KEY = 'text-to-design:camera-lock';

function readStored(): boolean {
  try {
    const v = localStorage.getItem(CAMERA_LOCK_STORAGE_KEY);
    return v == null ? CAMERA_LOCK_DEFAULT : v === '1';
  } catch {
    return CAMERA_LOCK_DEFAULT;
  }
}

/**
 * 相机锁开关:锁定(默认)时 MCP 操作画布不移动视口。
 *
 * 状态在 UI 侧,执行在 code 侧(`withCameraLock` 拦 viewport 契约),走
 * `camera_lock_set` 旁路消息(见 shared/camera-lock.ts)。挂载时补发一次:
 * code 侧与面板同生同死、两侧默认一致,补发只为覆盖「用户改过 + 面板重载」。
 */
export default function CameraLockToggle() {
  const [locked, setLocked] = createSignal(readStored());

  const send = (value: boolean): void => {
    const msg: CameraLockSetMessage = {
      type: 'camera_lock_set',
      locked: value,
    };
    postToCode(msg);
  };

  onMount(() => send(locked()));

  const toggle = (): void => {
    const next = !locked();
    setLocked(next);
    try {
      localStorage.setItem(CAMERA_LOCK_STORAGE_KEY, next ? '1' : '0');
    } catch {}
    send(next);
  };

  return (
    <button
      type="button"
      class="btn btn-ghost btn-xs shrink-0 px-1 text-base-content/60 hover:text-base-content"
      aria-label={
        locked()
          ? t('header.cameraLock.locked')
          : t('header.cameraLock.unlocked')
      }
      aria-pressed={locked()}
      title={
        locked()
          ? t('header.cameraLock.title.locked')
          : t('header.cameraLock.title.unlocked')
      }
      onClick={toggle}
    >
      {locked() ? <Lock size={14} /> : <Unlock size={14} />}
    </button>
  );
}
