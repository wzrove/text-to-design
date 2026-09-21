import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { PANEL_HEIGHT_LOG, PLATFORM_LABEL } from 'text-to-design-shared';
import { BridgeProvider, useBridge } from './bridge/useBridge';
import CapabilityCard from './components/CapabilityCard';
import ConnectionHint from './components/ConnectionHint';
import LocaleSwitch from './components/LocaleSwitch';
import LogDrawer from './components/LogDrawer';
import LogTrigger from './components/LogTrigger';
import PanelHeightSync from './components/PanelHeightSync';
import SelectionCard from './components/SelectionCard';
import StatusBadge from './components/StatusBadge';
import { locale, t } from './i18n/useLocale';

function Shell() {
  const {
    port,
    log,
    selection,
    platform,
    status,
    rescan,
    clearLog,
    canResize,
  } = useBridge();

  const [logOpen, setLogOpen] = createSignal(false);

  /**
   * 未读水位按「错误条数累计」记,而不是最大 id:同一行日志会被 pushLog 合并成
   * 计数(id 不变),按 id 记会让复发的同一错误永远不算未读 —— 偏偏复发才是最
   * 该被看见的那种。
   */
  const errorTotal = createMemo(() =>
    log().reduce((n, e) => (e.level === 'error' ? n + (e.count ?? 1) : n), 0),
  );
  const [seenErrors, setSeenErrors] = createSignal(0);
  // 清空后水位随之归零,否则清零后的第一条错误会被旧水位吃掉
  createEffect(() => {
    if (log().length === 0) setSeenErrors(0);
  });
  const unread = createMemo(() => Math.max(0, errorTotal() - seenErrors()));

  let triggerEl: HTMLButtonElement | undefined;
  const openLog = (): void => {
    setSeenErrors(errorTotal());
    setLogOpen(true);
  };
  const closeLog = (): void => {
    setSeenErrors(errorTotal());
    setLogOpen(false);
    // 焦点还给入口:抽屉是模态,关掉后焦点不能掉在 body 上
    triggerEl?.focus();
  };

  let rootEl: HTMLDivElement | undefined;

  /**
   * `<html lang>` 跟随当前语言(0016):面板文案换了而 lang 没换,屏读器仍按中文
   * 发音、字体回退也还是中文栈 —— 这是「看起来生效了、实际没换」的典型。
   * `ui.html` 里的字面量只是首帧之前的占位。
   */
  createEffect(() => {
    document.documentElement.lang = locale();
  });

  /**
   * 平台名 + 端口合成一行排查上下文。
   * 平台由插件 code 侧上报,首帧还没有 —— 此时只留端口,不留孤零零的分隔符。
   */
  const meta = createMemo(() => {
    const p = platform();
    return p
      ? t('header.meta', { platform: PLATFORM_LABEL[p], port: port() })
      : t('header.meta.portOnly', { port: port() });
  });
  const metaTitle = createMemo(() => {
    const p = platform();
    return p
      ? t('header.meta.title', { platform: PLATFORM_LABEL[p], port: port() })
      : t('header.meta.titleUnknown', { port: port() });
  });

  return (
    /*
      两种布局由宿主有没有 ui.resize 决定(见 docs/design-decisions/0014):
      - 有 → 根元素不定高(高度即内容高度),由 PanelHeightSync 量出来推给窗口收缩;
      - 没有 → h-screen 撑满固定窗口,剩余高度交给 SelectionCard 的 fill 吃掉。
      差别只在「谁承担剩余高度」,区块本身不变。
    */
    <div
      ref={(el) => {
        rootEl = el;
      }}
      class={`flex flex-col gap-3 bg-base-200 p-4 ${
        canResize() ? '' : 'h-screen'
      }`}
    >
      {/*
        页头只承载「状态 / 元信息 / 工具」三类,不再重复宿主的身份信息:标题栏已
        给出插件名与图标,面板里再排一遍 Logo + 标题是把同一句话说两遍,而 360 宽
        下标题只会被 truncate 成省略号噪声 —— 挤掉的正是唯一要看的连接状态。

        读序即优先级(左 → 右):状态徽章(全页唯一色块)→ 它的挽救动作(仅
        「没连上」时出现)→ 平台与端口(mono 小字,排查用)→ 语言 → 日志入口(最右)。
      */}
      <header class="flex shrink-0 items-center gap-2">
        <StatusBadge />

        {/*
          重连动作紧贴状态徽章:状态与它的出路读成一件事。
          连上后整颗隐藏而非置灰 —— 常态面板里一颗永远不可用的按钮只是噪声;
          隐藏也不会挤动右侧工具簇(它右侧是 ml-auto 的弹性留白)。
        */}
        <Show when={status() !== 'connected'}>
          <button
            type="button"
            class="btn btn-ghost btn-xs shrink-0 px-1.5 text-base-content/70 hover:text-base-content"
            title={
              status() === 'superseded'
                ? t('header.reclaim.title')
                : t('header.retry.title')
            }
            onClick={() => rescan()}
          >
            {status() === 'superseded'
              ? t('header.reclaim')
              : t('header.retry')}
          </button>
        </Show>

        <span
          class="ml-auto min-w-0 truncate font-mono text-[10px] text-base-content/60"
          title={metaTitle()}
        >
          {meta()}
        </span>

        <LocaleSwitch />

        <LogTrigger
          ref={(el) => {
            triggerEl = el;
          }}
          unread={unread()}
          open={logOpen()}
          onClick={openLog}
        />
      </header>

      <ConnectionHint />

      <SelectionCard data={selection()} fill={!canResize()} />

      <CapabilityCard />

      <LogDrawer
        open={logOpen()}
        entries={log()}
        onClose={closeLog}
        onClear={clearLog}
      />

      {/*
        高度只由内容决定,日志抽屉是 fixed 浮层、不进流 —— 所以它打开时窗口不会自己变高,
        得由 floor 显式抬下限(见 0015)。抽屉取窗口的 85%,面板内容短到下限 300 时
        drawer 就只剩 255px,几乎看不了几行日志。
      */}
      <PanelHeightSync
        active={canResize()}
        target={() => rootEl}
        floor={() => (logOpen() ? PANEL_HEIGHT_LOG : 0)}
      />
    </div>
  );
}

export default function App() {
  return (
    <BridgeProvider>
      <Shell />
    </BridgeProvider>
  );
}
