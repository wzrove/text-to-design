import { createMemo, Show } from 'solid-js';
import type { MessageKey } from 'text-to-design-shared';
import { useBridge } from '../bridge/useBridge';
import { t } from '../i18n/useLocale';
import Tooltip from './Tooltip';

// 所有状态共用**无边框**的内联形态:一枚点(或转圈)+ 一行小字。
// 页头的彩色块让位给正文里的提示卡(未连接/被顶替时那张卡有完整引导);
// 这里只做「现在是什么档」的轻指示,避免同一状态在页头和卡片各占一块色块。
// 异常态靠语义文字色区分,健康态用中性字 + 绿点。
const TONE = {
  connected: 'text-base-content/65',
  connecting: 'text-info',
  waiting: 'text-warning',
  superseded: 'text-warning',
} as const;

const LABEL_KEY = {
  connected: 'status.connected.label',
  connecting: 'status.connecting.label',
  waiting: 'status.waiting.label',
  superseded: 'status.superseded.label',
} as const satisfies Record<
  'connected' | 'connecting' | 'waiting' | 'superseded',
  MessageKey
>;

const TITLE_KEY = {
  connected: 'status.connected.title',
  connecting: 'status.connecting.title',
  waiting: 'status.waiting.title',
  superseded: 'status.superseded.title',
} as const satisfies Record<
  'connected' | 'connecting' | 'waiting' | 'superseded',
  MessageKey
>;

type BadgeKey = keyof typeof LABEL_KEY;

export default function StatusBadge() {
  const { status } = useBridge();
  const key = createMemo<BadgeKey>(() => {
    const s = status();
    const k: BadgeKey =
      s === 'connected'
        ? 'connected'
        : s === 'connecting'
          ? 'connecting'
          : s === 'superseded'
            ? 'superseded'
            : 'waiting';
    return k;
  });
  return (
    <Tooltip tip={t(TITLE_KEY[key()])} class="shrink-0">
      <span
        role="status"
        aria-atomic="true"
        class={`inline-flex items-center gap-1 text-[11px] ${TONE[key()]}`}
      >
        {/*
        「连接中」是时间维度上的进行时,不是另一种面板形态 —— 它的可见反馈就
        压在这个转圈上,面板其余部分(提示条/能力卡)不为它改结构。
        静态圆点留给其余三相,转圈只在 connecting 期间出现
      */}
        <Show
          when={key() === 'connecting'}
          fallback={
            <span
              class={
                'text-[0.5rem] leading-none ' +
                (key() === 'connected' ? 'text-success' : '')
              }
              aria-hidden="true"
            >
              ●
            </span>
          }
        >
          <svg
            class="badge-spin size-2.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              stroke-width="4"
              opacity="0.25"
            />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              stroke-width="4"
              stroke-linecap="round"
            />
          </svg>
        </Show>
        {t(LABEL_KEY[key()])}
      </span>
    </Tooltip>
  );
}
