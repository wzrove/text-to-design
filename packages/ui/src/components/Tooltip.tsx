import {
  createEffect,
  createSignal,
  type JSX,
  on,
  onCleanup,
  onMount,
} from 'solid-js';

type Align = 'center' | 'start' | 'end';

/** 气泡与面板边缘之间的余量:贴边显得挤,顺带躲开 1px 的取整误差 */
const GUTTER = 4;

/** 量不到气泡实际宽度时的兜底,取 index.css 里那条 `max-width: 12rem` */
const FALLBACK_WIDTH = 192;

/**
 * 类名只能写成字面量:Tailwind 按源码里的字符串扫出用到的工具类,`tooltip-${align()}`
 * 这种拼法在产物里根本不会有 `.tooltip-end` —— 实测三档对齐规则全被裁掉,气泡永远居中,
 * 于是撑出横向滚动条(加了 overflow-x-hidden 之后变成被切掉)。
 */
const ALIGN_CLASS: Record<Align, string> = {
  center: 'tooltip-center',
  start: 'tooltip-start',
  end: 'tooltip-end',
};

/** 横向夹住气泡的那个容器(面板根,`overflow-x-hidden`,见 App.tsx) */
function clipEl(el: Element): Element | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    if (getComputedStyle(n).overflowX !== 'visible') return n;
  }
  return null;
}

function clipBox(el: Element): { left: number; right: number } {
  const box = clipEl(el)?.getBoundingClientRect();
  return box
    ? { left: box.left, right: box.right }
    : { left: 0, right: document.documentElement.clientWidth };
}

/** 气泡是 `::before`(`width: max-content` + 12rem 上限),取布局后的真实宽度;
    老 webview 给不出 used value 时退到上限 —— 宁可多贴边,不越界 */
function bubbleWidth(el: Element): number {
  const style = getComputedStyle(el, '::before');
  const used = Number.parseFloat(style.width);
  if (Number.isFinite(used) && used > 0) return used;
  const max = Number.parseFloat(style.maxWidth);
  return Number.isFinite(max) && max > 0 ? max : FALLBACK_WIDTH;
}

/**
 * 悬浮提示:页头功能按钮的说明文字(见 0037)。用 daisyUI 的 `tooltip`,气泡由
 * `data-tip` 通过 `::before` 画出来,不再是原生 `title`。
 *
 * **为什么换掉原生 `title`**:它延迟约一秒才出、样式由宿主定、且长句会被 iframe
 * 边缘直接裁掉 —— 而页头那几颗按钮的说明恰恰都是长句(「相机已锁定:操作画布时
 * 不移动你的视口(点击改为跟随)」),裁一半就等于没有。
 *
 * **为什么必须包一层**:`tooltip` 类自带 `display: inline-block`,直接挂到 `.btn`
 * 上会被 button.css 的 `inline-flex` 盖掉(同层、文件在后),气泡的位置就取决于
 * 样式表顺序 —— 这种「今天能用」不能留。包一层后与按钮各自的类互不干涉。
 *
 * **对齐是量出来的,不是写死的**:气泡宽度由文字决定,而页头很窄(约 360),居中放
 * 在中间那颗按钮上没事、贴到右缘那颗就会越出裁剪边界。所以量一次「按钮中心 ± 半气泡
 * 宽」够不够,够就居中,不够就往有余量的一侧贴。
 *
 * 量的时机:hover/挂载/布局变/文案变。`:hover` 是纯 CSS 的,`mouseenter`/`focusin`
 * 这一帧还没画出来,改类正好赶上;气泡本身还有 75ms 过渡延迟。静止态也要保持对齐好 ——
 * 它既撑着根容器的可滚动宽度(故配套 `overflow-x-hidden`,见 App.tsx),一过期又会被
 * 那层裁剪直接切掉。daisyUI 的 tooltip 在 `:focus-visible` 时同样出现,提示不只喂鼠标。
 */
export default function Tooltip(props: {
  tip: string;
  /** 附加到包装元素(如 `shrink-0`):它是页头里的 flex 项,不再是按钮本身 */
  class?: string;
  children: JSX.Element;
}) {
  let host!: HTMLSpanElement;
  const [align, setAlign] = createSignal<Align>('center');

  const measure = (): void => {
    const rect = host.getBoundingClientRect();
    const box = clipBox(host);
    const half = bubbleWidth(host) / 2 + GUTTER;
    const center = rect.left + rect.width / 2;
    if (center - half >= box.left && center + half <= box.right) {
      setAlign('center');
    } else {
      setAlign(center + half > box.right ? 'end' : 'start');
    }
  };

  // 挂载即量一次(ResizeObserver 观察时先报一轮),此后跟着布局变化重量:
  // 页头会因连接态/未读胶囊重排,静止类一过期,气泡就被 overflow-x-hidden 切掉
  onMount(() => {
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    const clip = clipEl(host);
    if (clip) ro.observe(clip);
    onCleanup(() => ro.disconnect());
  });

  // 气泡宽度是文案的函数:切语言后按钮尺寸没变,宽度却变了
  createEffect(on(() => props.tip, measure));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 监听只为在气泡出现前量一次宽度,交互都在内部的按钮上
    <span
      ref={(el) => {
        host = el;
      }}
      class={`tooltip tooltip-bottom ${ALIGN_CLASS[align()]} ${props.class ?? ''}`}
      data-tip={props.tip}
      onMouseEnter={measure}
      onFocusIn={measure}
    >
      {props.children}
    </span>
  );
}
