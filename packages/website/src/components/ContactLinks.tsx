import { Check } from 'lucide-solid';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { BRAND_PATHS } from '../brand-icons';
import { CONTACTS, type Contact } from '../content';
import { useLocale } from '../i18n/context';

/** 渠道图标按钮:有 href 跳转,有 value 复制,复制后短暂显示对勾 */
export default function ContactLinks(props: { class?: string }) {
  const { d, f } = useLocale();
  const [copied, setCopied] = createSignal('');
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function run(contact: Contact) {
    if (contact.href) {
      window.open(contact.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!contact.value) return;
    try {
      await navigator.clipboard.writeText(contact.value);
      setCopied(contact.id);
      clearTimeout(timer);
      timer = setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  }

  onCleanup(() => clearTimeout(timer));

  const label = (contact: Contact) => d().contacts.labels[contact.id];

  return (
    <div class={`flex items-center gap-1 ${props.class ?? ''}`}>
      <For each={CONTACTS}>
        {(contact) => (
          <button
            type="button"
            onClick={() => run(contact)}
            title={
              contact.value
                ? f(d().contacts.copyTitle, {
                    label: label(contact),
                    value: contact.value,
                  })
                : label(contact)
            }
            aria-label={
              contact.value
                ? f(d().contacts.copyAria, {
                    label: label(contact),
                    value: contact.value,
                  })
                : label(contact)
            }
            class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel text-mute transition hover:border-brand/40 hover:text-txt"
          >
            <Show
              when={copied() === contact.id}
              fallback={
                <Show
                  when={BRAND_PATHS[contact.id]}
                  fallback={
                    <span class="font-mono text-[10px]">
                      {label(contact).slice(0, 2)}
                    </span>
                  }
                >
                  {(path) => (
                    <svg
                      viewBox="0 0 24 24"
                      width={15}
                      height={15}
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d={path()} />
                    </svg>
                  )}
                </Show>
              }
            >
              <Check size={15} class="text-brand" aria-hidden />
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}
