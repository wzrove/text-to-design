import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from 'solid-js';
import {
  PANEL_HEIGHT_OVERLAY,
  PANEL_MINIMIZED_SIZE,
  PANEL_RESIZE_STEP,
  type UiMinimizeMessage,
} from 'text-to-design-shared';
import { postToCode } from './bridge/codeChannel';
import { BridgeProvider, useBridge } from './bridge/useBridge';
import CameraLockToggle from './components/CameraLockToggle';
import CapabilityCard from './components/CapabilityCard';
import ConnectionHint from './components/ConnectionHint';
import LocaleSwitch from './components/LocaleSwitch';
import LogDrawer from './components/LogDrawer';
import LogTrigger from './components/LogTrigger';
import MinimizedLogo from './components/MinimizedLogo';
import MinimizeToggle from './components/MinimizeToggle';
import PanelHeightSync from './components/PanelHeightSync';
import SelectionCard from './components/SelectionCard';
import StatusBadge from './components/StatusBadge';
import ThemeToggle from './components/ThemeToggle';
import ToastHost from './components/Toast';
import Tooltip from './components/Tooltip';
import UpgradeButton from './components/UpgradeButton';
import UpgradeModal from './components/UpgradeModal';
import { locale, t } from './i18n/useLocale';
import { APP_VERSION, isOutdated } from './utils/version';

