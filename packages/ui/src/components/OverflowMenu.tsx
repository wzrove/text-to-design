import { MoreHorizontal } from 'lucide-solid';
import { createSignal, Show } from 'solid-js';
import { t } from '../i18n/useLocale';
import CameraLockToggle from './CameraLockToggle';
import LocaleSwitch from './LocaleSwitch';
import ThemeToggle from './ThemeToggle';
import Tooltip from './Tooltip';

/**
 * 页头二级菜单:收留低频开关(错误上报 / 相机锁 / 主题 / 语言),页头只留
 * 状态与高频动作。窄面板(三平台宽度不一)下页头不再被四个图标挤满。
 *
 * 浮层做法照抄 LocaleSwitch(自写下拉 + fixed 兜底遮罩 + 容器上 Escape),
 * 不用 daisyUI 的 details-dropdown:原生 details 不响应 Escape、也不在点外部
 * 时收起,两条在插件 iframe 里都必须有。
 *
 * 行内控件复用原页头的开关组件本体:它们自带状态展示、toast 与 Tooltip,
 * 收进菜单不改行为;点击它们**不**收菜单(开关可反复拨),只有错误上报行
 * 收菜单去开同意弹窗。
 */
export default function OverflowMenu(props: {
  consentGranted: boolean;
  onOpenConsent: () => void;
  ref?: (el: HTMLButtonElement) => void;
}) {
  const [open, setOpen] = createSignal(false);
  let triggerEl: HTMLButtonElement | undefined;

  const close = (): void => {
    if (!open()) return;
    setOpen(false);
    // 焦点还给触发器:遮罩挡了面板,关掉后焦点不能掉在 body 上
    triggerEl?.focus();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 纯转发 Escape,真正的交互元素都在内部
    <div class="relative shrink-0" onKeyDown={onKeyDown}>
      <Tooltip tip={t('header.more')}>
        <button
          ref={(el) => {
            triggerEl = el;
            props.ref?.(el);
          }}
          type="button"
          class="btn btn-ghost btn-xs shrink-0 px-1 text-base-content/60 hover:text-base-content"
          aria-label={t('header.more')}
          aria-haspopup="menu"
          aria-expanded={open()}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal size={14} />
        </button>
      </Tooltip>

      <Show when={open()}>
        {/* 点面板内任何别处即收起;遮罩 fixed 且零占位,不影响面板高(0014) */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          class="fixed inset-0 z-40 cursor-default"
          onClick={close}
        />
        <div
          role="menu"
          aria-label={t('header.more')}
          class="absolute top-full right-0 z-50 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-1.5 text-xs shadow-lg"
        >
          <div class="flex items-center justify-between gap-2 rounded px-2 py-1">
            <span class="text-base-content/70">{t('menu.telemetry')}</span>
            <button
              type="button"
              role="menuitem"
              class={`btn btn-ghost btn-xs px-2 ${
                props.consentGranted
                  ? 'text-success'
                  : 'text-base-content/50 hover:text-base-content'
              }`}
              onClick={() => {
                close();
                props.onOpenConsent();
              }}
            >
              {props.consentGranted
                ? t('telemetry.state.on')
                : t('telemetry.state.off')}
            </button>
          </div>

          <div class="my-1 h-px bg-base-300" aria-hidden="true" />

          <div class="flex items-center justify-between gap-2 rounded px-2 py-1">
            <span class="text-base-content/70">{t('menu.cameraLock')}</span>
            <CameraLockToggle />
          </div>
          <div class="flex items-center justify-between gap-2 rounded px-2 py-1">
            <span class="text-base-content/70">{t('menu.theme')}</span>
            <ThemeToggle />
          </div>
          <div class="flex items-center justify-between gap-2 rounded px-2 py-1">
            <span class="text-base-content/70">{t('menu.locale')}</span>
            <LocaleSwitch />
          </div>
        </div>
      </Show>
    </div>
  );
}
