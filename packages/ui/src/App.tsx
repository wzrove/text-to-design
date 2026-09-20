import { createEffect, createMemo, createSignal } from 'solid-js';
import { BridgeProvider, useBridge } from './bridge/useBridge';
import CapabilityCard from './components/CapabilityCard';
import ConnectionHint from './components/ConnectionHint';
import EnvironmentBadge from './components/EnvironmentBadge';
import LogDrawer from './components/LogDrawer';
import Logo from './components/Logo';
import LogTrigger from './components/LogTrigger';
import PanelHeightSync from './components/PanelHeightSync';
import SelectionCard from './components/SelectionCard';
import StatusBadge from './components/StatusBadge';

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
      <header class="flex min-h-0 items-center gap-2">
        <Logo class="size-5 shrink-0" />
        <h1 class="min-w-0 flex-1 truncate text-lg font-bold text-base-content">
          text-to-design MCP Bridge
        </h1>
        <EnvironmentBadge platform={platform()} />
        <StatusBadge />
        <LogTrigger
          ref={(el) => {
            triggerEl = el;
          }}
          unread={unread()}
          open={logOpen()}
          onClick={openLog}
        />
        <button
          type="button"
          class="btn btn-ghost  hover:bg-white btn-xs text-base-content disabled:text-gray-500 disabled:cursor-not-allowed"
          title={
            status() === 'superseded'
              ? '夺回被另一个插件面板占用的通道'
              : '立即重连后台服务,不必等自动重连的退避间隔'
          }
          disabled={status() === 'connected'}
          onClick={() => rescan()}
        >
          {status() === 'superseded' ? '夺回' : '重试'}
        </button>
        <span
          class="badge badge-sm badge-ghost shrink-0 font-mono text-base-content/60"
          title="MCP 桥接端口(可用环境变量 TEXT_TO_DESIGN_MCP_PORT 修改)"
        >
          :{port()}
        </span>
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

      {/* 高度只由内容决定 —— 日志抽屉开合不再参与,否则开合都会把窗口顶一下 */}
      <PanelHeightSync active={canResize()} target={() => rootEl} />
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
