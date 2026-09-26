import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { LOG_LEVEL_ORDER, type MessageKey } from 'text-to-design-shared';
import type { LogLevel } from '../bridge/types';
import type { LogEntry } from '../bridge/useBridge';
import { t } from '../i18n/useLocale';
import { copyText } from '../utils/clipboard';
import CollapsibleSection from './CollapsibleSection';

/** 过滤档位与级别排序:all=不过滤,其余为「该级别及以上」 */
type FilterKey = 'all' | LogLevel;

/**
 * 档位权重:序号取自 shared 日志级别字典(与服务端落盘门槛同一份顺序),
 * UI 只额外给 'all' 留 0 号位,避免两侧各维护一张序号表。
 */
const RANK: Record<FilterKey, number> = {
  all: 0,
  debug: LOG_LEVEL_ORDER.debug + 1,
  info: LOG_LEVEL_ORDER.info + 1,
  warn: LOG_LEVEL_ORDER.warn + 1,
  error: LOG_LEVEL_ORDER.error + 1,
};

// 级别文字用主题语义色(warning/error,见 src/index.css 的主题变量);
// error 行衬底用 bg-error/6(比提示条的 8% 更轻,只为压一层底色不抢文字)。
// debug 用 /70:白底约 4.9:1,满足 ui-ux-pro-max ux-guidelines「正文对比度≥4.5:1」
const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-base-content/70',
  info: 'text-base-content',
  warn: 'text-warning',
  error: 'text-error',
};

/** 级别视觉锚点:warn/error 左侧色条(error 另加淡红底),扫读更快 */
const LEVEL_ACCENT: Record<LogLevel, string> = {
  debug: '',
  info: '',
  warn: 'border-l-2 border-warning',
  error: 'border-l-2 border-error bg-error/6',
};

/** 行首字形标记:颜色之外的第二重区分(色弱/主题漂移都兜得住) */
const LEVEL_MARK: Partial<Record<LogLevel, string>> = {
  warn: '⚠ ',
  error: '✕ ',
};

const FILTERS: { key: FilterKey; label: MessageKey }[] = [
  { key: 'all', label: 'log.drawer.filter.all' },
  { key: 'info', label: 'log.drawer.filter.info' },
  { key: 'warn', label: 'log.drawer.filter.warn' },
  { key: 'error', label: 'log.drawer.filter.error' },
];

/**
 * 默认档位 warn+。日志是纯诊断信息,健康状态下打开抽屉就该是空的 ——
 * 一进来满屏 info 正是「日志太显眼」的同一种病,只是换了地方犯。
 */
const DEFAULT_FILTER: FilterKey = 'warn';

/** 超过该字符数的日志默认收起为单行省略号,点击行内容展开/收起 */
const LONG_LINE_CHARS = 120;

