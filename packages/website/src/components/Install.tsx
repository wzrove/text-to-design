import { ArrowRight, Bot, PlugZap, RefreshCw } from 'lucide-solid';
import { Index } from 'solid-js';
import { MCP_COMMAND } from '../content';
import { useLocale } from '../i18n/context';
import { revealDelay } from '../motion';
import CopyButton from './CopyButton';
import Section from './Section';

const STEP_ICONS = [Bot, PlugZap, RefreshCw];

export default function Install(props: { releasesUrl: string }) {
  const { d, f } = useLocale();

  return (
    <Section
      id="install"
      index={d().install.index}
      title={d().install.title}
      lead={d().install.lead}
    >
      <ol class="mt-12 grid gap-4 lg:grid-cols-3">
        <Index each={d().install.steps}>
          {(step, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <li
                data-reveal="up"
                style={revealDelay(i)}
                class="rounded-xl border border-line bg-panel p-5 transition-colors duration-300 hover:border-brand/40"
              >
                <div class="flex items-center justify-between">
                  <Icon size={18} class="text-brand" aria-hidden />
                  <span class="mono-label">
                    {f(d().install.stepLabel, { n: i + 1 })}
                  </span>
                </div>
                <h3 class="mt-4 text-[15px] font-medium">{step().title}</h3>
                <p class="mt-2 text-sm leading-relaxed text-mute">
                  {step().body}
                </p>
              </li>
            );
          }}
        </Index>
      </ol>

      <div
        data-reveal="fade"
        class="mt-8 overflow-hidden rounded-xl border border-line bg-panel"
      >
        <div class="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <p class="mono-label">{d().install.promptLabel}</p>
          <CopyButton
            text={d().install.prompt}
            label={d().install.copyPrompt}
            class="ml-auto"
          />
        </div>
        <pre class="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-relaxed text-mute">
          {d().install.prompt}
        </pre>
        <div class="flex flex-wrap items-center gap-4 border-t border-line px-5 py-4 text-sm">
          <span class="text-mute">
            {d().install.whereLabel}
            <a
              href={props.releasesUrl}
              rel="noreferrer"
              target="_blank"
              class="ml-1.5 inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
            >
              GitHub Releases
              <ArrowRight size={14} aria-hidden />
            </a>
          </span>
          <span class="ml-auto hidden font-mono text-xs text-mute sm:inline">
            {MCP_COMMAND}
          </span>
        </div>
      </div>
    </Section>
  );
}
