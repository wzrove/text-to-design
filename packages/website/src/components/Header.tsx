import { Code, Download, Monitor, Moon, Sun } from 'lucide-solid';
import { For, Match, Switch } from 'solid-js';
import { LOCALES, useLocale } from '../i18n/context';
import { createScrollProgress, createSectionSpy } from '../motion';
import { createTheme } from '../theme';
import ContactLinks from './ContactLinks';

const NAV = ['platforms', 'install'] as const;

const LOCALE_SHORT: Record<(typeof LOCALES)[number], string> = {
  'zh-CN': '中',
  en: 'EN',
};

export default function Header(props: {
  releasesUrl: string;
  repoUrl: string;
}) {
  const { d, f, locale, setLocale } = useLocale();
  const progress = createScrollProgress();
  const active = createSectionSpy([...NAV]);
  const theme = createTheme();

  return (
    <header
      class="sticky top-0 z-30 border-b border-line/70 bg-ink/85 backdrop-blur transition-shadow duration-300"
      classList={{
        'shadow-[0_10px_30px_-24px_rgba(0,0,0,0.55)]': progress() > 0,
      }}
    >
      <div class="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3 sm:px-8 sm:py-3.5">
        <a href="#top" class="flex items-center gap-2.5">
          <img
            src="/logo.svg"
            alt=""
            width={30}
            height={30}
            class="rounded-[7px] transition-transform duration-300 hover:rotate-[-8deg]"
          />
          <span class="font-mono text-sm tracking-tight text-txt">
            text-to-design
          </span>
        </a>

        <nav
          aria-label={d().header.navAria}
          class="ml-auto hidden items-center gap-1 lg:flex"
        >
          <For each={NAV}>
            {(id) => (
              <a
                href={`#${id}`}
                aria-current={active() === id ? 'true' : undefined}
                class={
                  'rounded-md px-2.5 py-1.5 text-sm transition ' +
                  (active() === id ? 'text-brand' : 'text-mute hover:text-txt')
                }
              >
                {d().header.nav[id]}
              </a>
            )}
          </For>
        </nav>

        <div class="ml-auto flex items-center gap-2 lg:ml-1">
          <ContactLinks />

          {/* biome-ignore lint/a11y/useSemanticElements: 语言二选一不是页内 tab */}
          <div
            role="group"
            aria-label={d().header.langAria}
            class="flex items-center rounded-md border border-line bg-panel p-0.5"
          >
            <For each={LOCALES}>
              {(code) => (
                <button
                  type="button"
                  onClick={() => setLocale(code)}
                  aria-pressed={locale() === code}
                  class={
                    'rounded px-1.5 py-1 font-mono text-[11px] transition ' +
                    (locale() === code
                      ? 'bg-brand/15 text-brand'
                      : 'text-mute hover:text-txt')
                  }
                >
                  {LOCALE_SHORT[code]}
                </button>
              )}
            </For>
          </div>

          <button
            type="button"
            onClick={theme.cycle}
            title={f(d().header.themeTitle, {
              mode: d().header.theme[theme.mode()],
            })}
            aria-label={f(d().header.themeAria, {
              mode: d().header.theme[theme.mode()],
            })}
            class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel text-mute transition hover:border-brand/40 hover:text-txt"
          >
            <Switch>
              <Match when={theme.mode() === 'system'}>
                <Monitor size={15} aria-hidden />
              </Match>
              <Match when={theme.mode() === 'light'}>
                <Sun size={15} aria-hidden />
              </Match>
              <Match when={theme.mode() === 'dark'}>
                <Moon size={15} aria-hidden />
              </Match>
            </Switch>
          </button>

          <a
            href={props.repoUrl}
            rel="noreferrer"
            target="_blank"
            class="hidden items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-mute transition hover:text-txt sm:inline-flex"
          >
            <Code size={15} aria-hidden />
            {d().header.repo}
          </a>
          <a
            href={props.releasesUrl}
            rel="noreferrer"
            target="_blank"
            class="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-sm font-medium text-ink transition hover:brightness-110"
          >
            <Download size={15} aria-hidden />
            {d().header.download}
          </a>
        </div>
      </div>

      <div
        aria-hidden
        class="h-px origin-left bg-brand/70"
        style={{ transform: `scaleX(${progress()})` }}
      />
    </header>
  );
}
