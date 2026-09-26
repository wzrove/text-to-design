import { type JSX, Show } from 'solid-js';
import { CHEVRON_PATH, CHEVRON_VIEW_BOX } from 'text-to-design-shared';
import { t } from '../i18n/useLocale';

/**
 * 展开面板:面板里所有「标题行 + 可折叠正文」的唯一实现(见 0026)。
 *
 * 为什么必须统一:同一个交互原先在 SelectionCard / CapabilityCard / LogDrawer
 * 各写了一遍,三处的触发器、状态归属、内容盒尺寸**全都不一样** —— 同一颗箭头有三种
 * 画法,收起态有的藏内容有的藏整块。读起来是三个东西,实际是一件事。
 *
 * 三处形状本来就不同,所以组件按 `variant` 出两种形态,不是两套组件:
 * - `card` —— 内联在面板流里的卡片;展开后多高仍由调用方定(`bodyClass` 里的
 *   `max-h-*` 或 `flex-1`),因为「多高算够」只有内容自己知道;
 * - `sheet` —— 底部滑出的浮层(`fixed`),自带遮罩与 `aria-modal`。
 *
 * **状态归调用方**(`open` / `openChange` 受控):高度下限之类的旁路需求挂在与状态
 * 同一处(见 App.tsx 的 `floor`),状态藏进组件里会让「谁在开」变成两处真相。
 *
 * **触发器是独立子组件**(`Trigger`),不是面板的 prop:标题行里还要排徽章、复制钮、
 * 刷新钮,而它们的排布各卡不同 —— 把整行交给组件,就得为每张卡长一个新的 prop。
 * 组件只负责「正文与触发器的显隐关系」,行内布局留给调用方。
 *
 * **`header` 与 `children` 是两处**,不是一处:标题行必须留在流里(它是收起态的
 * 唯一可见内容,也是唯一的展开入口),正文才是收起时被隐藏的那部分。两者混在一个
 * slot 里就没有边界可依 —— 收起时连标题行一起藏掉,面板上就只剩一个看不懂的空盒。
 */
export interface CollapsibleSectionProps {
  /** 展开态(受控) */
  open: boolean;
  openChange: (open: boolean) => void;
  /** 形态:`card` 内联卡片(默认),`sheet` 底部浮层 */
  variant?: 'card' | 'sheet';
  /** card:面板根容器附加类,承载 `flex-1` 这类「吃剩余高度」的口径 */
  class?: string;
  /** card:正文容器附加类,承载 `max-h-*` / `flex-1` 与内边距 */
  bodyClass?: string;
  /** card:正文容器的 `id`,供触发器 `aria-controls` 指向 */
  bodyId?: string;
  /**
   * 标题行:常驻,收起时也留在流里。
   * 触发器(`Trigger`)就排在这一行里,所以收起后仍够得着它。
   */
  header: JSX.Element;
  /** sheet:浮层的可访问名(标题);card 态用它给正文做 `aria-label` 的兜底 */
  label?: string;
  /** 可折叠的正文 */
  children: JSX.Element;
}

export default function CollapsibleSection(props: CollapsibleSectionProps) {
  const isSheet = (): boolean => props.variant === 'sheet';

  return (
    <Show
      when={isSheet()}
      fallback={
        /*
          卡片根是 **flex column** 而不是裸 block:`bodyClass` 里的 `flex-1` 与
          `min-h-0` 都是「作 flex 子项」才成立的口径(选中卡在降级布局下要吃剩余
          高度)。父层是 block 时 `flex-1` 无从解析,正文会长过卡片、溢出到下一块
          内容上,看着就是「滚动高度被截断」。

          `overflow-hidden` 同时收两件事:圆角是画在根上的,不裁剪时正文边框与
          悬停底色会顶出圆角;以及给上面的高度约定兜个底 —— 万一调用方给的
          高度口径写歪,也裁在卡片里而不是糊到面板其它区块上。
        */
        <section
          class={`flex flex-col overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-sm ${
            props.class ?? ''
          }`}
        >
          {/* 标题行在正文之外、且在流里:收起后它是卡片上唯一剩下的东西 */}
          {/* `shrink-0`:标题行不参与压缩,省下的高度全归正文的滚动区 */}
          <div class="shrink-0">{props.header}</div>
          <div
            id={props.bodyId}
            hidden={!props.open}
            class={props.bodyClass ?? ''}
          >
            {props.children}
          </div>
        </section>
      }
    >
      <Show when={props.open}>
        {/*
          fixed 而不是 absolute:自适应布局下根元素高度 = 内容高度,而窗口可能比
          它高(夹取下限、宿主对高度的夹取、收敛前的瞬时)—— 按根元素定位的浮层会
          矮一截,窗口多出来的那部分露在遮罩外面。锚视口两种布局都对。
        */}
        <div class="fixed inset-0 z-30">
          {/* 遮罩用真 button:键盘可达,也避开给 div 挂 onClick 的 a11y 问题 */}
          <button
            type="button"
            aria-label={t('panel.close')}
            class="panel-enter absolute inset-0 h-full w-full cursor-default bg-black/35"
            onClick={() => props.openChange(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label={props.label}
            class="panel-enter absolute inset-x-0 bottom-0 flex h-[85%] flex-col rounded-t-xl border-base-300 border-t bg-base-100 shadow-lg"
          >
            {/* `shrink-0` 同卡片态:头部不参与压缩,省下的高度全归正文滚动区 */}
            <div class="shrink-0">{props.header}</div>
            <div
              class={`relative flex min-h-0 flex-1 flex-col ${
                props.bodyClass ?? ''
              }`}
            >
              {props.children}
            </div>
          </section>
        </div>
      </Show>
    </Show>
  );
}

/**
 * 展开/收起触发器:一颗**图标按钮**。
 *
 * 为什么是图标而不是「展开 / 收起」文字对:文字按钮在两种状态下的宽度会变,而它两侧
 * 排着徽章与动作钮 —— 宽度一变整行跟着抖。图标宽度恒定,方向由箭头自己说(名字由
 * `aria-label` 供给屏读器)。几何取自 shared/panel.ts,与其它地方的箭头同源,不各画一颗。
 */
export function Trigger(props: {
  open: boolean;
  onClick: () => void;
  /** 指向正文容器的 `id`,给 `aria-controls` 用 */
  controls?: string;
  /** 读屏器念的名字,缺省用通用的「展开 / 收起」文案 */
  label?: string;
  class?: string;
}) {
  const label = (): string =>
    props.label ?? t(props.open ? 'panel.collapse' : 'panel.expand');

  return (
    <button
      type="button"
      /* `btn-square` 是图标按钮的既有口径(不靠 px 手调内边距撑方) */
      class={`btn btn-square btn-ghost btn-xs shrink-0 text-base-content/60 hover:text-base-content ${
        props.class ?? ''
      }`}
      aria-label={label()}
      aria-expanded={props.open}
      aria-controls={props.controls}
      title={label()}
      onClick={props.onClick}
    >
      <svg
        class={`size-3.5 shrink-0 transition-transform duration-200 ${
          props.open ? 'rotate-180' : ''
        }`}
        viewBox={CHEVRON_VIEW_BOX}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d={CHEVRON_PATH} />
      </svg>
    </button>
  );
}
