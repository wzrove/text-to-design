import { createMemo, Show } from 'solid-js';
import type { MessageKey } from 'text-to-design-shared';
import { useBridge } from '../bridge/useBridge';
import { t } from '../i18n/useLocale';

// 淡底深字替代实心徽章:bg-X/10 + border-X/25(状态徽章的比例)。
// Tailwind 4 会为透明度修饰符生成 @supports (color:color-mix(...)) 渐进降级,
// 支持 color-mix 的客户端拿正确 alpha、老的拿实色兜底。
// 文字用语义实心色 text-X,亮暗主题均已按 ≥4.5:1 校准
const STYLE = {
  connected: 'border border-success/25 bg-success/10 text-success',
  connecting: 'border border-info/25 bg-info/10 text-info',
  waiting: 'border border-warning/25 bg-warning/10 text-warning',
  superseded: 'border border-warning/25 bg-warning/10 text-warning',
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
    <span
      role="status"
      aria-atomic="true"
      class={`badge badge-sm gap-1 ${STYLE[key()]}`}
      title={t(TITLE_KEY[key()])}
    >
      {/*
        「连接中」是时间维度上的进行时,不是另一种面板形态 —— 它的可见反馈就
        压在这个转圈上,面板其余部分(提示条/能力卡)不为它改结构。
        静态圆点留给其余三相,转圈只在 connecting 期间出现
      */}
      <Show
        when={key() === 'connecting'}
        fallback={
          <span class="text-[0.5rem] leading-none" aria-hidden="true">
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
  );
}