function LogEntryItem(props: { entry: LogEntry }) {
  const level = props.entry.level ?? 'info';
  const [expanded, setExpanded] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const isLong = () => props.entry.line.length > LONG_LINE_CHARS;

  /** 行正文 + 级别标记 + 去重计数徽标(折叠/展开两分支共用) */
  const content = () => (
    <>
      {LEVEL_MARK[level]}
      {props.entry.line}
      {props.entry.count ? (
        <span class="badge badge-sm badge-ghost ml-1 border-base-300">
          ×{props.entry.count}
        </span>
      ) : null}
    </>
  );

  const toggle = (): void => {
    // 有选区时视为用户在手动选词复制,不触发展开切换
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    setExpanded((v) => !v);
  };

  const onCopy = (): void => {
    if (copyText(props.entry.line)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <div
      class={`group relative flex items-start gap-1 rounded-r px-1.5 py-0.5 hover:bg-base-200 ${LEVEL_CLASS[level]} ${LEVEL_ACCENT[level]}`}
    >
      {/* 时间戳属次级元数据(WCAG incidental 范畴),/60 约 3.5:1,保层次也够辨认 */}
      <span class="shrink-0 text-base-content/60">{props.entry.time}</span>
      <Show
        when={isLong()}
        fallback={
          <span class={`min-w-0 flex-1 ${LEVEL_CLASS[level]}`}>
            {content()}
          </span>
        }
      >
        {/* 原生 button 保证键盘可达(biome a11y);截断盒与指示符分列,▾ 恒可见 */}
        <button
          type="button"
          class={`flex min-w-0 flex-1 cursor-pointer items-start gap-1 text-left ${LEVEL_CLASS[level]}`}
          onClick={toggle}
          title={expanded() ? undefined : props.entry.line}
        >
          <span
            class={`min-w-0 flex-1 ${
              expanded()
                ? 'max-h-48 overflow-y-auto whitespace-pre-wrap break-all'
                : 'truncate'
            }`}
          >
            {content()}
          </span>
          <span
            class={`shrink-0 text-base-content/40 transition-transform duration-200 ${
              expanded() ? 'rotate-180' : ''
            }`}
          >
            ▾
          </span>
        </button>
      </Show>
      {/* 悬浮复制钮:绝对定位浮层,非 hover 零占位 */}
      <button
        type="button"
        class="absolute top-0.5 right-0.5 z-10 rounded bg-base-100/90 px-1 text-base-content/60 text-[10px] opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 hover:text-base-content"
        onClick={onCopy}
      >
        {copied() ? '✓' : t('log.drawer.copy')}
      </button>
    </div>
  );
}

/**
 * 日志抽屉。
 *
 * 日志属于纯诊断信息(与 CapabilityCard 同一条纪律:诊断不进主视线),所以它
 * 不常驻占位 —— 入口是页头右端的幽灵图标(LogTrigger),展开才从底部滑出。
 *
 * 结构外壳由 `CollapsibleSection` 的 `sheet` 形态提供(遮罩、点外部收起、
 * `aria-modal`、`fixed` 锚视口、85% 高度、`panel-enter` 入场);本组件只负责
 * 日志这一层:过滤档位、跟随底部、未读计数、清空。**不再自带浮层骨架** ——
 * 三处展开面板各自实现过一遍,是本条要治的病(见 0026)。
 *
 * 剩下的几点:
 * - 高度取窗口的 85%(不写死 px):抽屉自己不定高,而窗口在打开期间由 App 把下限
 *   抬到 `PANEL_HEIGHT_OVERLAY`(见 0015)—— 否则自适应布局下面板可能只有 300 高,
 *   85% 就是一条 255px 的窄缝;
 * - 焦点在打开时落到关闭钮、关闭时由 App 还给触发钮(见 App.tsx closeLog);
 * - ESC 也由 App 收(理由见那边的注释:关闭要连带还焦点,两个端点分处两个组件)。
 */
export default function LogDrawer(props: {
  open: boolean;
  entries: LogEntry[];
  onClose: () => void;
  onClear: () => void;
}) {
  const [filter, setFilter] = createSignal<FilterKey>(DEFAULT_FILTER);
  const [newCount, setNewCount] = createSignal(0);
  let containerRef: HTMLDivElement | undefined;
  let closeRef: HTMLButtonElement | undefined;
  let atBottom = true;
  let prevLen = 0;

  const shown = () =>
    props.entries.filter((e) => RANK[e.level ?? 'info'] >= RANK[filter()]);

  const filterKey = (): MessageKey =>
    FILTERS.find((f) => f.key === filter())?.label ?? 'log.drawer.filter.all';

  const emptyText = (): string =>
    props.entries.length === 0
      ? t('log.drawer.empty')
      : t('log.drawer.emptyFiltered', { filter: t(filterKey()) });

  const followBottom = () => {
    const el = containerRef;
    if (!el || !atBottom) return;
    el.scrollTop = el.scrollHeight;
  };

  // 每次打开都从最新一条看起:跟随状态与未读计数在开合处复位
  createEffect(() => {
    if (!props.open) return;
    atBottom = true;
    setNewCount(0);
    prevLen = props.entries.length;
  });

  // 跟随暂停期间的新日志到达计数(清空导致的长度回落不计)
  createEffect(() => {
    const len = props.entries.length;
    if (props.open && len > prevLen && !atBottom) setNewCount((c) => c + 1);
    prevLen = len;
  });

  // 依赖里带上 open:抽屉展开不改变条目集合,光靠 shown() 不会重新贴底
  createEffect(() => {
    if (!props.open) return;
    shown();
    followBottom();
  });

  createEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    closeRef?.focus();
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  const onScroll = () => {
    const el = containerRef;
    if (!el) return;
    atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom) setNewCount(0);
  };

  const jumpToLatest = (): void => {
    if (!containerRef) return;
    // 动效可达性:系统开启「减少动态效果」时直接跳转,不做平滑滚动
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    containerRef.scrollTo({
      top: containerRef.scrollHeight,
      behavior: reduce ? 'auto' : 'smooth',
    });
  };

  return (
    <CollapsibleSection
      variant="sheet"
      open={props.open}
      openChange={(v) => {
        if (!v) props.onClose();
      }}
      label={t('log.drawer.title')}
      header={
        <div class="flex items-center gap-2 px-3 pt-2">
          <h2 class="shrink-0 text-xs font-bold text-base-content/80">
            {t('log.drawer.title')}
          </h2>
          <span class="min-w-0 flex-1 truncate text-base-content/60 text-[10px]">
            {t('log.drawer.count', {
              shown: shown().length,
              total: props.entries.length,
            })}
          </span>
          <button
            type="button"
            class="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
            onClick={props.onClear}
          >
            {t('log.drawer.clear')}
          </button>
          {/* 浮层的关闭是「退出」而不是「收起」,故用叉而非箭头:这里的箭头
              只表达方向,而那一步是把整个面板关掉 */}
          <button
            ref={(el) => {
              closeRef = el;
            }}
            type="button"
            class="btn btn-ghost btn-xs px-1.5 text-base-content/60 hover:text-base-content"
            aria-label={t('log.drawer.close')}
            onClick={props.onClose}
          >
            ✕
          </button>
        </div>
      }
    >
      <div class="join flex-wrap items-center gap-0.5 px-3 py-1.5">
        <For each={FILTERS}>
          {(f) => (
            <button
              type="button"
              class={`btn btn-xs join-item ${
                filter() === f.key ? 'btn-primary' : 'btn-ghost'
              }`}
              onClick={() => setFilter(f.key)}
            >
              {t(f.label)}
            </button>
          )}
        </For>
      </div>

      <div class="relative min-h-0 flex-1 border-base-200 border-t">
        <div
          ref={containerRef}
          onScroll={onScroll}
          class="h-full overflow-y-auto px-3 py-2 font-mono text-xs"
        >
          <For
            each={shown()}
            fallback={
              <p class="px-2 py-8 text-center text-xs text-base-content/60 leading-relaxed">
                {emptyText()}
              </p>
            }
          >
            {(entry) => <LogEntryItem entry={entry} />}
          </For>
        </div>
        <Show when={newCount() > 0}>
          {/* role=status + polite:新日志到达时读屏可感知,不打断当前朗读 */}
          <div
            role="status"
            aria-live="polite"
            class="absolute right-2 bottom-2"
          >
            <button
              type="button"
              class="hint-enter btn btn-xs border-base-300 bg-base-100 text-base-content shadow-md hover:bg-base-200"
              onClick={jumpToLatest}
            >
              {t('log.drawer.newCount', { count: newCount() })}
            </button>
          </div>
        </Show>
      </div>
    </CollapsibleSection>
  );
}