function Shell() {
  const {
    log,
    selection,
    status,
    rescan,
    clearLog,
    canResize,
    chromeHeight,
    latest,
    daemonVersion,
  } = useBridge();

  const [logOpen, setLogOpen] = createSignal(false);
  const [upgradeOpen, setUpgradeOpen] = createSignal(false);

  /**
   * 最小化模式:UI 只切模式,尺寸由 code 侧按模式算(见 shared/panel.ts)。
   *
   * 切 signal 与发消息收在同一处 —— 只在按钮里发消息则本地渲染树不换,只切 signal
   * 则窗口不缩,两个半态都是可见的错误形态。
   *
   * **初值按视口宽度认,不写死 false**(重载兜底):最小化还要改宿主标题栏文字,而
   * 标题只能靠 showUI 的 options —— 再次 showUI 会重建 iframe(Figma 的 typings 已写明,
   * 见 plugin-api.d.ts:365),面板会以「整棵面板树 + 50px 窗口」重启:logo 不在、
   * 双击无从谈起,面板就此锁死。
   *
   * 为什么宽度能认:宽度只有最小化态才不是 360(常态宽度由宿主定,最小化态是正方形),
   * 「≤ PANEL_MINIMIZED_SIZE + 容差」这一侧因此只可能是最小化。容差是**借** PANEL_RESIZE_STEP
   * 的值,不是它的语义:PANEL_RESIZE_STEP 是改高度的发送阈值(防抖/吸附),测量余量另有
   * PANEL_HEIGHT_SLACK。这里只是要一个量级 —— 给宿主内容区与请求尺寸之间的取整差留口子,
   * 差几像素仍须认成最小化,否则面板照样锁死。
   *
   * 为什么补推兜不住这一态(dec 28008c70):补推到达前那几帧已按展开态渲染,而 50px
   * 窗口里没有任何可点的入口 —— 那几帧就是锁死本身,所以初值必须自己认得出来,不能等。
   * code 侧在 showUI 之后确实会补推启动帧,但那是给 iframe 重建后的其余状态用的
   * (canResize / 能力表 / 语言 / 选中),最小化模式不在其中:code 侧的 minimized 本来就是
   * true、窗口也已经是对的,补推只是把同一件事再说一遍,故这里也不发消息。
   */
  const [minimized, setMinimized] = createSignal(
    window.innerWidth <= PANEL_MINIMIZED_SIZE + PANEL_RESIZE_STEP,
  );
  const setMinimize = (next: boolean): void => {
    setMinimized(next);
    const message: UiMinimizeMessage = { type: 'ui_minimize', minimized: next };
    postToCode(message);
  };
  const minimize = (): void => setMinimize(true);
  const restore = (): void => setMinimize(false);

  /**
   * 有没有新版本:插件侧比**自己**的版本(构建期注入),服务侧比 daemon 自报的
   * 版本(status 帧)。两侧独立 —— 用户可能只升了其中一个(见 0038)。
   *
   * `latest` 为 null 的一侧不参与:没查到就是没事实,不提示。
   */
  const hasUpgrade = (): boolean =>
    isOutdated(APP_VERSION, latest().ui) ||
    isOutdated(daemonVersion(), latest().mcp);

  const closeUpgrade = (): void => {
    setUpgradeOpen(false);
    upgradeEl?.focus();
  };

  let upgradeEl: HTMLButtonElement | undefined;

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

  /**
   * 升级弹窗的关闭收口:焦点还给页头那颗钮。
   *
   * 弹窗没有走 `showModal()`(那会把 dialog 送进 top-layer 盖住 toast,见
   * UpgradeModal 的类注释),原生 Esc 因此不可用 —— Esc 与日志抽屉同一条纪律,
   * 收口放在这里是因为「弹窗 / 页头按钮」分处两个组件,只有 App 同时握着两端。
   */
  createEffect(() => {
    if (!upgradeOpen()) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeUpgrade();
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

  /*
    两种布局由宿主有没有 ui.resize 决定(见 docs/design-decisions/0014):
    - 有 → 根元素不定高(高度即内容高度),由 PanelHeightSync 量出来推给窗口收缩;
    - 没有 → 屏幕撑满固定窗口,剩余高度交给 SelectionCard 的 fill 吃掉。
    差别只在「谁承担剩余高度」,区块本身不变。

    **根元素是滚动容器**(`overflow-y-auto`):窗口高度有硬边界,内容超过它时
    得有人接管 —— 而 `html, body` 的 `overflow: hidden` 是为断宽度重排回环用的,
    不能撤。少了这一条,超限内容会既没滚动条也够不着,直接消失(0014 修订)。

    `overflow-x-hidden` 是配套的:CSS 里一条轴是 auto,另一条的 visible 也会被算成
    auto,于是任何绝对定位的后代(如 Tooltip 静止态的气泡,实测探出右缘 25px)都会
    撑出一条横向滚动条。横向本来就没有要滚的东西 —— 面板宽度由宿主定。
  */
  /*
    最小化时整棵面板树卸载(含 PanelHeightSync):它在 50px 窗口里的测量没有意义,
    会把手改回内容高 —— 那个窗口里量出来的内容高是自相矛盾的。
  */
  return (
    <Show when={!minimized()} fallback={<MinimizedLogo onRestore={restore} />}>
      <div
        ref={(el) => {
          rootEl = el;
        }}
        class={`flex flex-col gap-3 overflow-x-hidden overflow-y-auto bg-base-200 p-4 ${
          canResize() ? '' : 'h-screen'
        }`}
      >
        {/*
          页头只承载「状态 / 工具」两类,不再重复宿主的身份信息:标题栏已给出插件名
          与图标;平台与端口曾是排查上下文,但常态下是噪声,已移除(端口仍可在
          日志抽屉的连接行里看到)。

          读序即优先级(左 → 右):状态徽章(全页唯一色块)→ 它的挽救动作(仅
          「没连上」时出现)→ 弹性留白 → 相机锁 → 主题 → 语言 → 日志入口 →
          最小化(最右,仅宿主支持改尺寸时挂 —— 缩不下去的钮是死键)。
        */}
        <header class="flex shrink-0 items-center gap-2">
          <StatusBadge />

          {/*
            重连动作紧贴状态徽章:状态与它的出路读成一件事。
            连上后整颗隐藏而非置灰 —— 常态面板里一颗永远不可用的按钮只是噪声;
            隐藏也不会挤动右侧工具簇(它左侧是 ml-auto 的弹性留白)。

            提示气泡的对齐由 Tooltip 量边界决定(见 Tooltip)。
          */}
          <Show when={status() !== 'connected'}>
            <Tooltip
              class="shrink-0"
              tip={
                status() === 'superseded'
                  ? t('header.reclaim.title')
                  : t('header.retry.title')
              }
            >
              <button
                type="button"
                class="btn btn-ghost btn-xs shrink-0 px-1.5 text-base-content/70 hover:text-base-content"
                onClick={() => rescan()}
              >
                {status() === 'superseded'
                  ? t('header.reclaim')
                  : t('header.retry')}
              </button>
            </Tooltip>
          </Show>

          <div class="ml-auto flex shrink-0 items-center gap-0.5">
            {/* 有新版本才挂:常态不占页头宽度(见 0038) */}
            <Show when={hasUpgrade()}>
              <UpgradeButton
                ref={(el) => {
                  upgradeEl = el;
                }}
                onClick={() => setUpgradeOpen(true)}
              />
            </Show>
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
            {/* 宿主没有 ui.resize 时窗口缩不下去,不挂一颗按不动的钮 */}
            <Show when={canResize()}>
              <MinimizeToggle onClick={minimize} />
            </Show>
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

        {/* 操作结果的提示:浮层,不进流,面板高度不受影响(0014) */}
        <ToastHost />

        {/* 升级步骤:浮层,不进流,面板高度不受影响(0014) */}
        <UpgradeModal
          open={upgradeOpen()}
          current={{ ui: APP_VERSION, mcp: daemonVersion() }}
          latest={latest()}
          onClose={closeUpgrade}
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
    </Show>
  );
}

export default function App() {
  return (
    <BridgeProvider>
      <Shell />
    </BridgeProvider>
  );
}
