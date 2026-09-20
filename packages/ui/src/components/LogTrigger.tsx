import { Show } from 'solid-js';

/**
 * 日志入口。
 *
 * 日志抽屉常态不可见,这个图标钮是它唯一的常驻信号位 —— 所以刻意压到最轻:
 * 图标无文字、/50 灰、只在「有未读错误」时染成 error 色并露出条数。
 * 这是有意的取舍:面板只有 360 宽,header 已被环境徽章/状态徽章/端口占满,
 * 一个带文字的按钮会把标题挤没;而日志本身也不该有名字那样的存在感。
 */
export default function LogTrigger(props: {
  /** 未读错误条数(抽屉打开或关闭时清零,见 App.tsx) */
  unread: number;
  open: boolean;
  onClick: () => void;
  /** 函数式 ref:关闭抽屉时由调用方把焦点还给这里 */
  ref?: (el: HTMLButtonElement) => void;
}) {
  return (
    <>
      <button
        type="button"
        ref={props.ref}
        class={`btn btn-ghost btn-xs gap-0.5 px-1.5 ${
          props.unread > 0
            ? 'text-error'
            : 'text-base-content/50 hover:text-base-content/80'
        }`}
        aria-label={
          props.unread > 0 ? `日志,有 ${props.unread} 条新错误` : '日志'
        }
        aria-haspopup="dialog"
        aria-expanded={props.open}
        title="日志:MCP 调用与连接事件"
        onClick={props.onClick}
      >
        <svg
          class="size-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <Show when={props.unread > 0}>
          <span class="font-mono text-[10px]">{props.unread}</span>
        </Show>
      </button>
      {/* 可见部分只有计数变化,不打断当前朗读;节点常驻故另起一处 sr-only 载体 */}
      <span role="status" aria-live="polite" class="sr-only">
        {props.unread > 0 ? `有 ${props.unread} 条新错误` : ''}
      </span>
    </>
  );
}
