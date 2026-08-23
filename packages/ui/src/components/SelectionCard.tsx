import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { copyText } from '../utils/clipboard';

interface SelectedNode {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
}

// 类型色点:引用 design-tokens.json 生成的组件层 token(src/styles/tokens.css),
// 换色只改 JSON 后重新生成,组件零改动;类型名始终有文字呈现,颜色仅辅助
const TYPE_DOT: Record<string, string> = {
  FRAME: 'bg-[var(--component-type-dot-frame)]',
  GROUP: 'bg-[var(--component-type-dot-group)]',
  RECTANGLE: 'bg-[var(--component-type-dot-rectangle)]',
  ELLIPSE: 'bg-[var(--component-type-dot-ellipse)]',
  LINE: 'bg-[var(--component-type-dot-line)]',
  POLYGON: 'bg-[var(--component-type-dot-polygon)]',
  STAR: 'bg-[var(--component-type-dot-star)]',
  VECTOR: 'bg-[var(--component-type-dot-vector)]',
  TEXT: 'bg-[var(--component-type-dot-text)]',
  COMPONENT: 'bg-[var(--component-type-dot-component)]',
  COMPONENT_SET: 'bg-[var(--component-type-dot-component-set)]',
  INSTANCE: 'bg-[var(--component-type-dot-instance)]',
  BOOLEAN_OPERATION: 'bg-[var(--component-type-dot-boolean-operation)]',
  SLICE: 'bg-[var(--component-type-dot-slice)]',
};

function dotClass(type: string): string {
  return TYPE_DOT[type] ?? 'bg-base-300';
}

/** 超过该数量的选中列表自动收起,给日志面板让位;手动展开/收起随时可切 */
const AUTO_COLLAPSE_COUNT = 10;

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export default function SelectionCard(props: { data: unknown }) {
  const nodes = createMemo<SelectedNode[]>(() => {
    const data = props.data as
      | { selection?: SelectedNode[] }
      | null
      | undefined;
    return Array.isArray(data?.selection) ? data.selection : [];
  });
  const payload = createMemo(() => JSON.stringify(props.data ?? {}));
  const size = createMemo(() => new TextEncoder().encode(payload()).length);

  const [open, setOpen] = createSignal(true);
  // 大批量选中时自动收起列表,避免长期霸屏挤占日志面板
  createEffect(() => {
    if (nodes().length > AUTO_COLLAPSE_COUNT) setOpen(false);
  });

  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const copyId = (id: string) => {
    copyText(id);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div class="flex flex-col rounded-lg border border-base-300 bg-base-100 shadow-sm">
      <div class="flex items-center justify-between gap-2 border-b border-base-200 px-2.5 py-1.5">
        <div class="flex min-w-0 items-center gap-2">
          <h2 class="text-xs font-bold text-base-content/70">选中节点</h2>
          <Show when={nodes().length > 0}>
            <span class="badge badge-sm badge-ghost border-base-300 font-mono text-[10px] text-base-content/60">
              {nodes().length} 个 · 序列化 {formatSize(size())}
            </span>
          </Show>
        </div>
        <Show when={nodes().length > 0}>
          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              class="btn btn-xs btn-primary"
              onClick={() => copyText(payload())}
            >
              复制
            </button>
            <button
              type="button"
              class="btn btn-xs btn-ghost px-2"
              aria-expanded={open()}
              aria-label={open() ? '收起节点列表' : '展开节点列表'}
              onClick={() => setOpen((v) => !v)}
            >
              <span
                class={`inline-block transition-transform duration-200 ${
                  open() ? 'rotate-180' : ''
                }`}
              >
                ▾
              </span>
            </button>
          </div>
        </Show>
      </div>

      <Show when={nodes().length > 0 && open()}>
        <div class="flex max-h-36 min-h-0 flex-col overflow-y-auto p-1">
          <For each={nodes()}>
            {(n) => (
              <div class="flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-base-200">
                <span
                  class={`size-1.5 inline-block shrink-0 rounded-full ${dotClass(n.type)}`}
                />
                <div class="min-w-0 flex-1 truncate font-mono text-xs">
                  <span class="text-base-content">{n.name}</span>
                  {/* 类型/尺寸是有用信息而非装饰,/65 保住对比度又弱于主名 */}
                  <span class="text-base-content/65">
                    {' '}
                    · {n.type}
                    {n.width != null ? ` · ${n.width}×${n.height}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  class={`btn btn-xs btn-ghost shrink-0 ${copiedId() === n.id ? 'text-success' : ''}`}
                  onClick={() => copyId(n.id)}
                >
                  {copiedId() === n.id ? '✓' : '复制'}
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={nodes().length === 0}>
        <p class="px-2.5 py-4 text-center text-xs text-base-content/70">
          未选中节点
          <br />
          <span class="text-base-content/60">
            在画布中点选节点后,这里会实时显示并支持复制
          </span>
        </p>
      </Show>
    </div>
  );
}
