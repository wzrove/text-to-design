import { Bug, Coffee } from '@lucide/solid';
import { createSignal, Show } from 'solid-js';
import logoUrl from '../../logo.svg';
import { t } from '../i18n/useLocale';
import { copyText } from '../utils/clipboard';
import { showToast } from '../utils/toast';
import { useEscapeKey } from '../utils/useEscapeKey';
import Tooltip from './Tooltip';

const GITHUB_URL = 'https://github.com/wzrove/text-to-design';
const ISSUE_URL = 'https://github.com/wzrove/text-to-design/issues/new';
const XHS_URL =
  'https://www.xiaohongshu.com/user/profile/6443fe5a0000000010026d02';
const QQ_GROUP = '1121373402';

// ISO/IEC 18004 Version 6-H (41x41, 30% EC, mask=4) for wxp://f2f0lgu74Kj7Cfz6KK9SOgxPv_pY5n0kKl2BgLMbVJxjcEM
const SPONSOR_QR_PATH =
  'M0,0h7v1h-7zM12,0h1v1h-1zM14,0h2v1h-2zM20,0h1v1h-1zM22,0h1v1h-1zM26,0h1v1h-1zM28,0h4v1h-4zM34,0h7v1h-7zM0,1h1v1h-1zM6,1h1v1h-1zM8,1h2v1h-2zM12,1h1v1h-1zM16,1h2v1h-2zM19,1h2v1h-2zM22,1h3v1h-3zM28,1h1v1h-1zM31,1h1v1h-1zM34,1h1v1h-1zM40,1h1v1h-1zM0,2h1v1h-1zM2,2h3v1h-3zM6,2h1v1h-1zM9,2h5v1h-5zM16,2h2v1h-2zM19,2h4v1h-4zM25,2h1v1h-1zM29,2h3v1h-3zM34,2h1v1h-1zM36,2h3v1h-3zM40,2h1v1h-1zM0,3h1v1h-1zM2,3h3v1h-3zM6,3h1v1h-1zM12,3h5v1h-5zM18,3h6v1h-6zM26,3h2v1h-2zM29,3h1v1h-1zM31,3h1v1h-1zM34,3h1v1h-1zM36,3h3v1h-3zM40,3h1v1h-1zM0,4h1v1h-1zM2,4h3v1h-3zM6,4h1v1h-1zM10,4h1v1h-1zM14,4h5v1h-5zM21,4h1v1h-1zM23,4h1v1h-1zM25,4h4v1h-4zM30,4h2v1h-2zM34,4h1v1h-1zM36,4h3v1h-3zM40,4h1v1h-1zM0,5h1v1h-1zM6,5h1v1h-1zM8,5h1v1h-1zM11,5h4v1h-4zM17,5h1v1h-1zM19,5h5v1h-5zM28,5h2v1h-2zM31,5h1v1h-1zM34,5h1v1h-1zM40,5h1v1h-1zM0,6h7v1h-7zM8,6h1v1h-1zM10,6h1v1h-1zM12,6h1v1h-1zM14,6h1v1h-1zM16,6h1v1h-1zM18,6h1v1h-1zM20,6h1v1h-1zM22,6h1v1h-1zM24,6h1v1h-1zM26,6h1v1h-1zM28,6h1v1h-1zM30,6h1v1h-1zM32,6h1v1h-1zM34,6h7v1h-7zM8,7h1v1h-1zM10,7h4v1h-4zM17,7h1v1h-1zM19,7h1v1h-1zM23,7h1v1h-1zM26,7h1v1h-1zM29,7h1v1h-1zM31,7h1v1h-1zM4,8h4v1h-4zM9,8h3v1h-3zM13,8h2v1h-2zM18,8h2v1h-2zM21,8h2v1h-2zM25,8h1v1h-1zM28,8h3v1h-3zM32,8h1v1h-1zM34,8h2v1h-2zM39,8h1v1h-1zM2,9h1v1h-1zM12,9h1v1h-1zM14,9h1v1h-1zM16,9h2v1h-2zM19,9h3v1h-3zM23,9h1v1h-1zM27,9h1v1h-1zM29,9h1v1h-1zM33,9h2v1h-2zM36,9h1v1h-1zM38,9h1v1h-1zM40,9h1v1h-1zM1,10h3v1h-3zM6,10h2v1h-2zM9,10h2v1h-2zM12,10h3v1h-3zM16,10h2v1h-2zM21,10h2v1h-2zM24,10h2v1h-2zM27,10h1v1h-1zM33,10h1v1h-1zM37,10h2v1h-2zM40,10h1v1h-1zM7,11h3v1h-3zM11,11h3v1h-3zM16,11h2v1h-2zM20,11h3v1h-3zM25,11h3v1h-3zM29,11h3v1h-3zM33,11h5v1h-5zM40,11h1v1h-1zM2,12h1v1h-1zM6,12h1v1h-1zM10,12h1v1h-1zM15,12h1v1h-1zM17,12h1v1h-1zM19,12h3v1h-3zM25,12h1v1h-1zM28,12h6v1h-6zM39,12h2v1h-2zM0,13h4v1h-4zM5,13h1v1h-1zM10,13h1v1h-1zM12,13h1v1h-1zM14,13h1v1h-1zM18,13h1v1h-1zM20,13h1v1h-1zM22,13h2v1h-2zM29,13h1v1h-1zM31,13h1v1h-1zM34,13h4v1h-4zM39,13h2v1h-2zM0,14h5v1h-5zM6,14h4v1h-4zM12,14h4v1h-4zM20,14h2v1h-2zM23,14h1v1h-1zM26,14h2v1h-2zM32,14h1v1h-1zM36,14h3v1h-3zM40,14h1v1h-1zM2,15h1v1h-1zM4,15h1v1h-1zM9,15h1v1h-1zM11,15h4v1h-4zM16,15h1v1h-1zM19,15h2v1h-2zM26,15h5v1h-5zM32,15h1v1h-1zM35,15h1v1h-1zM37,15h1v1h-1zM39,15h2v1h-2zM0,16h4v1h-4zM5,16h3v1h-3zM9,16h1v1h-1zM11,16h2v1h-2zM14,16h2v1h-2zM17,16h2v1h-2zM24,16h1v1h-1zM26,16h1v1h-1zM29,16h1v1h-1zM31,16h2v1h-2zM37,16h1v1h-1zM2,17h1v1h-1zM4,17h1v1h-1zM9,17h1v1h-1zM12,17h2v1h-2zM15,17h1v1h-1zM20,17h1v1h-1zM23,17h2v1h-2zM26,17h5v1h-5zM34,17h1v1h-1zM36,17h1v1h-1zM38,17h1v1h-1zM1,18h2v1h-2zM4,18h1v1h-1zM6,18h1v1h-1zM12,18h3v1h-3zM16,18h2v1h-2zM19,18h2v1h-2zM23,18h1v1h-1zM26,18h3v1h-3zM30,18h1v1h-1zM34,18h3v1h-3zM38,18h1v1h-1zM40,18h1v1h-1zM4,19h2v1h-2zM7,19h4v1h-4zM13,19h1v1h-1zM17,19h1v1h-1zM20,19h1v1h-1zM22,19h1v1h-1zM24,19h3v1h-3zM28,19h1v1h-1zM33,19h1v1h-1zM35,19h3v1h-3zM39,19h2v1h-2zM4,20h1v1h-1zM6,20h1v1h-1zM9,20h4v1h-4zM16,20h1v1h-1zM18,20h6v1h-6zM25,20h1v1h-1zM31,20h3v1h-3zM35,20h1v1h-1zM38,20h2v1h-2zM0,21h1v1h-1zM3,21h1v1h-1zM8,21h6v1h-6zM15,21h1v1h-1zM17,21h2v1h-2zM22,21h3v1h-3zM26,21h3v1h-3zM30,21h2v1h-2zM33,21h8v1h-8zM0,22h1v1h-1zM2,22h1v1h-1zM5,22h2v1h-2zM8,22h1v1h-1zM10,22h1v1h-1zM12,22h1v1h-1zM18,22h4v1h-4zM24,22h2v1h-2zM27,22h1v1h-1zM29,22h1v1h-1zM34,22h3v1h-3zM38,22h1v1h-1zM40,22h1v1h-1zM1,23h1v1h-1zM3,23h1v1h-1zM8,23h5v1h-5zM14,23h2v1h-2zM18,23h2v1h-2zM21,23h2v1h-2zM29,23h1v1h-1zM31,23h2v1h-2zM34,23h4v1h-4zM40,23h1v1h-1zM0,24h2v1h-2zM4,24h1v1h-1zM6,24h1v1h-1zM9,24h1v1h-1zM12,24h2v1h-2zM15,24h1v1h-1zM17,24h2v1h-2zM20,24h1v1h-1zM22,24h1v1h-1zM24,24h2v1h-2zM27,24h3v1h-3zM31,24h1v1h-1zM33,24h1v1h-1zM35,24h2v1h-2zM38,24h2v1h-2zM0,25h1v1h-1zM3,25h1v1h-1zM8,25h1v1h-1zM11,25h2v1h-2zM15,25h3v1h-3zM19,25h2v1h-2zM24,25h1v1h-1zM26,25h5v1h-5zM32,25h1v1h-1zM34,25h4v1h-4zM0,26h2v1h-2zM5,26h2v1h-2zM11,26h2v1h-2zM14,26h1v1h-1zM16,26h1v1h-1zM18,26h1v1h-1zM21,26h1v1h-1zM23,26h2v1h-2zM27,26h1v1h-1zM29,26h1v1h-1zM33,26h1v1h-1zM35,26h1v1h-1zM40,26h1v1h-1zM0,27h2v1h-2zM5,27h1v1h-1zM7,27h1v1h-1zM14,27h2v1h-2zM18,27h1v1h-1zM20,27h1v1h-1zM22,27h1v1h-1zM25,27h1v1h-1zM29,27h5v1h-5zM35,27h1v1h-1zM37,27h1v1h-1zM39,27h2v1h-2zM0,28h1v1h-1zM2,28h2v1h-2zM5,28h3v1h-3zM10,28h1v1h-1zM12,28h2v1h-2zM17,28h3v1h-3zM22,28h2v1h-2zM25,28h2v1h-2zM31,28h3v1h-3zM36,28h1v1h-1zM39,28h2v1h-2zM0,29h4v1h-4zM5,29h1v1h-1zM8,29h3v1h-3zM12,29h3v1h-3zM18,29h1v1h-1zM20,29h2v1h-2zM23,29h1v1h-1zM26,29h1v1h-1zM28,29h2v1h-2zM31,29h1v1h-1zM34,29h4v1h-4zM39,29h1v1h-1zM2,30h2v1h-2zM6,30h1v1h-1zM12,30h1v1h-1zM16,30h1v1h-1zM18,30h1v1h-1zM20,30h1v1h-1zM22,30h2v1h-2zM28,30h3v1h-3zM32,30h1v1h-1zM36,30h1v1h-1zM38,30h1v1h-1zM40,30h1v1h-1zM2,31h1v1h-1zM5,31h1v1h-1zM8,31h2v1h-2zM13,31h1v1h-1zM15,31h1v1h-1zM17,31h2v1h-2zM24,31h1v1h-1zM29,31h1v1h-1zM31,31h1v1h-1zM39,31h2v1h-2zM0,32h2v1h-2zM3,32h2v1h-2zM6,32h1v1h-1zM9,32h1v1h-1zM11,32h1v1h-1zM16,32h1v1h-1zM18,32h3v1h-3zM22,32h1v1h-1zM24,32h4v1h-4zM29,32h8v1h-8zM40,32h1v1h-1zM8,33h1v1h-1zM10,33h2v1h-2zM14,33h2v1h-2zM17,33h2v1h-2zM22,33h2v1h-2zM26,33h1v1h-1zM28,33h1v1h-1zM32,33h1v1h-1zM36,33h1v1h-1zM39,33h2v1h-2zM0,34h7v1h-7zM8,34h2v1h-2zM13,34h3v1h-3zM17,34h2v1h-2zM26,34h4v1h-4zM31,34h2v1h-2zM34,34h1v1h-1zM36,34h5v1h-5zM0,35h1v1h-1zM6,35h1v1h-1zM8,35h2v1h-2zM11,35h2v1h-2zM14,35h3v1h-3zM18,35h2v1h-2zM21,35h1v1h-1zM23,35h3v1h-3zM28,35h3v1h-3zM32,35h1v1h-1zM36,35h2v1h-2zM0,36h1v1h-1zM2,36h3v1h-3zM6,36h1v1h-1zM8,36h5v1h-5zM14,36h1v1h-1zM17,36h1v1h-1zM19,36h1v1h-1zM24,36h2v1h-2zM30,36h7v1h-7zM39,36h1v1h-1zM0,37h1v1h-1zM2,37h3v1h-3zM6,37h1v1h-1zM9,37h2v1h-2zM12,37h2v1h-2zM15,37h7v1h-7zM23,37h3v1h-3zM28,37h2v1h-2zM31,37h1v1h-1zM33,37h1v1h-1zM35,37h1v1h-1zM38,37h3v1h-3zM0,38h1v1h-1zM2,38h3v1h-3zM6,38h1v1h-1zM10,38h1v1h-1zM13,38h3v1h-3zM17,38h1v1h-1zM19,38h1v1h-1zM21,38h2v1h-2zM25,38h3v1h-3zM29,38h5v1h-5zM35,38h1v1h-1zM38,38h3v1h-3zM0,39h1v1h-1zM6,39h1v1h-1zM10,39h2v1h-2zM14,39h1v1h-1zM16,39h4v1h-4zM22,39h1v1h-1zM24,39h1v1h-1zM28,39h2v1h-2zM31,39h3v1h-3zM35,39h1v1h-1zM37,39h1v1h-1zM39,39h2v1h-2zM0,40h7v1h-7zM11,40h2v1h-2zM14,40h1v1h-1zM16,40h2v1h-2zM19,40h1v1h-1zM21,40h1v1h-1zM26,40h1v1h-1zM29,40h1v1h-1zM31,40h2v1h-2zM34,40h1v1h-1zM36,40h4v1h-4z';

function GitHubIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-2.16c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function XiaohongshuIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5"
        stroke="currentColor"
        stroke-width="1.8"
      />
      <path
        d="M8.5 7.2 6.8 10.6h2.6l-1.9 3.6h2.8M6.5 16.5h4.2M12.2 8.2h5.3M14.85 8.2v8M11.8 16.2h6"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function QqIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21.39 15.04c-.4-1.56-1.48-3.03-2.31-3.93.14-.62.21-1.27.21-1.94C19.29 4.74 16.03 2 12 2S4.71 4.74 4.71 9.17c0 .67.07 1.32.21 1.94-.83.9-1.91 2.37-2.31 3.93-.47 1.82.11 2.66.71 2.75.47.07 1.07-.37 1.66-1.15.32.78.82 1.48 1.47 2.02-.77.41-1.35.95-1.35 1.54 0 .99 1.64 1.8 3.66 1.8 1.32 0 2.48-.34 3.12-.86.08.01.16.01.24.01s.16 0 .24-.01c.64.52 1.8.86 3.12.86 2.02 0 3.66-.81 3.66-1.8 0-.59-.58-1.13-1.35-1.54.65-.54 1.15-1.24 1.47-2.02.59.78 1.19 1.22 1.66 1.15.6-.09 1.18-.93.71-2.75Z" />
    </svg>
  );
}

