import { createSignal } from 'solid-js';

/**
 * 轻提示(toast)的唯一状态源与出口(见 0037)。
 *
 * **为什么是模块级信号**:调用点散在页头、选中卡、连接提示条、日志抽屉四处组件里,
 * 挂载点却只有一个(App 里的 ToastHost)。走 context 的话四个调用组件都得先从
 * Provider 取一次,取到的还是同一份状态 —— 铺出去的只是转发。尺子与 `theme.ts`
 * 一致:全面板只有一份、且没有第二个合法取值的 UI 状态,不值得为它加一层 Provider。
 * (这不是 0002 反对的「模块级可变单例」:这里没有第二份状态,外部也只能经
 * `showToast` 改。)
 *
 * 与 `useLocale` 一样是模块级信号的另一层收益:命令式代码(不在组件树里)也能弹。
 */
export type ToastLevel = 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  level: ToastLevel;
}

/** 可见时长(ms):够读完一句话,又不至于赖在面板上不走 */
const DURATION_MS = 2400;

/** 同屏上限:堆多了会盖住右下角那块(日志抽屉的「新日志」按钮就在那儿) */
const MAX_VISIBLE = 3;

const [toasts, setToasts] = createSignal<ToastItem[]>([]);

export { toasts };

let nextId = 1;

/**
 * 弹一条提示。
 *
 * 同文案(+同级)只保留最新一条并重新计时:连点「复制」不该糊一屏,而三条一模
 * 一样的提示同时淡出,读起来像卡顿。旧条目的定时器仍会到期并调 `dismissToast`,
 * 按 id 找不到人 —— 无害,故不必回收句柄。
 */
export function showToast(
  message: string,
  level: ToastLevel = 'success',
): void {
  const id = nextId++;
  setToasts((list) => [
    ...list
      .filter((item) => item.message !== message || item.level !== level)
      .slice(1 - MAX_VISIBLE),
    { id, message, level },
  ]);
  window.setTimeout(() => dismissToast(id), DURATION_MS);
}

/** 提前撤下(点提示本身即关) */
export function dismissToast(id: number): void {
  setToasts((list) => list.filter((item) => item.id !== id));
}
