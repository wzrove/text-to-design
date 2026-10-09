import { createEffect, For, Show } from 'solid-js';
import { t } from '../i18n/useLocale';
import { copyWithToast } from '../utils/clipboard';

/** 插件包下载地址(与 ConnectionHint 的 GITHUB_URL 同为组件内常量) */
const RELEASES_URL = 'https://github.com/wzrove/text-to-design/releases';

/**
 * 升级步骤弹窗(见 0038)。
 *
 * **为什么不用 `showModal()`**:它把 `<dialog>` 送进 **top-layer**,而 top-layer
 * 恒定压在所有 `z-index` 之上 —— 于是弹窗里点「复制」弹出的 toast(`z-50`)被
 * 盖住,反馈等于没有。提 toast 的 z-index 治不了这个(不在同一层,比不了),
 * 所以改成普通 `open` + 把弹窗压到 `z-40`:与 toast 同层,层级才比得成。
 * 代价是没有原生 Esc 与背景 inert:Esc 由 App 收口(与日志抽屉同一条纪律),
 * 背景点击由 daisyUI 的 `.modal-backdrop` 兜住。
 *
 * 与仓库另两处浮层的分工:Esc 与焦点归还仍由调用方(App.tsx)收口 ——
 * 关闭要连带把焦点还给页头那颗钮,而两端分处两个组件,只有 App 同时握着。
 * 这里只负责「开/关」与内容。
 *
 * **不自动升级**:只给步骤和一段可复制给 AI 助手的指令。跨进程改用户的安装
 * 不在面板的职责里,做错了代价远大于多点一下。
 */
export default function UpgradeModal(props: {
  open: boolean;
  current: { ui: string; mcp: string };
  latest: { ui: string | null; mcp: string | null };
  onClose: () => void;
}) {
  let dialogEl: HTMLDialogElement | undefined;

  createEffect(() => {
    const el = dialogEl;
    if (el == null) return;
    // daisyUI 的 `.modal[open]` 负责显示;不用 showModal(见类注释的 top-layer 说明)
    if (props.open) el.setAttribute('open', '');
    else el.removeAttribute('open');
  });

  const rows = () => [
    {
      label: t('upgrade.plugin.label'),
      current: props.current.ui,
      latest: props.latest.ui,
    },
    {
      label: t('upgrade.service.label'),
      current: props.current.mcp,
      latest: props.latest.mcp,
    },
  ];

  /**
   * 一步的两种形态:整句(`text`),或 head / 链接 / tail 三段(`link` 存在时)。
   * ② 走后者 —— 包名本身要能点,整句渲染就只能整句可点。
   */
  type Step = { text?: string; head?: string; link?: string; tail?: string };

  const steps = (): Step[] => [
    { text: t('upgrade.step.service') },
    {
      head: t('upgrade.step.plugin.head'),
      link: 'text-to-design-ui',
      tail: t('upgrade.step.plugin.tail'),
    },
    { text: t('upgrade.step.verify') },
  ];

  /** 复制给 AI 助手的指令:版本与下载地址都带上,省得它再问一遍 */
  const promptText = (): string =>
    `${t('upgrade.prompt', {
      ui: props.current.ui,
      uiLatest: props.latest.ui ?? props.current.ui,
      mcp: props.current.mcp,
      mcpLatest: props.latest.mcp ?? props.current.mcp,
    })}\n${RELEASES_URL}`;

  return (
    <dialog
      ref={(el) => {
        dialogEl = el;
      }}
      class="modal z-40"
      aria-label={t('upgrade.modal.title')}
      onClose={() => props.onClose()}
    >
      {/*
        定高四段式:标题(固定)/ 版本信息(固定)/ 步骤(滚动)/ 操作条(固定)。
        高度写 `min(24rem,80vh)` 而不是纯 vh —— 面板窗口可能被压到很矮(自适应
        高度下内容少时),纯 vh 会把操作条挤出可视区。

        只有步骤区滚:版本信息是**读一遍就够的对照表**,它跟着滚会失去「我当前在
        哪、要去哪」这个锚点;而步骤是逐条执行的长文,才是需要滚动的那一段。
        所以版本块做成凹进 base-200 的信息块与滚动区在视觉上分开。

        滚动区 `min-h-0` 是 flex 列里滚动容器的必需项:少了它,内容会把容器撑高、
        `overflow-y-auto` 永远不生效(滚动落到外层,操作条被顶走)。
      */}
      <div class="modal-box flex h-[min(24rem,80vh)] max-w-sm flex-col gap-3">
        <h3 class="shrink-0 font-medium text-sm">{t('upgrade.modal.title')}</h3>

        {/*
          两列一行,不再两行:版本对照是「扫一眼」的信息,纵向空间该让给步骤。
          用 `x → y` 表达(current / latest 两个词退到 sr-only,屏读器仍读得出
          「当前 0.7.0 最新 0.8.0」),视觉上省掉两个标签的宽度。
          单列时英文 `Background service` 会把行撑破,故 en 侧标签同步收到 `Service`。
        */}
        <div class="grid shrink-0 grid-cols-2 gap-2 rounded-box border border-base-300 bg-base-200 px-2 py-1.5 text-[11px]">
          <For each={rows()}>
            {(row) => (
              <div class="flex min-w-0 items-center gap-1">
                <span class="shrink-0 text-base-content/70">{row.label}</span>
                <span class="truncate">{row.current}</span>
                <Show when={row.latest != null}>
                  <span aria-hidden="true">→</span>
                  <span class="truncate text-primary">{row.latest}</span>
                </Show>
                <span class="sr-only">
                  {`${t('upgrade.current', { version: row.current })} ${t('upgrade.latest', { version: row.latest ?? row.current })}`}
                </span>
              </div>
            )}
          </For>
        </div>

        <ol class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain text-xs leading-relaxed">
          <For each={steps()}>
            {(step) => (
              <li>
                {step.head ?? ''}
                <Show when={step.link != null}>
                  <a
                    href={RELEASES_URL}
                    target="_blank"
                    rel="noreferrer"
                    class="link text-primary"
                  >
                    {step.link}
                  </a>
                </Show>
                {step.head != null ? step.tail : step.text}
              </li>
            )}
          </For>
        </ol>

        <div class="modal-action mt-0 shrink-0 justify-between">
          <button
            type="button"
            class="btn btn-xs btn-primary"
            onClick={() => copyWithToast(promptText())}
          >
            {t('upgrade.copy')}
          </button>
          <button
            type="button"
            class="btn btn-xs btn-ghost"
            onClick={() => props.onClose()}
          >
            {t('panel.close')}
          </button>
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
