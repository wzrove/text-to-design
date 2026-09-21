import { createSignal, For, Show } from 'solid-js';
import {
  LOCALES,
  type LocaleChoice,
  SYSTEM_CHOICE,
} from 'text-to-design-shared';
import {
  choice,
  locale,
  selectLocale,
  systemLocale,
  t,
} from '../i18n/useLocale';

/**
 * 语言切换器:紧凑下拉(`跟随系统` / `中文` / `English`)。
 *
 * **为什么不是原生 `<select>`**:它按最长选项撑宽度(「跟随系统 / English」要 70px 上下),
 * 而页头这一行要塞下状态徽章、挽救动作、平台端口、语言、日志 —— 360 宽下这是最紧张的一行。
 * 下拉把常驻宽度压到 1–2 个字符(`中` / `EN`),全名留给展开后的选项。
 *
 * **为什么不用 daisyUI 的 `<details class="dropdown">`**:原生 `<details>` 不响应 Escape、
 * 也不在点外部时收起,而这两条在插件面板里都必须有(面板本身就在一个 iframe 里,用户的
 * 「点到别处」几乎总发生在面板内部)。这里自己写:一层 fixed 兜底遮罩 + 容器上的 Escape,
 * 与 LogDrawer 同一套做法 —— 它已经是这个面板里唯一另一个浮层。
 *
 * 浮层是 `fixed` / `absolute`,不进文档流,所以不影响 PanelHeightSync 量出的内容高度(0014)。
 * 语言名不翻译(`中文` / `English` 两侧都写原样):语言选择器的惯例是显示**自称**,
 * 只有 `跟随系统` 需要译。
 */

/** 顺序即「跟随系统 → 具体语言」,默认档在最前 */
const OPTIONS: readonly LocaleChoice[] = [SYSTEM_CHOICE, ...LOCALES];

/** 触发器上的缩写,按**当前生效**的 locale 取(而非用户选的那一档) */
function abbr(): string {
  return locale() === 'zh-CN' ? t('locale.abbr.zh-CN') : t('locale.abbr.en');
}

/** 选项全名 */
function labelOf(value: LocaleChoice): string {
  return value === SYSTEM_CHOICE ? t('locale.system') : t(`locale.${value}`);
}

export default function LocaleSwitch() {
  const [open, setOpen] = createSignal(false);
  let triggerEl: HTMLButtonElement | undefined;

  const close = (): void => {
    if (!open()) return;
    setOpen(false);
    // 焦点还给触发器:下拉带遮罩,关掉后焦点不能掉在 body 上
    triggerEl?.focus();
  };

  /**
   * Escape 收口挂在容器上而不是 document 上:触发器、遮罩、菜单项**都在容器内**,
   * 事件从它们冒泡上来即可;这样不用注册全局监听,也就不用管解绑。
   */
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  const title = (): string =>
    choice() === SYSTEM_CHOICE
      ? t('locale.title.followSystem', {
          locale: labelOf(systemLocale() ?? locale()),
        })
      : t('locale.title.fixed', { locale: labelOf(locale()) });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 纯转发 Escape,真正的交互元素都在内部
    <div class="relative shrink-0" onKeyDown={onKeyDown}>
      <button
        ref={(el) => {
          triggerEl = el;
        }}
        type="button"
        class="btn btn-ghost btn-xs shrink-0 gap-0.5 px-1 text-base-content/60 hover:text-base-content/80"
        aria-label={t('locale.menu')}
        aria-haspopup="menu"
        aria-expanded={open()}
        title={title()}
        onClick={() => setOpen((v) => !v)}
      >
        <span class="font-mono text-[10px]">{abbr()}</span>
        <span class="text-[8px] leading-none" aria-hidden="true">
          ▾
        </span>
      </button>

      <Show when={open()}>
        {/* 点面板内任何别处即收起;遮罩 fixed 且零占位,不影响面板高(0014) */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          class="fixed inset-0 z-40 cursor-default"
          onClick={close}
        />
        <ul
          aria-label={t('locale.menu')}
          class="menu absolute top-full right-0 z-50 mt-1 w-36 rounded-box border border-base-300 bg-base-100 p-1 text-xs shadow-lg"
        >
          <For each={OPTIONS}>
            {(value) => (
              <li role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={choice() === value}
                  class={`flex items-center gap-1.5 rounded px-2 py-1 ${
                    choice() === value ? 'font-bold' : ''
                  }`}
                  onClick={() => {
                    selectLocale(value);
                    close();
                  }}
                >
                  {/* 选中态不只靠字重:字形标记是第二重区分(同 LogDrawer 的行首标记) */}
                  <span class="w-3 shrink-0" aria-hidden="true">
                    {choice() === value ? '✓' : ''}
                  </span>
                  <span class="min-w-0 flex-1 truncate">{labelOf(value)}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
