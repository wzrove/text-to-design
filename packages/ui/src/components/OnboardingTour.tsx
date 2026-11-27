import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import type { CopyRequest, MessageKey } from 'text-to-design-shared';
import { t } from '../i18n/useLocale';

interface TourStep {
  readonly target: string;
  readonly title: MessageKey;
  readonly body: MessageKey;
  readonly previewMode?: CopyRequest['mode'];
  readonly requiresResize?: boolean;
}

const ALL_TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'status',
    title: 'tour.step.status.title',
    body: 'tour.step.status.body',
  },
  {
    target: 'mode-design',
    title: 'tour.step.modeDesign.title',
    body: 'tour.step.modeDesign.body',
    previewMode: 'design',
  },
  {
    target: 'mode-code',
    title: 'tour.step.modeCode.title',
    body: 'tour.step.modeCode.body',
    previewMode: 'code',
  },
  {
    target: 'selection',
    title: 'tour.step.selection.title',
    body: 'tour.step.selection.body',
  },
  {
    target: 'log',
    title: 'tour.step.log.title',
    body: 'tour.step.log.body',
  },
  {
    target: 'more',
    title: 'tour.step.more.title',
    body: 'tour.step.more.body',
  },
  {
    target: 'minimize',
    title: 'tour.step.minimize.title',
    body: 'tour.step.minimize.body',
    requiresResize: true,
  },
  {
    target: 'contact',
    title: 'tour.step.contact.title',
    body: 'tour.step.contact.body',
  },
];

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOT_PAD = 4;
const CARD_GAP = 10;
const VIEW_MARGIN = 8;

function measureTarget(target: string): SpotRect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (el == null) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    top: Math.max(2, r.top - SPOT_PAD),
    left: Math.max(2, r.left - SPOT_PAD),
    width: r.width + SPOT_PAD * 2,
    height: r.height + SPOT_PAD * 2,
  };
}

export default function OnboardingTour(props: {
  open: boolean;
  canResize: boolean;
  onPreviewMode: (mode: CopyRequest['mode']) => void;
  onFinish: () => void;
}) {
  const [stepIndex, setStepIndex] = createSignal(0);
  const [spot, setSpot] = createSignal<SpotRect | null>(null);
  const [cardHeight, setCardHeight] = createSignal(148);
  let cardEl: HTMLDivElement | undefined;
  let primaryBtn: HTMLButtonElement | undefined;

  const steps = createMemo(() =>
    props.canResize
      ? ALL_TOUR_STEPS
      : ALL_TOUR_STEPS.filter((s) => !s.requiresResize),
  );
  const step = createMemo(() => steps()[stepIndex()] ?? steps()[0]);
  const isFirst = createMemo(() => stepIndex() === 0);
  const isLast = createMemo(() => stepIndex() >= steps().length - 1);

  const refresh = (): void => {
    const target = step().target;
    setSpot(measureTarget(target));
    if (cardEl != null) {
      const h = cardEl.getBoundingClientRect().height;
      if (h > 0) setCardHeight(h);
    }
  };

  createEffect(
    () => props.open,
    (isOpen) => {
      if (!isOpen) return;
      setStepIndex(0);
      const raf = window.requestAnimationFrame(() => {
        refresh();
        primaryBtn?.focus();
      });
      return () => window.cancelAnimationFrame(raf);
    },
  );

  createEffect(
    () => (props.open ? step().previewMode : undefined),
    (mode) => {
      if (mode != null) props.onPreviewMode(mode);
    },
  );

  createEffect(
    () => (props.open ? step().target : null),
    (target) => {
      if (target == null) {
        setSpot(null);
        return;
      }
      const raf = window.requestAnimationFrame(refresh);
      const onLayout = (): void => refresh();
      window.addEventListener('resize', onLayout);
      window.addEventListener('scroll', onLayout, true);
      const ro =
        typeof ResizeObserver === 'function'
          ? new ResizeObserver(onLayout)
          : null;
      ro?.observe(document.documentElement);
      return () => {
        window.cancelAnimationFrame(raf);
        window.removeEventListener('resize', onLayout);
        window.removeEventListener('scroll', onLayout, true);
        ro?.disconnect();
      };
    },
  );

  const cardStyle = createMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = Math.min(280, Math.max(200, vw - VIEW_MARGIN * 2));
    const cardH = cardHeight();
    const r = spot();
    if (r == null) {
      return {
        top: `${Math.max(VIEW_MARGIN, Math.round((vh - cardH) / 2))}px`,
        left: `${Math.max(VIEW_MARGIN, Math.round((vw - cardW) / 2))}px`,
        width: `${cardW}px`,
      };
    }
    const belowTop = r.top + r.height + CARD_GAP;
    const aboveTop = r.top - cardH - CARD_GAP;
    let top: number;
    if (belowTop + cardH <= vh - VIEW_MARGIN) top = belowTop;
    else if (aboveTop >= VIEW_MARGIN) top = aboveTop;
    else top = Math.max(VIEW_MARGIN, vh - cardH - VIEW_MARGIN);

    const idealLeft = r.left + r.width / 2 - cardW / 2;
    const left = Math.min(
      Math.max(VIEW_MARGIN, idealLeft),
      Math.max(VIEW_MARGIN, vw - cardW - VIEW_MARGIN),
    );
    return {
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${cardW}px`,
    };
  });

  const next = (): void => {
    if (isLast()) props.onFinish();
    else setStepIndex((i) => Math.min(steps().length - 1, i + 1));
  };

  const prev = (): void => {
    setStepIndex((i) => Math.max(0, i - 1));
  };

  return (
    <Show when={props.open}>
      {/* 拦截底层点击:避免引导期间误触面板按钮;浮层 fixed 零占位不影响面板高 */}
      <div class="fixed inset-0 z-50" aria-hidden="true" />
      <Show when={spot()}>
        {(r) => (
          <div
            aria-hidden="true"
            class="pointer-events-none fixed z-50 rounded-lg ring-2 ring-primary/80 transition-all duration-200"
            style={{
              top: `${r().top}px`,
              left: `${r().left}px`,
              width: `${r().width}px`,
              height: `${r().height}px`,
              'box-shadow': '0 0 0 9999px rgba(0, 0, 0, 0.45)',
            }}
          />
        )}
      </Show>
      <Show when={spot() == null}>
        <div
          aria-hidden="true"
          class="pointer-events-none fixed inset-0 z-50 bg-black/45"
        />
      </Show>

      <div
        ref={(el) => {
          cardEl = el;
        }}
        role="dialog"
        aria-modal="true"
        aria-label={t('tour.dialog.label')}
        class="fixed z-60 rounded-box border border-base-300 bg-base-100 p-3 text-base-content shadow-xl transition-all duration-200"
        style={cardStyle()}
      >
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-semibold">{t(step().title)}</h3>
          <span class="text-[11px] text-base-content/50">
            {stepIndex() + 1} / {steps().length}
          </span>
        </div>
        <p class="mt-1.5 text-xs leading-relaxed text-base-content/75">
          {t(step().body)}
        </p>
        <div class="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-xs px-1.5 text-base-content/60 hover:text-base-content"
            onClick={() => props.onFinish()}
          >
            {t('tour.skip')}
          </button>
          <div class="flex items-center gap-1.5">
            <Show when={!isFirst()}>
              <button type="button" class="btn btn-ghost btn-xs" onClick={prev}>
                {t('tour.prev')}
              </button>
            </Show>
            <button
              ref={(el) => {
                primaryBtn = el;
              }}
              type="button"
              class="btn btn-primary btn-xs"
              onClick={next}
            >
              {isLast() ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
