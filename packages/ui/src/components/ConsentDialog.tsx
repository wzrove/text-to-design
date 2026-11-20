import { For, Show } from 'solid-js';
import { t } from '../i18n/useLocale';
import DialogShell from './DialogShell';

/**
 * 错误上报同意弹窗:默认不上报,开启前必须见过这份说明(记录什么、不含什么)。
 * 外壳见 DialogShell。
 */
export default function ConsentDialog(props: {
  open: boolean;
  granted: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onClose: () => void;
}) {
  const items = (): string[] => [
    t('telemetry.item.error'),
    t('telemetry.item.identity'),
    t('telemetry.item.version'),
  ];

  return (
    <DialogShell
      open={props.open}
      title={t('telemetry.title')}
      onClose={props.onClose}
    >
      <div class="flex shrink-0 flex-col gap-2 p-2.5">
        <p class="text-xs leading-relaxed text-base-content/80">
          {t('telemetry.body')}
        </p>
        <ul class="flex flex-col gap-1 rounded-box border border-base-300 bg-base-200 px-2.5 py-1.5 text-xs leading-relaxed">
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
              // 关掉上报不是「主操作」,给中性实心钮,不占主题色
              <button
                type="button"
                class="btn btn-xs ml-auto"
                onClick={() => props.onDisable()}
              >
                {t('telemetry.disable')}
              </button>
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
    </DialogShell>
  );
}
