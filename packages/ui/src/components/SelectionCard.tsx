import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import {
  type CodeRole,
  type CopyRequest,
  type NodeType,
  normalizeCodeRoles,
  type SelectionSummarySnapshot,
} from 'text-to-design-shared';
import { useBridge } from '../bridge/useBridge';
import { t } from '../i18n/useLocale';
import { copyWithToast } from '../utils/clipboard';
import { showToast } from '../utils/toast';
import CollapsibleSection, { Trigger } from './CollapsibleSection';

interface SelectedNode {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
}

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

const AUTO_COLLAPSE_COUNT = 10;

export default function SelectionCard(props: {
  snapshot: SelectionSummarySnapshot;
  fill?: boolean;
}) {
  const { requestCopy, status } = useBridge();
  const nodes = createMemo<SelectedNode[]>(() => {
    const selection = props.snapshot.data?.selection;
    return Array.isArray(selection) ? selection : [];
  });
  const hasValidSelection = createMemo(
    () =>
      nodes().length > 0 &&
      nodes().every((node) => typeof node.id === 'string' && node.id.length > 0),
  );
  const [mode, setMode] = createSignal<CopyRequest['mode']>('design');
  const [roles, setRoles] = createSignal<CodeRole[]>([]);
  const [copying, setCopying] = createSignal(false);
  const [open, setOpen] = createSignal(true);
  const copyDisabled = createMemo(
    () =>
      copying() ||
      status() !== 'connected' ||
      !hasValidSelection() ||
      (mode() === 'code' && roles().length === 0),
  );

  createEffect(() => {
    if (nodes().length > AUTO_COLLAPSE_COUNT) setOpen(false);
  });

  function toggleRole(role: CodeRole, checked: boolean): void {
    setRoles((current) =>
      checked
        ? current.includes(role)
          ? current
          : [...current, role]
        : current.filter((item) => item !== role),
    );
  }

  async function copy(
    scope: 'selection' | 'node',
    nodeId?: string,
  ): Promise<void> {
    if (copying()) return;
    let request: CopyRequest;
    try {
      const requestMode = mode();
      const base = {
        scope,
        requestedIds:
          scope === 'node' ? [nodeId ?? ''] : nodes().map((node) => node.id),
        source: {
          platform: props.snapshot.meta?.platform ?? null,
          pageName: props.snapshot.data?.pageName ?? null,
          selectionSeq: props.snapshot.meta?.selectionSeq ?? null,
        },
      };
      request =
        requestMode === 'code'
          ? { ...base, mode: 'code', roles: normalizeCodeRoles(roles()) }
          : { ...base, mode: 'design' };
    } catch (e) {
      console.debug('[ui] Copy 请求构造失败', e);
      showToast(t('toast.copy.failed'), 'error');
      return;
    }
    setCopying(true);
    try {
      const result = await requestCopy(request);
      await copyWithToast(result.text);
    } catch (e) {
      console.debug('[ui] MCP Copy 失败', e);
      showToast(t('toast.copy.failed'), 'error');
    } finally {
      setCopying(false);
    }
  }

  return (
    <div class={'flex min-h-0 flex-col ' + (props.fill ? 'flex-1' : '')}>
      <div class="mb-1 flex shrink-0 items-center gap-3 px-1">
        <div
          class="join shrink-0"
          role="group"
          aria-label={t('selection.code.modeLabel')}
        >
          <button
            type="button"
            class={
              'btn join-item btn-xs ' +
              (mode() === 'design' ? 'btn-active' : 'btn-ghost')
            }
            aria-pressed={mode() === 'design'}
            onClick={() => setMode('design')}
          >
            {t('selection.code.design')}
          </button>
          <button
            type="button"
            class={
              'btn join-item btn-xs ' +
              (mode() === 'code' ? 'btn-active' : 'btn-ghost')
            }
            aria-pressed={mode() === 'code'}
            onClick={() => setMode('code')}
          >
            {t('selection.code.code')}
          </button>
        </div>
        <Show when={mode() === 'code'}>
          <div class="flex items-center gap-3 whitespace-nowrap text-xs">
            <label class="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                class="checkbox checkbox-xs rounded-sm"
                checked={roles().includes('frontend')}
                onChange={(e) => toggleRole('frontend', e.currentTarget.checked)}
              />
              {t('selection.code.frontend')}
            </label>
            <label class="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                class="checkbox checkbox-xs rounded-sm"
                checked={roles().includes('backend')}
                onChange={(e) => toggleRole('backend', e.currentTarget.checked)}
              />
              {t('selection.code.backend')}
            </label>
          </div>
        </Show>
      </div>

      <CollapsibleSection
        open={open()}
        openChange={setOpen}
        class={props.fill ? 'min-h-0 flex-1' : ''}
        bodyId="selection-body"
        bodyClass={
          'flex min-h-0 flex-col overflow-y-auto p-1 ' +
          (props.fill ? 'flex-1' : 'max-h-36')
        }
        header={
          <div class="flex items-center justify-between gap-2 border-b border-base-200 px-2.5 py-1.5">
            <div class="flex min-w-0 items-center gap-2">
              <h2 class="text-xs font-bold text-base-content/70">
                {t('selection.title')}
              </h2>
              <Show when={nodes().length > 0}>
                <span class="badge badge-sm badge-ghost border-base-300 font-mono text-[10px] text-base-content/60">
                  {t('selection.badge', { count: nodes().length })}
                </span>
              </Show>
            </div>
            <Show when={nodes().length > 0}>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="btn btn-xs btn-primary"
                  disabled={copyDisabled()}
                  onClick={() => copy('selection')}
                >
                  {t('selection.copy')}
                </button>
                <Trigger
                  open={open()}
                  controls="selection-body"
                  onClick={() => setOpen((value) => !value)}
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
              class={
                'px-2.5 py-4 text-center text-xs text-base-content/70 ' +
                (props.fill
                  ? 'flex flex-1 flex-col items-center justify-center'
                  : '')
              }
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
            {(node) => (
              <div class="flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-base-200">
                <span
                  class={
                    'size-1.5 inline-block shrink-0 rounded-full ' +
                    dotClass(node.type)
                  }
                />
                <div class="min-w-0 flex-1 truncate font-mono text-xs">
                  <span class="text-base-content">{node.name}</span>
                  <span class="text-base-content/65">
                    {' · ' + node.type}
                    {node.width != null
                      ? ' · ' + node.width + '×' + node.height
                      : ''}
                  </span>
                </div>
                <button
                  type="button"
                  class="btn btn-xs btn-ghost shrink-0"
                  disabled={copyDisabled()}
                  onClick={() => copy('node', node.id)}
                >
                  {t('selection.copy')}
                </button>
              </div>
            )}
          </For>
        </Show>
      </CollapsibleSection>
    </div>
  );
}
