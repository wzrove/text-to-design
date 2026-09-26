import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import type { NodeType } from 'text-to-design-shared';
import { t } from '../i18n/useLocale';
import { copyText } from '../utils/clipboard';
import CollapsibleSection, { Trigger } from './CollapsibleSection';

interface SelectedNode {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
}

// 类型色点:用主题里预置的 dot-* 分类色槽(见 src/index.css),换色只改那一处,
// 组件零改动;类型名始终有文字呈现,颜色仅辅助。
// 键集按 shared 节点类型字典穷举(Record<NodeType,…>)——字典新增类型这里会编译报错,不会静默漏色。
// Figma 独有的只读类型(SECTION/STICKY/TABLE…)没有专属色点,走 dotClass 的灰色兜底:
// 灰=本仓未建模、只能看不能建,与「建模过的 14 类」在视觉上就区分开。
const TYPE_DOT: Record<NodeType, string> = {
  SLICE: 'bg-dot-slice',
  FRAME: 'bg-dot-frame',
  GROUP: 'bg-dot-group',
  COMPONENT_SET: 'bg-dot-component-set',
  COMPONENT: 'bg-dot-component',
  INSTANCE: 'bg-dot-instance',
  BOOLEAN_OPERATION: 'bg-dot-boolean-operation',
  VECTOR: 'bg-dot-vector',
  STAR: 'bg-dot-star',
  LINE: 'bg-dot-line',
  ELLIPSE: 'bg-dot-ellipse',
  POLYGON: 'bg-dot-polygon',
  RECTANGLE: 'bg-dot-rectangle',
  TEXT: 'bg-dot-text',
};

function dotClass(type: string): string {
  return (TYPE_DOT as Record<string, string>)[type] ?? 'bg-base-300';
}

/** 超过该数量的选中列表自动收起,给日志面板让位;手动展开/收起随时可切 */
const AUTO_COLLAPSE_COUNT = 10;

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** 展开外壳走面板里唯一的实现(见 0026),本组件只负责选中节点这一层 */
export default function SelectionCard(props: {
  data: unknown;
  /**
   * 是否吃掉面板剩余高度(宿主不支持 `ui.resize` 时的降级布局,见
   * docs/design-decisions/0014)。自适应生效时窗口贴着内容,根元素没有剩余高度
   * 可吃,`flex-1` 反而会把「内容高度」撑成「窗口高度」而形成测量回环。
   */
  fill?: boolean;
}) {
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
    /*
      收起时整块退回标题行(`CollapsibleSection`):`fill` 的 `flex-1` 挂在**卡片**上,
      而卡片收起后只剩标题行,剩余高度自然回到面板手里 —— 不再有「卡片吃满高度、
      里面却空着」的那一小块谁都没占的空白。
    */
    <CollapsibleSection
      open={open()}
      openChange={setOpen}
      class={props.fill ? 'min-h-0 flex-1' : ''}
      bodyId="selection-body"
      bodyClass={`flex min-h-0 flex-col overflow-y-auto p-1 ${
        props.fill ? 'flex-1' : 'max-h-36'
      }`}
      header={
        <div class="flex items-center justify-between gap-2 border-b border-base-200 px-2.5 py-1.5">
          <div class="flex min-w-0 items-center gap-2">
            <h2 class="text-xs font-bold text-base-content/70">
              {t('selection.title')}
            </h2>
            <Show when={nodes().length > 0}>
              <span class="badge badge-sm badge-ghost border-base-300 font-mono text-[10px] text-base-content/60">
                {t('selection.badge', {
                  count: nodes().length,
                  size: formatSize(size()),
                })}
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
                {t('selection.copy')}
              </button>
              <Trigger
                open={open()}
                controls="selection-body"
                onClick={() => setOpen((v) => !v)}
              />
            </div>
          </Show>
        </div>
      }
    >
      <Show
        when={nodes().length > 0}
        fallback={
          <p
            class={`px-2.5 py-4 text-center text-xs text-base-content/70 ${
              props.fill
                ? 'flex flex-1 flex-col items-center justify-center'
                : ''
            }`}
          >
            {t('selection.empty.title')}
            <br />
            <span class="text-base-content/60">
              {t('selection.empty.hint')}
            </span>
          </p>
        }
      >
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
                {copiedId() === n.id
                  ? t('selection.copied')
                  : t('selection.copy')}
              </button>
            </div>
          )}
        </For>
      </Show>
    </CollapsibleSection>
  );
}
