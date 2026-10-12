import { Check, PlugZap } from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';
import { PLATFORMS, type Platform } from '../content';
import { useLocale } from '../i18n/context';
import CopyButton from './CopyButton';
import Section from './Section';

export default function Platforms(props: { releasesUrl: string }) {
  const { d, f } = useLocale();
  const [current, setCurrent] = createSignal<Platform>(PLATFORMS[0]);
  const text = () => d().platforms.items[current().id];

  return (
    <Section
      id="platforms"
      index={d().platforms.index}
      title={d().platforms.title}
      lead={d().platforms.lead}
    >
      <div
        role="tablist"
        aria-label={d().platforms.tablistAria}
        data-reveal="fade"
        class="mt-10 flex flex-wrap gap-2"
      >
        <For each={PLATFORMS}>
          {(platform) => (
            <button
              type="button"
              role="tab"
              id={`tab-${platform.id}`}
              aria-selected={current().id === platform.id}
              aria-controls={`panel-${platform.id}`}
              onClick={() => setCurrent(platform)}
              class={
                'rounded-lg border px-4 py-2.5 text-left text-sm transition ' +
                (current().id === platform.id
                  ? 'border-brand/60 bg-brand/12 text-txt'
                  : 'border-line bg-panel text-mute hover:text-txt')
              }
            >
              <span class="block font-medium">
                {d().platforms.items[platform.id].name}
              </span>
              <Show
                when={platform.latin !== d().platforms.items[platform.id].name}
              >
                <span class="block font-mono text-[11px] opacity-70">
                  {platform.latin}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <div
        role="tabpanel"
        id={`panel-${current().id}`}
        aria-labelledby={`tab-${current().id}`}
        class="mt-6 grid animate-[panel-in_420ms_cubic-bezier(.22,1,.36,1)_both] gap-8 rounded-xl border border-line bg-panel p-6 lg:grid-cols-[1.15fr_1fr] lg:p-8"
      >
        <div>
          <h3 class="flex items-center gap-2 text-lg font-medium">
            <PlugZap size={18} class="text-brand" aria-hidden />
            {f(d().platforms.stepsTitle, { name: text().name })}
          </h3>
          <ol class="mt-5 space-y-3">
            <For each={text().steps}>
              {(step, i) => (
                <li class="flex gap-3 rounded-lg border border-line/70 bg-raise px-4 py-3 text-sm">
                  <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 font-mono text-[11px] text-brand">
                    {i() + 1}
                  </span>
                  <span class="leading-relaxed text-txt">{step}</span>
                </li>
              )}
            </For>
          </ol>

          <p class="mt-5 text-sm leading-relaxed text-mute">{text().extra}</p>
        </div>

        <div class="space-y-4">
          <div class="rounded-lg border border-line bg-ink p-4">
            <p class="mono-label">{d().platforms.manifestLabel}</p>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <code class="font-mono text-sm break-all text-code">
                {current().manifest}
              </code>
              <CopyButton
                text={current().manifest}
                label={d().platforms.copyManifest}
                class="ml-auto"
              />
            </div>
            <Show when={current().id === 'mastergo'}>
              <p class="mt-3 text-xs text-mute">{d().platforms.mastergoNote}</p>
            </Show>
          </div>

          <div class="rounded-lg border border-line bg-ink p-4">
            <p class="mono-label">{d().platforms.beforeLabel}</p>
            <ul class="mt-3 space-y-2 text-sm text-mute">
              <For each={d().platforms.beforeItems}>
                {(item) => (
                  <li class="flex gap-2.5">
                    <Check
                      size={15}
                      class="mt-0.5 shrink-0 text-brand"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                )}
              </For>
            </ul>
            <a
              href={props.releasesUrl}
              rel="noreferrer"
              target="_blank"
              class="mt-4 inline-flex items-center gap-2 rounded-md border border-line bg-raise px-4 py-2 text-sm text-txt transition hover:border-brand/50"
            >
              {d().platforms.goReleases}
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}
