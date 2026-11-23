import { For, Show } from 'solid-js';
import { t } from '../i18n/useLocale';
import { copyWithToast } from '../utils/clipboard';
import { isOutdated } from '../utils/version';
import DialogShell from './DialogShell';

/** 插件包下载地址(与 ConnectionHint 的 GITHUB_URL 同为组件内常量) */
const RELEASES_URL = 'https://github.com/wzrove/text-to-design/releases';

/**
 * 升级步骤弹窗(见 0038)。外壳见 DialogShell(含 top-layer 取舍说明)。
 *
 * 与仓库另两处浮层的分工:Esc 与焦点归还仍由调用方(App.tsx)收口 ——
 * 关闭要连带把焦点还给页头那颗钮,而两端分处两个组件,只有 App 同时握着。
 *
 * **不自动升级**:只给步骤和一段可复制给 AI 助手的指令。跨进程改用户的安装
 * 不在面板的职责里,做错了代价远大于多点一下。
 */
export default function UpgradeModal(props: {
  open: boolean;
  current: { ui: string; mcp: string };
  latest: { ui: string | null; mcp: string | null };
  onClose: () => void;
}) {
  /** 哪一侧落后(latest 未知时不判定,按「不动」显示) */
  const outdated = () => ({
    ui: isOutdated(props.current.ui, props.latest.ui),
    mcp: isOutdated(props.current.mcp, props.latest.mcp),
  });

  /**
   * 版本对照只列落后的一侧:已对齐那行(如 0.13.12 → 0.13.12)是纯噪声,
   * 还会让人以为后台服务也要升。两侧都对齐时(理论上开不出这一步)退回全列。
   */
  const rows = () => {
    const all = [
      {
        label: t('upgrade.plugin.label'),
        current: props.current.ui,
        latest: props.latest.ui,
      },
      {
        label: t('upgrade.service.label'),
        current: props.current.mcp,
        latest: props.latest.mcp,
      },
    ];
    const diff = all.filter(
      (row) => row.latest == null || isOutdated(row.current, row.latest),
    );
    return diff.length > 0 ? diff : all;
  };

  /**
   * 一步的两种形态:整句(`text`),或 head / 链接 / tail 三段(`link` 存在时)。
   * 插件那步走后者 —— 包名本身要能点,整句渲染就只能整句可点。
   * 只收真正要升的那几步,序号由渲染时的下标给(文案里不带 ①②③)。
   */
  type Step = { text?: string; head?: string; link?: string; tail?: string };

  const steps = (): Step[] => {
    const list: Step[] = [];
    if (outdated().mcp) list.push({ text: t('upgrade.step.service') });
    if (outdated().ui)
      list.push({
        head: t('upgrade.step.plugin.head'),
        link: 'text-to-design-ui',
        tail: t('upgrade.step.plugin.tail'),
      });
    list.push({ text: t('upgrade.step.verify') });
    return list;
  };

  /** 复制给 AI 助手的指令:版本与下载地址都带上,省得它再问一遍 */
  const promptText = (): string =>
    `${t('upgrade.prompt', {
      ui: props.current.ui,
      uiLatest: props.latest.ui ?? props.current.ui,
      mcp: props.current.mcp,
      mcpLatest: props.latest.mcp ?? props.current.mcp,
    })}\n${RELEASES_URL}`;

  return (
    /*
      四段式:标题(固定)/ 版本信息(固定)/ 步骤(滚动)/ 操作条(固定)。
      高度写成**上限** `max-h-[min(24rem,80vh)]` 而不是定高:只落后一侧时步骤
      会少一两条,定高会在底部留一大块空白;面板窗口被压矮时仍由步骤区滚,
      操作条不被挤出(纯 vh 那条路试过,操作条会被顶走)。

      只有步骤区滚:版本信息是**读一遍就够的对照表**,它跟着滚会失去「我当前在
      哪、要去哪」这个锚点;而步骤是逐条执行的长文,才是需要滚动的那一段。
      所以版本块做成凹进 base-200 的信息块与滚动区在视觉上分开。

      滚动区 `min-h-0` 是 flex 列里滚动容器的必需项:少了它,内容会把容器撑高、
      `overflow-y-auto` 永远不生效(滚动落到外层,操作条被顶走)。
    */
    <DialogShell
      open={props.open}
      title={t('upgrade.modal.title')}
      onClose={props.onClose}
      class="max-h-[min(24rem,80vh)]"
    >
      <div class="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
        {/*
          两列一行,不再两行:版本对照是「扫一眼」的信息,纵向空间该让给步骤。
          用 `x → y` 表达(current / latest 两个词退到 sr-only,屏读器仍读得出
          「当前 0.7.0 最新 0.8.0」),视觉上省掉两个标签的宽度。
          单列时英文 `Background service` 会把行撑破,故 en 侧标签同步收到 `Service`。
        行数会随「只有一侧落后」减到 1,所以用 flex-wrap,不是两列网格。
        */}
        <div class="flex shrink-0 flex-wrap gap-x-3 gap-y-1 rounded-box border border-base-300 bg-base-200 px-2.5 py-1.5 text-[11px]">
          <For each={rows()}>
            {(row) => (
              <div class="flex min-w-0 items-center gap-1">
                <span class="shrink-0 text-base-content/70">{row.label}</span>
                <span class="truncate">{row.current}</span>
                <Show
                  when={row.latest != null}
                  fallback={
                    <span class="truncate text-base-content/50">
                      {t('upgrade.latestUnknown')}
                    </span>
                  }
                >
                  <span aria-hidden="true">→</span>
                  <span class="truncate text-primary">{row.latest}</span>
                </Show>
                <span class="sr-only">
                  <Show
                    when={row.latest != null}
                    fallback={t('upgrade.current', { version: row.current })}
                  >
                    {`${t('upgrade.current', { version: row.current })} ${t('upgrade.latest', { version: row.latest ?? row.current })}`}
                  </Show>
                </span>
              </div>
            )}
          </For>
        </div>

        <ol class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain text-xs leading-relaxed">
          <For each={steps()}>
            {(step, i) => (
              <li class="flex gap-1.5">
                <span
                  aria-hidden="true"
                  class="shrink-0 text-base-content/50 tabular-nums"
                >
                  {i() + 1}
                </span>
                <span class="min-w-0 flex-1">
                  {step.head ?? ''}
                  <Show when={step.link != null}>
                    <a
                      href={RELEASES_URL}
                      target="_blank"
                      rel="noreferrer"
                      class="link text-primary"
                    >
                      {step.link}
                    </a>
                  </Show>
                  {step.head != null ? step.tail : step.text}
                </span>
              </li>
            )}
          </For>
        </ol>

        <div class="modal-action mt-0 shrink-0 justify-between">
          {/* 手动换包这段不必靠 AI:发布页直接可达 */}
          <a
            class="btn btn-xs btn-ghost"
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
          >
            {t('upgrade.openReleases')}
          </a>
          <button
            type="button"
            class="btn btn-xs btn-primary"
            onClick={() => copyWithToast(promptText())}
          >
            {t('upgrade.copy')}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