export default function ContactFooter() {
  const [hovered, setHovered] = createSignal(false);
  const [pinned, setPinned] = createSignal(false);
  const showQr = () => hovered() || pinned();

  const closeQr = (): void => {
    setHovered(false);
    setPinned(false);
  };
  useEscapeKey(showQr, closeQr);

  const copyQq = async (): Promise<void> => {
    const ok = await copyText(QQ_GROUP);
    showToast(
      ok ? t('contact.qq.copied', { qq: QQ_GROUP }) : t('toast.copy.failed'),
      ok ? 'success' : 'error',
    );
  };

  return (
    <footer
      data-tour="contact"
      class="flex shrink-0 items-center justify-between px-1 text-[11px] text-base-content/45"
    >
      <span>{t('header.contact')}</span>
      <div class="flex items-center gap-1">
        <Tooltip tip={t('contact.github')} position="top" class="shrink-0">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('contact.github')}
            class="btn btn-ghost btn-xs px-1 text-base-content/55 hover:text-base-content"
          >
            <GitHubIcon />
          </a>
        </Tooltip>
        <Tooltip tip={t('contact.feedback')} position="top" class="shrink-0">
          <a
            href={ISSUE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('contact.feedback')}
            class="btn btn-ghost btn-xs px-1 text-base-content/55 hover:text-base-content"
          >
            <Bug size={14} />
          </a>
        </Tooltip>
        <Tooltip tip={t('contact.xhs')} position="top" class="shrink-0">
          <a
            href={XHS_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('contact.xhs')}
            class="btn btn-ghost btn-xs px-1 text-base-content/55 hover:text-[#FF2442]"
          >
            <XiaohongshuIcon />
          </a>
        </Tooltip>
        <Tooltip
          tip={t('contact.qq.tip', { qq: QQ_GROUP })}
          position="top"
          class="shrink-0"
        >
          <button
            type="button"
            aria-label={t('contact.qq.tip', { qq: QQ_GROUP })}
            class="btn btn-ghost btn-xs px-1 text-base-content/55 hover:text-[#12B7F5]"
            onClick={copyQq}
          >
            <QqIcon />
          </button>
        </Tooltip>
        <div
          class="relative shrink-0"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusIn={() => setHovered(true)}
          onFocusOut={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setHovered(false);
            }
          }}
        >
          <button
            type="button"
            aria-label={t('contact.coffee.tip')}
            aria-expanded={showQr() ? 'true' : 'false'}
            class="btn btn-ghost btn-xs px-1 text-base-content/55 hover:text-amber-500"
            onClick={() => setPinned((v) => !v)}
          >
            <Coffee size={14} />
          </button>

          <Show when={pinned()}>
            <button
              type="button"
              tabindex={-1}
              aria-hidden="true"
              class="fixed inset-0 z-40 cursor-default"
              onClick={closeQr}
            />
          </Show>

          <Show when={showQr()}>
            <div
              role="tooltip"
              class="absolute right-0 bottom-full z-50 mb-1.5 w-[164px] rounded-box border border-base-300 bg-base-100 p-2.5 text-center text-base-content shadow-xl"
            >
              <p class="text-[11px] font-medium text-base-content/85">
                {t('contact.coffee.tip')}
              </p>
              <div class="relative mx-auto mt-1.5 inline-block rounded-md border border-base-300/60 bg-white p-1.5 text-neutral-900">
                <svg
                  width="128"
                  height="128"
                  viewBox="-2 -2 45 45"
                  shape-rendering="crispEdges"
                  fill="currentColor"
                  role="img"
                  aria-label={t('contact.coffee.qrLabel')}
                >
                  <path d={SPONSOR_QR_PATH} />
                </svg>
                <img
                  src={logoUrl}
                  alt=""
                  aria-hidden="true"
                  class="pointer-events-none absolute top-1/2 left-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded bg-white p-0.5 shadow-sm"
                />
              </div>
            </div>
          </Show>
        </div>
      </div>
    </footer>
  );
}
