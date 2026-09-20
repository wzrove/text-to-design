import { createEffect, onCleanup } from 'solid-js';
import {
  clampPanelHeight,
  PANEL_HEIGHT_SLACK,
  PANEL_RESIZE_STEP,
  type UiResizeMessage,
} from 'text-to-design-shared';
import { postToCode } from '../bridge/codeChannel';

/**
 * 面板高度同步:把内容自然高度推给插件 code 侧去改窗口尺寸(0014)。
 *
 * 触发源是 ResizeObserver,不是「选中变化」之类的业务事件 —— 后者会让窗口跟着
 * 每一次画布点选变高变矮(`selectionchange` 是高频的,plugin.ts 里就挂在它上面
 * 做推送),而真正改变内容高度的只有布局本身:连接提示换形态、能力表开合、
 * 列表增删行。换句话说,窗口只在「结构性变化」时动。
 *
 * 没有 `min` 之类的额外入参:下限已经写在 `clampPanelHeight` 里。此前曾按「抽屉
 * 打开就把下限抬到默认高度」来给日志让位,但那等于**开合抽屉都会改变窗口尺寸**
 * —— 面板整体跳一下,读起来就是抖动。抽屉改成自己取窗口的 85%,窗口只由内容决定。
 */
export default function PanelHeightSync(props: {
  /** 宿主支持 ui.resize 才启用;false 时本组件完全不做事(布局已在 App 侧降级) */
  active: boolean;
  /** 测量对象:面板根元素。自适应布局下它不定高,高度即内容高度 */
  target: () => HTMLElement | undefined;
}) {
  createEffect(() => {
    const active = props.active;
    if (!active) return;
    const el = props.target();
    if (!el) return;
    // 老 webview 可能没有 ResizeObserver:静默不发请求即可。布局判定在 App 侧,
    // 与「能不能观测」无关 —— 这里缺席不该把面板降级成另一种布局
    if (typeof ResizeObserver === 'undefined') return;

    // -1 保证首帧一定发一次:初始窗口是 PANEL_HEIGHT_DEFAULT,收敛到内容高
    // 这一步必须发生,否则自适应等于没开
    let sent = -1;
    const push = (): void => {
      // 用 getBoundingClientRect 而不是 offsetHeight:后者是取整后的整数,
      // 内容真实高度带小数时它可能给出比内容**矮**的值,那正是抖动回环的起点
      const raw =
        Math.ceil(el.getBoundingClientRect().height) + PANEL_HEIGHT_SLACK;
      // 向上吸附到步长:让「差一点点」的变化落进同一档、不再驱动窗口。
      // 吸附只会让窗口偏高(顶多多出一段同色空白),方向上与 SLACK 一致
      const snapped = Math.ceil(raw / PANEL_RESIZE_STEP) * PANEL_RESIZE_STEP;
      const height = clampPanelHeight(snapped);
      if (Math.abs(height - sent) < PANEL_RESIZE_STEP) return;
      sent = height;
      const msg: UiResizeMessage = { type: 'ui_resize', height };
      postToCode(msg);
    };

    const observer = new ResizeObserver(push);
    observer.observe(el);
    push();
    onCleanup(() => observer.disconnect());
  });

  return null;
}
