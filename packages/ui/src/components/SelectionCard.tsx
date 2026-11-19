import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import type {
  CodeRole,
  CopyRequest,
  NodeType,
  SelectionSummarySnapshot,
} from 'text-to-design-shared';
import { useBridge } from '../bridge/useBridge';
import { t } from '../i18n/useLocale';
import { copyWithToast } from '../utils/clipboard';
import { makeCopyRequest } from '../utils/copyRequest';
import { showToast } from '../utils/toast';
import { TOGGLE_ACTIVE } from '../utils/toggleStyles';
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
  /** 面板级 Copy 目标模式(顶部 CopyModeBar 持有) */
  mode: CopyRequest['mode'];
  roles: CodeRole[];
  onToggleRole: (role: CodeRole, checked: boolean) => void;
}) {
  const { requestCopy, status } = useBridge();
  const nodes = createMemo<SelectedNode[]>(() => {
    const selection = props.snapshot.data?.selection;
    return Array.isArray(selection) ? selection : [];
  });
  const hasValidSelection = createMemo(
    () =>
      nodes().length > 0 &&
      nodes().every(
        (node) => typeof node.id === 'string' && node.id.length > 0,
      ),
  );
  const [copying, setCopying] = createSignal(false);
  const [open, setOpen] = createSignal(true);
  const copyDisabled = createMemo(
    () =>
      copying() ||
      status() !== 'connected' ||
      !hasValidSelection() ||
      (props.mode === 'code' && props.roles.length === 0),
  );

  createEffect(() => {
    if (nodes().length > AUTO_COLLAPSE_COUNT) setOpen(false);
  });

  async function copy(
    scope: 'selection' | 'node',
    nodeId?: string,
  ): Promise<void> {
    if (copying()) return;
    let request: CopyRequest;
    try {
      request = makeCopyRequest(
        props.snapshot,
        props.mode,
        props.roles,
        scope,
        scope === 'node' ? [nodeId ?? ''] : nodes().map((node) => node.id),
      );
    } catch (e) {
      console.debug('[ui] Copy 请求构造失败', e); // i18n-exempt: developer console only
      showToast(t('toast.copy.failed'), 'error');
      return;
    }
    setCopying(true);
    try {
      const result = await requestCopy(request);
      await copyWithToast(result.text);
    } catch (e) {
      console.debug('[ui] MCP Copy 失败', e); // i18n-exempt: developer console only
      showToast(t('toast.copy.failed'), 'error');
    } finally {
      setCopying(false);
    }
  }

  return (
    <div class={`flex min-h-0 flex-col ${props.fill ? 'flex-1' : ''}`}>
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
                {nodes().length > 0
                  ? t('selection.selected', { count: nodes().length })
                  : t('selection.title')}
              </h2>
              {/* 代码模式角色:与标题同一行,不另起一行占高 */}
              <Show when={props.mode === 'code'}>
                <For each={['frontend', 'backend'] as const}>
                  {(role) => {
                    const checked = (): boolean => props.roles.includes(role);
                    return (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked()}
                        class={
                          'rounded-full border px-2 py-0.5 text-[10px] transition-colors ' +
                          (checked()
                            ? TOGGLE_ACTIVE
                            : 'border-base-300 text-base-content/55 hover:bg-base-content/5 hover:text-base-content')
                        }
                        onClick={() => props.onToggleRole(role, !checked())}
                      >
                        {t(
                          role === 'frontend'
                            ? 'selection.code.frontend'
                            : 'selection.code.backend',
                        )}
                      </button>
                    );
                  }}
                </For>
              </Show>
            </div>
            <Show when={nodes().length > 0}>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="btn btn-xs border-base-300 bg-base-100 text-base-content hover:bg-base-200"
                  disabled={copyDisabled()}
                  title={
                    props.mode === 'code' && props.roles.length === 0
                      ? t('selection.code.needRole')
                      : undefined
                  }
                  onClick={() => copy('selection')}
                >
                  {t('selection.copy.selected')}
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
          <p class="px-2 pb-1 text-[10px] text-base-content/50">
            {t(
              props.mode === 'code'
                ? props.roles.length === 0
                  ? 'selection.hint.code.noRole'
                  : 'selection.hint.code'
                : 'selection.hint.design',
            )}
          </p>
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
                    {` · ${node.type}`}
                    {node.width != null
                      ? ` · ${node.width}×${node.height}`
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
