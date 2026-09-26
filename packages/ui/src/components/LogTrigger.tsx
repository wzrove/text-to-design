import { Show } from 'solid-js';
import { t } from '../i18n/useLocale';

/** 未读条数上限:三位数会把 360 宽页头上的平台/端口挤没,超了只报「99+」 */
const MAX_SHOWN = 99;

/**
 * 常态:一颗与平台/端口同级的幽灵钮 —— 它是工具,不是状态,不该跟状态徽章抢视线。
 * 有未读错误:换成与状态徽章同一套「淡底组合」的实心胶囊,页头由此有了第二个色块,
 * 而它代表的是另一根轴:状态徽章只说通道(绿=已连接),说不出「连上了但一直在报错」。
 */
const HEALTHY_CLS = 'text-base-content/60 hover:text-base-content/80';
const UNREAD_CLS =
  'border border-error/25 bg-error/10 text-error hover:bg-error/25';

/**
 * 日志入口。
 *
 * 它是日志抽屉唯一的常驻信号位,要同时做到两件事:
 *
 * ① 找得到。图标用终端符(`>_`)而不是三横线,旁边常驻「日志」二字 —— 三横线既不
 *    说明是终端也不说明是清单,而裸图标在页头只会被当成装饰跳过。页头腾掉标题与
 *    Logo 后这点宽度花得起。
 * ② 出得来。有未读错误时整颗升级成 error 淡底胶囊并报出条数 —— 这一态比「已连接」
 *    更响是有意的:绿色是期望中的稳态,而日志里的错误计数只增不减(同一行复发会
 *    合并计数),它是页头上唯一能说出「连上了,但一直在出错」的地方。
 */
export default function LogTrigger(props: {
  /** 未读错误条数(抽屉打开或关闭时清零,见 App.tsx) */
  unread: number;
  open: boolean;
  onClick: () => void;
  /** 函数式 ref:关闭抽屉时由调用方把焦点还给这里 */
  ref?: (el: HTMLButtonElement) => void;
}) {
  const hasUnread = (): boolean => props.unread > 0;
  const shown = (): string =>
    props.unread > MAX_SHOWN ? `${MAX_SHOWN}+` : String(props.unread);

  return (
    <>
      <button
        type="button"
        ref={props.ref}
        class={`btn btn-ghost btn-xs shrink-0 gap-1 px-2 ${
          hasUnread() ? UNREAD_CLS : HEALTHY_CLS
        }`}
        aria-label={
          hasUnread()
            ? t('log.trigger.unread', { count: props.unread })
            : t('log.trigger')
        }
        aria-haspopup="dialog"
        aria-expanded={props.open}
        title={t('log.trigger.title')}
        onClick={props.onClick}
      >
        <svg
          class="size-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 17l6-6-6-6" />
          <path d="M12 19h8" />
        </svg>
        <Show when={hasUnread()} fallback={<span>{t('log.trigger')}</span>}>
          {/* 数字与文字分列:数字 mono 定宽,条数增长时按钮宽度不跟着抖 */}
          <span class="font-mono tabular-nums">{shown()}</span>
          <span>{t('log.trigger.unit')}</span>
        </Show>
      </button>
      {/* 可见部分只有计数变化,不打断当前朗读;节点常驻故另起一处 sr-only 载体 */}
      <span role="status" aria-live="polite" class="sr-only">
        {hasUnread() ? t('log.trigger.announce', { count: props.unread }) : ''}
      </span>
    </>
  );
}
