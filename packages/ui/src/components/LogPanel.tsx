import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import type { LogLevel } from '../bridge/types';
import { type LogEntry, useBridge } from '../bridge/useBridge';
import { copyText } from '../utils/clipboard';

/** 过滤档位与级别排序:all=不过滤,其余为「该级别及以上」 */
type FilterKey = 'all' | LogLevel;

const RANK: Record<FilterKey, number> = {
  all: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

// 级别文字用主题语义色(warning=#b45309 / error=#dc2626,见 tailwind.config.js);
// 衬底保留固定 rgba——daisyUI oklch 回退在部分 webview 下会丢失透明度修饰符。
// debug 用 /70:#333@70% 于白底约 4.9:1,满足 ui-ux-pro-max ux-guidelines「正文对比度≥4.5:1」
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
  error: 'border-l-2 border-error bg-[var(--component-log-error-tint)]',
};

/** 行首字形标记:颜色之外的第二重区分(色弱/主题漂移都兜得住) */
const LEVEL_MARK: Partial<Record<LogLevel, string>> = {
  warn: '⚠ ',
  error: '✕ ',
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'info', label: '信息+' },
  { key: 'warn', label: '警告+' },
  { key: 'error', label: '错误' },
];

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
        {copied() ? '✓' : '复制'}
      </button>
    </div>
  );
}

/**
 * 面板日志:按级别着色 + 档位过滤(默认隐藏 debug 噪音)。
 * 在底部时自动跟随最新日志;上滚则暂停并浮现「N 条新日志」pill,点击平滑回底。
 */
export default function LogPanel(props: { entries: LogEntry[] }) {
  const { clearLog } = useBridge();
  let containerRef: HTMLDivElement | undefined;
  let atBottom = true;
  let prevLen = 0;
  const [filter, setFilter] = createSignal<FilterKey>('info');
  const [newCount, setNewCount] = createSignal(0);

  const shown = () =>
    props.entries.filter((e) => RANK[e.level ?? 'info'] >= RANK[filter()]);

  const followBottom = () => {
    const el = containerRef;
    if (!el || !atBottom) return;
    el.scrollTop = el.scrollHeight;
  };

  createEffect(() => {
    shown();
    followBottom();
  });

  // 跟随暂停期间的新日志到达计数(清空导致的长度回落不计)
  createEffect(() => {
    const len = props.entries.length;
    if (len > prevLen && !atBottom) setNewCount((c) => c + 1);
    prevLen = len;
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

  const onClear = (): void => {
    clearLog();
    setNewCount(0);
  };

  onCleanup(() => {
    containerRef = undefined;
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <h2 class="sr-only">日志</h2>
      <div class="join mb-1 flex-wrap items-center gap-0.5">
        <For each={FILTERS}>
          {(f) => (
            <button
              type="button"
              class={`btn btn-xs join-item ${
                filter() === f.key ? 'btn-primary' : 'btn-ghost'
              }`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          )}
        </For>
        <span class="ml-auto pr-1 text-base-content/60 text-[10px]">
          {shown().length} 条
        </span>
        <button
          type="button"
          class="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
          onClick={onClear}
        >
          清空
        </button>
      </div>
      <div class="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          onScroll={onScroll}
          class="h-full overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-2 font-mono text-xs shadow-sm"
        >
          <For
            each={shown()}
            fallback={
              <p class="flex flex-col items-center gap-1 py-6 text-center text-xs text-base-content/60">
                <span aria-hidden="true" class="text-lg opacity-60">
                  📜
                </span>
                <span class="text-base-content/70">暂无日志</span>
                <span>MCP 调用与连接事件会实时显示在这里</span>
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
              class="hint-enter btn btn-primary btn-xs shadow-md"
              onClick={jumpToLatest}
            >
              ↓ {newCount()} 条新日志
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
