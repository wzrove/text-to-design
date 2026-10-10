import { Check, PlugZap } from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';
import { PLATFORMS } from '../content';
import CopyButton from './CopyButton';
import Section from './Section';

export default function Platforms(props: { releasesUrl: string }) {
  const [current, setCurrent] = createSignal(PLATFORMS[0]);

  return (
    <Section
      id="platforms"
      index="01 / 平台"
      title="三个平台,三份产物"
      lead="同一个插件包按平台分别构建。先选你的设计软件,再按下面的路径导入 manifest。"
    >
      <div
        role="tablist"
        aria-label="设计软件平台"
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
              <span class="block font-medium">{platform.name}</span>
              <span class="block font-mono text-[11px] opacity-70">
                {platform.latin}
              </span>
            </button>
          )}
        </For>
      </div>

      <Show when={current()} keyed>
        {(platform) => (
          <div
            role="tabpanel"
            id={`panel-${platform.id}`}
            aria-labelledby={`tab-${platform.id}`}
            class="mt-6 grid animate-[panel-in_420ms_cubic-bezier(.22,1,.36,1)_both] gap-8 rounded-xl border border-line bg-panel p-6 lg:grid-cols-[1.15fr_1fr] lg:p-8"
          >
            <div>
              <h3 class="flex items-center gap-2 text-lg font-medium">
                <PlugZap size={18} class="text-brand" aria-hidden />
                {platform.name} 导入步骤
              </h3>
              <ol class="mt-5 space-y-3">
                <For each={platform.importSteps}>
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

              <p class="mt-5 text-sm leading-relaxed text-mute">
                {platform.extra}
              </p>
            </div>

            <div class="space-y-4">
              <div class="rounded-lg border border-line bg-ink p-4">
                <p class="mono-label">manifest 路径</p>
                <div class="mt-3 flex flex-wrap items-center gap-3">
                  <code class="font-mono text-sm break-all text-code">
                    {platform.manifest}
                  </code>
                  <CopyButton
                    text={platform.manifest}
                    label="复制 manifest 路径"
                    class="ml-auto"
                  />
                </div>
                <Show when={platform.id === 'mastergo'}>
                  <p class="mt-3 text-xs text-mute">
                    莫高设计以「上传插件」形态接入,选中的是同一份 manifest。
                  </p>
                </Show>
              </div>

              <div class="rounded-lg border border-line bg-ink p-4">
                <p class="mono-label">导入前:取产物</p>
                <ul class="mt-3 space-y-2 text-sm text-mute">
                  <li class="flex gap-2.5">
                    <Check
                      size={15}
                      class="mt-0.5 shrink-0 text-brand"
                      aria-hidden
                    />
                    <span>从 GitHub Releases 下载插件包并解压</span>
                  </li>
                  <li class="flex gap-2.5">
                    <Check
                      size={15}
                      class="mt-0.5 shrink-0 text-brand"
                      aria-hidden
                    />
                    <span>
                      解压后目录内已含三平台产物,只需定位到当前平台那份 manifest
                    </span>
                  </li>
                </ul>
                <a
                  href={props.releasesUrl}
                  rel="noreferrer"
                  target="_blank"
                  class="mt-4 inline-flex items-center gap-2 rounded-md border border-line bg-raise px-4 py-2 text-sm text-txt transition hover:border-brand/50"
                >
                  前往 Releases
                </a>
              </div>
            </div>
          </div>
        )}
      </Show>
    </Section>
  );
}
