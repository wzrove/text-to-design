import { createEffect, type JSX } from 'solid-js';
import { t } from '../i18n/useLocale';

/**
 * 弹窗外壳:标题行 + 关闭钮 + 内容区 + 遮罩。
 *
 * **为什么不用 `showModal()`**:它把 `<dialog>` 送进 **top-layer**,而 top-layer
 * 恒定压在所有 `z-index` 之上 —— 于是弹窗里点「复制」弹出的 toast(`z-50`)被
 * 盖住,反馈等于没有。提 toast 的 z-index 治不了这个(不在同一层,比不了),
 * 所以改成普通 `open` + 把弹窗压到 `z-40`:与 toast 同层,层级才比得成。
 * 代价是没有原生 Esc 与背景 inert:Esc 由 App 收口(与日志抽屉同一条纪律),
 * 背景点击由 daisyUI 的 `.modal-backdrop` 兜住。
 *
 * 这里只负责「开/关」与外壳;Esc 与焦点归还仍由调用方(App.tsx)收口 ——
 * 关闭要连带把焦点还给触发钮,而两端分处两个组件,只有 App 同时握着。
 */
export default function DialogShell(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** 追加到 modal-box 的类(如定高 h-[min(24rem,80vh)]) */
  class?: string;
  children: JSX.Element;
}) {
  let dialogEl: HTMLDialogElement | undefined;

  createEffect(() => {
    const el = dialogEl;
    if (el == null) return;
    // daisyUI 的 `.modal[open]` 负责显示;不用 showModal(见类注释的 top-layer 说明)
    if (props.open) el.setAttribute('open', '');
    else el.removeAttribute('open');
  });

  return (
    <dialog
      ref={(el) => {
        dialogEl = el;
      }}
      class="modal z-40"
      aria-label={props.title}
      onClose={() => props.onClose()}
    >
      <div
        class={`modal-box flex max-w-sm flex-col border border-base-300 p-0 shadow-lg ${
          props.class ?? ''
        }`}
      >
        <div class="flex shrink-0 items-center gap-2 border-base-200 border-b px-2.5 py-1.5">
          <h3 class="min-w-0 flex-1 truncate text-xs font-bold text-base-content/70">
            {props.title}
          </h3>
          {/* 关闭收到标题行(与日志抽屉同口径),正文区只留给决定本身 */}
          <button
            type="button"
            class="btn btn-square btn-ghost btn-xs text-base-content/60 hover:text-base-content"
            aria-label={t('panel.close')}
            onClick={() => props.onClose()}
          >
            ✕
          </button>
        </div>
        {props.children}
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
