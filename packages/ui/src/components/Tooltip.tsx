import type { JSX } from 'solid-js';

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
 * **`align` 是给这块窄面板用的**:气泡宽度在 index.css 里收了口,贴哪条边决定它
 * 会不会越出面板右缘被根滚动容器裁掉 —— 最右那颗按钮居中放会伸出去一截。
 * 无键盘负担:daisyUI 的 tooltip 在 `:focus-visible` 时同样出现,提示不只喂鼠标。
 */
export default function Tooltip(props: {
  tip: string;
  /** 气泡贴按钮的哪条边;缺省居中(只有左右留白都够时才安全) */
  align?: 'start' | 'center' | 'end';
  /** 附加到包装元素(如 `shrink-0`):它是页头里的 flex 项,不再是按钮本身 */
  class?: string;
  children: JSX.Element;
}) {
  const alignClass = (): string => {
    if (props.align === 'start') return 'tooltip-start';
    if (props.align === 'end') return 'tooltip-end';
    return '';
  };

  return (
    <span
      class={`tooltip tooltip-bottom ${alignClass()} ${props.class ?? ''}`}
      data-tip={props.tip}
    >
      {props.children}
    </span>
  );
}
