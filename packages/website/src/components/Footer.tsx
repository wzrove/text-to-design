import { For, Show } from 'solid-js';
import { CONTACTS, RELEASES_URL, REPO_URL } from '../content';
import { revealDelay } from '../motion';
import CopyButton from './CopyButton';

const LINKS = [
  { href: RELEASES_URL, label: '插件产物 / Releases' },
  { href: REPO_URL, label: '源码仓库' },
  {
    href: `${REPO_URL}/blob/main/packages/mcp-server/README.md`,
    label: '完整工具清单',
  },
  { href: `${REPO_URL}/blob/main/README.md`, label: '安装与排查原文' },
];

export default function Footer() {
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
            AI 助手 × 设计软件画布的桥。MIT
            许可,后台服务与插件产物都公开在仓库里。
          </p>
        </div>

        <nav aria-label="资源链接" data-reveal="up" style={revealDelay(1)}>
          <p class="mono-label">资源</p>
          <ul class="mt-4 space-y-2.5 text-sm">
            {LINKS.map((link) => (
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
          <p class="mono-label">分发</p>
          <ul class="mt-4 space-y-2 font-mono text-xs text-mute">
            <li>text-to-design-mcp(后台服务)</li>
            <li>text-to-design-ui(三平台插件)</li>
            <li>端口 47812 / 47820</li>
          </ul>
        </div>

        <div data-reveal="up" style={revealDelay(3)}>
          <p class="mono-label">联系我们</p>
          <ul class="mt-4 space-y-3 text-sm">
            <For each={CONTACTS}>
              {(contact) => (
                <Show when={contact.value}>
                  {(value) => (
                    <li class="flex flex-wrap items-center gap-2">
                      <span class="text-mute">{contact.label}</span>
                      <code class="font-mono text-code">{value()}</code>
                      <CopyButton
                        text={value()}
                        label={`复制${contact.label}`}
                      />
                    </li>
                  )}
                </Show>
              )}
            </For>
          </ul>
          <p class="mt-3 text-xs leading-relaxed text-mute">
            加群备注「text-to-design」,问题优先在仓库 Issue 留档。
          </p>
        </div>
      </div>
    </footer>
  );
}
