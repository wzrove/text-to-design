import { For, Show } from 'solid-js';
import { CONTACTS, RELEASES_URL, REPO_URL } from '../content';
import { useLocale } from '../i18n/context';
import { revealDelay } from '../motion';
import CopyButton from './CopyButton';

export default function Footer() {
  const { d, f } = useLocale();
  const links = () => [
    { href: RELEASES_URL, label: d().footer.links.releases },
    { href: REPO_URL, label: d().footer.links.repo },
    {
      href: `${REPO_URL}/blob/main/packages/mcp-server/README.md`,
      label: d().footer.links.tools,
    },
    { href: `${REPO_URL}/blob/main/README.md`, label: d().footer.links.readme },
  ];

  return (
    <footer class="border-t border-line/70 bg-panel/40">
      <div class="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_0.9fr]">
        <div data-reveal="up">
          <div class="flex items-center gap-2.5">
            <img
              src="/logo.svg"
              alt=""
              width={26}
              height={26}
              class="rounded-[6px]"
            />
            <span class="font-mono text-sm text-txt">text-to-design</span>
          </div>
          <p class="mt-3 max-w-sm text-sm leading-relaxed text-mute">
            {d().footer.blurb}
          </p>
        </div>

        <nav
          aria-label={d().footer.resources}
          data-reveal="up"
          style={revealDelay(1)}
        >
          <p class="mono-label">{d().footer.resources}</p>
          <ul class="mt-4 space-y-2.5 text-sm">
            {links().map((link) => (
              <li>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  class="text-mute transition-colors hover:text-txt"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div data-reveal="up" style={revealDelay(2)}>
          <p class="mono-label">{d().footer.distribution}</p>
          <ul class="mt-4 space-y-2 font-mono text-xs text-mute">
            <For each={d().footer.distributionItems}>
              {(item) => <li>{item}</li>}
            </For>
          </ul>
        </div>

        <div data-reveal="up" style={revealDelay(3)}>
          <p class="mono-label">{d().footer.contact}</p>
          <ul class="mt-4 space-y-3 text-sm">
            <For each={CONTACTS}>
              {(contact) => (
                <Show when={contact.value}>
                  {(value) => (
                    <li class="flex flex-wrap items-center gap-2">
                      <span class="text-mute">
                        {d().contacts.labels[contact.id]}
                      </span>
                      <code class="font-mono text-code">{value()}</code>
                      <CopyButton
                        text={value()}
                        label={f(d().footer.copyContact, {
                          label: d().contacts.labels[contact.id],
                        })}
                      />
                    </li>
                  )}
                </Show>
              )}
            </For>
          </ul>
          <p class="mt-3 text-xs leading-relaxed text-mute">
            {d().footer.contactNote}
          </p>
        </div>
      </div>
    </footer>
  );
}
