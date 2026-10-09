import { Lock, Unlock } from 'lucide-solid';
import { createSignal, onMount } from 'solid-js';
import {
  CAMERA_LOCK_DEFAULT,
  type CameraLockSetMessage,
} from 'text-to-design-shared';
import { postToCode } from '../bridge/codeChannel';
import { t } from '../i18n/useLocale';
import { showToast } from '../utils/toast';
import Tooltip from './Tooltip';

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
 *
 * 锁定态另有淡底胶囊(同 LogTrigger 未读态的写法,只是取中性色):14px 图标换个
 * 形状这点差异扫一眼看不出来,而锁错了的代价是一次误操作 —— 当前档必须不悬停
 * 也能读出。用中性色而非语义色:页头的色块归状态徽章,锁是工具档位不是状态。
 *
 * 切换要弹提示(见 0037):它锁的是「画布会不会跟着动」,事后才发现锁错了代价是
 * 一次误操作。文案直接复用按钮自身的状态名(`header.cameraLock.*`),不另造一句
 * 同义话。
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
    showToast(
      t(next ? 'header.cameraLock.locked' : 'header.cameraLock.unlocked'),
    );
  };

  return (
    <Tooltip
      tip={
        locked()
          ? t('header.cameraLock.title.locked')
          : t('header.cameraLock.title.unlocked')
      }
      align="end"
    >
      <button
        type="button"
        class={`btn btn-ghost btn-xs shrink-0 px-1 ${
          locked()
            ? 'border border-base-content/25 bg-base-content/10 text-base-content hover:bg-base-content/20'
            : 'text-base-content/60 hover:text-base-content'
        }`}
        aria-label={
          locked()
            ? t('header.cameraLock.locked')
            : t('header.cameraLock.unlocked')
        }
        aria-pressed={locked()}
        onClick={toggle}
      >
        {locked() ? <Lock size={14} /> : <Unlock size={14} />}
      </button>
    </Tooltip>
  );
}
