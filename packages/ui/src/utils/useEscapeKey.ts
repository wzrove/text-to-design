import { createEffect, onCleanup, type Accessor } from 'solid-js';

/**
 * 浮层打开时把 Escape 收口到一个回调。
 *
 * 为什么要收:此前 App 里三条 effect 逐字重复(同意弹窗 / 日志抽屉 / 升级弹窗),
 * 且 LogDrawer 自己也注册了一份 —— 同一次按键跑两遍关闭逻辑。浮层开闭与焦点归还
 * 的端点分处两个组件,只有 App 同时握着两端,所以收口点本就在 App;这里只是把
 * 重复的注册/注销样板抽掉,不搬动职责。
 *
 * 判据用 open() 而非 props.open:调用方传 accessor,关掉时 effect 重新跑即自动注销。
 */
export function useEscapeKey(open: Accessor<boolean>, onEscape: () => void): void {
  createEffect(() => {
    if (!open()) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });
}
