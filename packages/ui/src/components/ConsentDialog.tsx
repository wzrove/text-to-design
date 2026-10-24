import { createEffect, For, Show } from 'solid-js';
import { t } from '../i18n/useLocale';

/**
 * 错误上报同意弹窗:默认不上报,开启前必须见过这份说明(记录什么、不含什么)。
 *
 * 范式同 UpgradeModal:不用 `showModal()`(top-layer 会盖住 toast,见那边的
 * 类注释),改普通 `open` + z-40;Esc 由 App 收口,背景点击由 modal-backdrop 兜住。
 */
export default function ConsentDialog(props: {
  open: boolean;
  granted: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onClose: () => void;
}) {
  let dialogEl: HTMLDialogElement | undefined;

  createEffect(() => {
    const el = dialogEl;
    if (el == null) return;
    if (props.open) el.setAttribute('open', '');
    else el.removeAttribute('open');
  });

  const items = (): string[] => [
    t('telemetry.item.error'),
    t('telemetry.item.identity'),
    t('telemetry.item.version'),
  ];

  return (
    <dialog
      ref={(el) => {
        dialogEl = el;
      }}
      class="modal z-40"
      aria-label={t('telemetry.title')}
      onClose={() => props.onClose()}
    >
      <div class="modal-box flex max-w-sm flex-col gap-3">
        <h3 class="shrink-0 font-medium text-sm">{t('telemetry.title')}</h3>
        <p class="shrink-0 text-xs leading-relaxed text-base-content/80">
          {t('telemetry.body')}
        </p>
        <ul class="flex shrink-0 flex-col gap-1.5 rounded-box border border-base-300 bg-base-200 px-3 py-2 text-xs leading-relaxed">
          <For each={items()}>
            {(item) => (
              <li class="flex gap-1.5">
                <span aria-hidden="true" class="text-base-content/50">
                  ·
                </span>
                <span class="min-w-0 flex-1">{item}</span>
              </li>
            )}
          </For>
        </ul>
        <div class="modal-action mt-0 shrink-0 justify-between">
          <Show
            when={!props.granted}
            fallback={
              <>
                <button
                  type="button"
                  class="btn btn-xs btn-ghost"
                  onClick={() => props.onClose()}
                >
                  {t('panel.close')}
                </button>
                <button
                  type="button"
                  class="btn btn-xs btn-primary"
                  onClick={() => props.onDisable()}
                >
                  {t('telemetry.disable')}
                </button>
              </>
            }
          >
            <button
              type="button"
              class="btn btn-xs btn-ghost"
              onClick={() => props.onClose()}
            >
              {t('telemetry.decline')}
            </button>
            <button
              type="button"
              class="btn btn-xs btn-primary"
              onClick={() => props.onEnable()}
            >
              {t('telemetry.enable')}
            </button>
          </Show>
        </div>
      </div>
      {/* 遮罩:真 button + form method=dialog(仓库纪律:不给 div 挂 onClick) */}
      <form method="dialog" class="modal-backdrop">
        <button type="submit" aria-label={t('panel.close')}>
          {t('panel.close')}
        </button>
      </form>
    </dialog>
  );
}
