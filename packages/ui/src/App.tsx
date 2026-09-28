import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from 'solid-js';
import { PANEL_HEIGHT_OVERLAY } from 'text-to-design-shared';
import { BridgeProvider, useBridge } from './bridge/useBridge';
import CameraLockToggle from './components/CameraLockToggle';
import CapabilityCard from './components/CapabilityCard';
import ConnectionHint from './components/ConnectionHint';
import LocaleSwitch from './components/LocaleSwitch';
import LogDrawer from './components/LogDrawer';
import LogTrigger from './components/LogTrigger';
import PanelHeightSync from './components/PanelHeightSync';
import SelectionCard from './components/SelectionCard';
import StatusBadge from './components/StatusBadge';
import ThemeToggle from './components/ThemeToggle';
import { locale, t } from './i18n/useLocale';

function Shell() {
  const { log, selection, status, rescan, clearLog, canResize, chromeHeight } =
    useBridge();

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

  /**
   * Escape 关日志抽屉。
   *
   * 挂在这里而不是抽屉组件里:抽屉的关闭要连带把焦点还给页头的入口,而那两个端点
   * (浮层 / 页头按钮)分处两个组件 —— 只有同时握着它们的 App 能一次做完。
   * 抽屉自身的遮罩、点外部与焦点接管仍归 `CollapsibleSection`。
   */
  createEffect(() => {
    if (!logOpen()) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeLog();
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  let rootEl: HTMLDivElement | undefined;

  /**
   * `<html lang>` 跟随当前语言(0016):面板文案换了而 lang 没换,屏读器仍按中文
   * 发音、字体回退也还是中文栈 —— 这是「看起来生效了、实际没换」的典型。
   * `ui.html` 里的字面量只是首帧之前的占位。
   */
  createEffect(() => {
    document.documentElement.lang = locale();
  });

  return (
    /*
      两种布局由宿主有没有 ui.resize 决定(见 docs/design-decisions/0014):
      - 有 → 根元素不定高(高度即内容高度),由 PanelHeightSync 量出来推给窗口收缩;
      - 没有 → 屏幕撑满固定窗口,剩余高度交给 SelectionCard 的 fill 吃掉。
      差别只在「谁承担剩余高度」,区块本身不变。

      **根元素是滚动容器**(`overflow-y-auto`):窗口高度有硬边界,内容超过它时
      得有人接管 —— 而 `html, body` 的 `overflow: hidden` 是为断宽度重排回环用的,
      不能撤。少了这一条,超限内容会既没滚动条也够不着,直接消失(0014 修订)。
    */
    <div
      ref={(el) => {
        rootEl = el;
      }}
      class={`flex flex-col gap-3 overflow-y-auto bg-base-200 p-4 ${
        canResize() ? '' : 'h-screen'
      }`}
    >
      {/*
        页头只承载「状态 / 工具」两类,不再重复宿主的身份信息:标题栏已给出插件名
        与图标;平台与端口曾是排查上下文,但常态下是噪声,已移除(端口仍可在
        日志抽屉的连接行里看到)。

        读序即优先级(左 → 右):状态徽章(全页唯一色块)→ 它的挽救动作(仅
        「没连上」时出现)→ 弹性留白 → 相机锁 → 主题 → 语言 → 日志入口(最右)。
      */}
      <header class="flex shrink-0 items-center gap-2">
        <StatusBadge />

        {/*
          重连动作紧贴状态徽章:状态与它的出路读成一件事。
          连上后整颗隐藏而非置灰 —— 常态面板里一颗永远不可用的按钮只是噪声;
          隐藏也不会挤动右侧工具簇(它左侧是 ml-auto 的弹性留白)。
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

        <div class="ml-auto flex shrink-0 items-center gap-0.5">
          <CameraLockToggle />
          <ThemeToggle />
          <LocaleSwitch />
          <LogTrigger
            ref={(el) => {
              triggerEl = el;
            }}
            unread={unread()}
            open={logOpen()}
            onClick={openLog}
          />
        </div>
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
        高度只由内容决定,浮层不进流 —— 所以它打开时窗口不会自己变高,
        得由 floor 显式抬下限(见 0015)。浮层取窗口的 85%,面板内容短到下限 300 时
        就只剩 255px,几乎看不了几行日志。
      */}
      <PanelHeightSync
        active={canResize()}
        target={() => rootEl}
        floor={() => (logOpen() ? PANEL_HEIGHT_OVERLAY : 0)}
        chromeHeight={chromeHeight}
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
