import { createSignal, For, Show } from 'solid-js';
import {
  CORE_CAPABILITIES,
  HOST_CAPABILITIES,
  type HostCapabilityKey,
} from 'text-to-design-shared';
import { useBridge } from '../bridge/useBridge';
import {
  CORE_CAPABILITY_KEY,
  HOST_CAPABILITY_KEY,
} from '../i18n/capabilityKeys';
import { t } from '../i18n/useLocale';

/**
 * 能力表:插件当前平台的「核心能力 / 平台差异能力 / 特有 op 名单」。
 *
 * 数据来自 UI 主动向插件 code 侧 ping(useBridge.refreshCapabilities),
 * 与 daemon 缓存、MCP 侧 capabilities 同源(都出自 adapter 的 meta)。
 * 默认收起:面板只有 360×520,能力表属于诊断信息,不进主视线。
 *
 * 展示纪律(沿用 LogDrawer/SelectionCard 的既有约定):
 * - 可用/不可用不能只靠颜色 → 字形 ✓ / — + 文字标签双保险;
 * - 折叠按钮给 aria-expanded/aria-controls,图标类装饰 aria-hidden。
 */
export default function CapabilityCard() {
  const { platform, capability, refreshCapabilities } = useBridge();
  const [expanded, setExpanded] = createSignal(false);

  const coreCount = () => capability()?.coreCapabilities.length ?? 0;
  const opCount = () => capability()?.platformOps.length ?? 0;
  const isOn = (cap: HostCapabilityKey): boolean =>
    capability()?.capabilities.includes(cap) ?? false;
  const onCount = (): number => HOST_CAPABILITIES.filter(isOn).length;

  return (
    <Show when={platform() !== null}>
      <section class="shrink-0 rounded-lg border border-base-300 bg-base-100 shadow-sm">
        <div class="flex items-center gap-2 px-2 py-1.5">
          <h2 class="shrink-0 text-xs font-bold text-base-content/70">
            {t('capability.card.title')}
          </h2>
          <Show
            when={capability()}
            fallback={
              <span class="min-w-0 flex-1 truncate text-[10px] text-base-content/60">
                {t('capability.card.missing')}
              </span>
            }
          >
            <span
              class="badge badge-sm badge-ghost min-w-0 truncate border-base-300 font-mono text-[10px] text-base-content/60"
              title={t('capability.card.badgeTitle')}
            >
              {t('capability.card.badge', {
                core: coreCount(),
                host: onCount(),
                total: HOST_CAPABILITIES.length,
                ops: opCount(),
              })}
            </span>
          </Show>
          <button
            type="button"
            class="btn btn-ghost btn-xs ml-auto shrink-0 text-base-content/60"
            aria-expanded={expanded()}
            aria-controls="capability-body"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded()
              ? t('capability.card.collapse')
              : t('capability.card.expand')}
          </button>
        </div>

        <Show when={expanded()}>
          <div
            id="capability-body"
            class="max-h-40 overflow-y-auto border-base-300 border-t px-2 py-1.5 text-[11px] leading-relaxed"
          >
            <p class="text-base-content/60">
              {t('capability.card.coreSection')}
            </p>
            <ul class="mt-0.5 mb-2 flex flex-wrap gap-1">
              <For each={CORE_CAPABILITIES}>
                {(cap) => (
                  <li class="rounded bg-base-200 px-1.5 py-0.5 text-base-content/80">
                    {t(CORE_CAPABILITY_KEY[cap])}
                  </li>
                )}
              </For>
            </ul>

            <p class="text-base-content/60">
              {t('capability.card.hostSection')}
            </p>
            <ul class="mt-0.5 mb-2 space-y-0.5">
              <For each={HOST_CAPABILITIES}>
                {(cap) => (
                  <li
                    class={isOn(cap) ? 'text-success' : 'text-base-content/50'}
                    title={t(
                      isOn(cap)
                        ? 'capability.card.opTitle'
                        : 'capability.card.opTitleOff',
                      { op: cap },
                    )}
                  >
                    <span aria-hidden="true">{isOn(cap) ? '✓' : '—'}</span>{' '}
                    {t(HOST_CAPABILITY_KEY[cap])}
                    <span class="ml-1 font-mono text-[10px] text-base-content/40">
                      {cap}
                    </span>
                  </li>
                )}
              </For>
            </ul>

            <div class="flex items-center gap-1">
              <p class="text-base-content/60">
                {t('capability.card.opsSection')}
              </p>
              <button
                type="button"
                class="btn btn-ghost btn-xs text-base-content/60"
                onClick={() => refreshCapabilities()}
              >
                {t('capability.card.refresh')}
              </button>
            </div>
            <Show
              when={opCount() > 0}
              fallback={
                <p class="mt-0.5 text-base-content/50">
                  {t('capability.card.noOps')}
                </p>
              }
            >
              <ul class="mt-0.5 space-y-0.5">
                <For each={capability()?.platformOps ?? []}>
                  {(op) => (
                    <li class="truncate" title={op.description}>
                      <span class="font-mono text-base-content/80">
                        {op.name}
                      </span>
                      <span class="text-base-content/60"> {op.title}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Show>
      </section>
    </Show>
  );
}
