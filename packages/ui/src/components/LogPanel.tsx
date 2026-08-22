import { createEffect, createSignal, For, onCleanup } from 'solid-js';
import type { LogLevel } from '../bridge/types';
import type { LogEntry } from '../bridge/useBridge';

/** 过滤档位与级别排序:all=不过滤,其余为「该级别及以上」 */
type FilterKey = 'all' | LogLevel;

const RANK: Record<FilterKey, number> = {
  all: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-base-content/45',
  info: 'text-base-content',
  warn: 'text-warning',
  error: 'text-error',
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'info', label: '信息+' },
  { key: 'warn', label: '警告+' },
  { key: 'error', label: '错误' },
];

function LogEntryItem(props: { entry: LogEntry }) {
  const level = props.entry.level ?? 'info';
  return (
    <p class={`rounded px-1.5 py-0.5 hover:bg-base-200 ${LEVEL_CLASS[level]}`}>
      <span class="text-base-content/40">{props.entry.time}</span>
      <span class="ml-1">
        {props.entry.line}
        {props.entry.count ? (
          <span class="badge badge-sm badge-ghost ml-1 border-base-300">
            ×{props.entry.count}
          </span>
        ) : null}
      </span>
    </p>
  );
}

/**
 * 面板日志:按级别着色 + 档位过滤(默认隐藏 debug 噪音)。
 * 在底部时自动跟随最新日志;用户上滚则暂停,回到底部恢复。
 */
export default function LogPanel(props: { entries: LogEntry[] }) {
  let containerRef: HTMLDivElement | undefined;
  let atBottom = true;
  const [filter, setFilter] = createSignal<FilterKey>('info');

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

  const onScroll = () => {
    const el = containerRef;
    if (!el) return;
    atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  onCleanup(() => {
    containerRef = undefined;
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col">
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
        <span class="ml-auto pr-1 text-base-content/40 text-[10px]">
          {shown().length} 条
        </span>
      </div>
      <div
        ref={containerRef}
        onScroll={onScroll}
        class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-2 font-mono text-xs shadow-sm"
      >
        <For
          each={shown()}
          fallback={<p class="text-base-content/70">暂无日志</p>}
        >
          {(entry) => <LogEntryItem entry={entry} />}
        </For>
      </div>
    </div>
  );
}
