import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from 'solid-js';
import type { ActivityPhase, PluginPlatform } from 'text-to-design-shared';
import {
  ACTIVITY_SETTLE_MS,
  UI_CHROME_DEFAULT,
  WS_PORT,
} from 'text-to-design-shared';
import { applyStoredChoice, t } from '../i18n/useLocale';
import type { BridgeStatus } from './BridgeSocket';
import { BridgeSocket } from './BridgeSocket';
import type { CapabilitySnapshot, LogLevel } from './types';

export interface LogEntry {
  /** 日志级别(默认 info) */
  level?: LogLevel;
  id: number;
  time: string;
  line: string;
  count?: number;
}

export interface BridgeStore {
  status: Accessor<BridgeStatus>;
  port: Accessor<number>;
  log: Accessor<LogEntry[]>;
  selection: Accessor<unknown>;
  platform: Accessor<PluginPlatform | null>;
  /** 插件能力表快照(核心/平台差异能力 + 特有 op 名单);未取到时为 null */
  capability: Accessor<CapabilitySnapshot | null>;
  /**
   * 宿主是否支持 `ui.resize`(由插件 code 侧上报,见 shared/panel.ts)。
   * 默认 false = 按历史行为渲染:面板高度固定,剩余高度由选中节点列表填满。
   */
  canResize: Accessor<boolean>;
  /**
   * 宿主窗口装饰高(标题栏,0028),单位与测量同。
   * 0 = 不补偿(无真源的平台,或 `ui_env` 尚未到达)。
   */
  chromeHeight: Accessor<number>;
  /**
   * 宿主报来的最小化模式(见 shared/panel.ts)。`undefined` = 旧 code 产物没带这个
   * 字段,消费方按视口宽度自己猜。
   */
  envMinimized: Accessor<boolean | undefined>;
  /**
   * npm 上两个包的最新版本(daemon 代查后推来,见 0038)。
   * 任一项为 `null` = 没查到,面板据此**不**提示升级。
   */
  latest: Accessor<{ ui: string | null; mcp: string | null }>;
  /** daemon 自报版本(status 帧);空串 = 尚未连上,无从比对 */
  daemonVersion: Accessor<string>;
  /**
   * 工具活动相位(见 shared/activity-channel.ts):最小化态的宠物按它切换动作。
   * `idle` 不是帧,是**没有在跑的工具**且结果相位的沉降期已过。
   */
  activity: Accessor<ActivityPhase | 'idle'>;
  /**
   * 错误上报同意(daemon 保管,见 shared/consent-channel.ts)。
   * 默认 false = 未同意不上报;连上 daemon 后由回推校准。
   */
  consentGranted: Accessor<boolean>;
  /**
   * 首问框是否已问过一次(daemon 保管)。`undefined` = 旧 daemon 没报,
   * 按已问过处理,不主动弹。
   */
  consentAsked: Accessor<boolean | undefined>;
  connect: () => void;
  disconnect: () => void;
  rescan: () => void;
  ping: () => void;
  refreshCapabilities: () => void;
  clearLog: () => void;
  /** 记下用户的同意选择并尽力发给 daemon;离线时的选择在重连后补发 */
  setConsent: (granted: boolean) => void;
}

const BridgeContext = createContext<BridgeStore>();

export function BridgeProvider(props: ParentProps) {
  const [status, setStatus] = createSignal<BridgeStatus>('disconnected');
  const [log, setLog] = createSignal<LogEntry[]>([]);
  const [selection, setSelection] = createSignal<unknown>(null);
  const [platform, setPlatform] = createSignal<PluginPlatform | null>(null);
  const [capability, setCapability] = createSignal<CapabilitySnapshot | null>(
    null,
  );
  /**
   * 默认 false:在收到 ui_env 之前按「宿主不支持改尺寸」渲染。
   * 这个默认值是有意的 —— 填充布局(选中节点吃满剩余高度)在固定高度下本来就
   * 成立,先渲染它只会「多占一点」;反过来先按自适应渲染,窗口没缩下去时
   * 底部会先空一块再被填上,那是能看见的闪。
   */
  const [canResize, setCanResize] = createSignal(false);
  /**
   * 宿主窗口外框里的装饰高(0028)。
   *
   * 默认 0 = 不补偿,与「宿主没上报」和「适配器没实现」同一个结果:三平台里只有
   * MasterGo 有真源(`ui.viewport.headerHeight`),Figma / jsDesign 报 0 —— 那两个
   * 平台的行为因此与 0028 之前完全一致。
   */
  const [chromeHeight, setChromeHeight] = createSignal(UI_CHROME_DEFAULT);
  /** `undefined` = code 产物没带 minimized 字段(跨版本),消费方退回按视口猜 */
  const [envMinimized, setEnvMinimized] = createSignal<boolean | undefined>(
    undefined,
  );
  const [latest, setLatest] = createSignal<{
    ui: string | null;
    mcp: string | null;
  }>({ ui: null, mcp: null });
  const [daemonVersion, setDaemonVersion] = createSignal('');

  /** 上报同意(见 shared/consent-channel.ts):默认未同意,daemon 连上后回推校准 */
  const [consentGranted, setConsentGranted] = createSignal(false);
  const [consentAsked, setConsentAsked] = createSignal<boolean | undefined>(
    undefined,
  );
  /**
   * 用户最后一次的选择(daemon 回推也同步它)。
   * 用途只有一个:掉线期间做的选择,重连后补发一次 —— 不存的话
   * 「离线点了同意、daemon 永远不知道」就静默发生了。
   */
  let consentChoice: boolean | null = null;

  /**
   * 活动相位(见 shared/activity-channel.ts)。
   *
   * 按**在跑计数**判,不按「最后一帧」:jsd_batch 的内层调用也各推一帧,批量里
   * 一个内层的 success 会紧跟在另一个仍在跑的调用后面 —— 只看最后一帧就会在还
   * 没干完时显示成已完成。running 与 success/error 天然配平(每次调用一进一出)。
   */
  const [activity, setActivity] = createSignal<ActivityPhase | 'idle'>('idle');
  let runningTools = 0;
  let settleTimer: number | undefined;

  const clearSettle = (): void => {
    if (settleTimer == null) return;
    window.clearTimeout(settleTimer);
    settleTimer = undefined;
  };

  const applyActivity = (phase: ActivityPhase): void => {
    clearSettle();
    if (phase === 'running') {
      runningTools += 1;
      setActivity('running');
      return;
    }
    runningTools = Math.max(0, runningTools - 1);
    setActivity(phase);
    // 结果相位保留沉降期:一次几毫秒的成功调用不保留就等于没画
    settleTimer = window.setTimeout(() => {
      settleTimer = undefined;
      setActivity(runningTools > 0 ? 'running' : 'idle');
    }, ACTIVITY_SETTLE_MS);
  };

  /** 通道断了就归零:相位是「daemon 在推」这件事的投影,没通道就没有事实 */
  const resetActivity = (): void => {
    clearSettle();
    runningTools = 0;
    setActivity('idle');
  };

  let bridge: BridgeSocket | undefined;
  let subscribed = false;
  let seq = 0;

  const now = (): string => new Date().toLocaleTimeString();

  const pushLog = (line: string, level: LogLevel = 'info'): void => {
    const entry: LogEntry = { id: ++seq, time: now(), line, level };
    setLog((l) => {
      const last = l[l.length - 1];
      if (last && last.line === line) {
        return [...l.slice(0, -1), { ...last, count: (last.count ?? 1) + 1 }];
      }
      return [...l.slice(-99), entry];
    });
  };

  const getBridge = (): BridgeSocket => {
    if (!bridge) bridge = new BridgeSocket();
    return bridge;
  };

  /** 把插件 ping 回包收成能力快照;形状不符或缺 platform 时返回 null(面板显示空态) */
  const toSnapshot = (raw: unknown): CapabilitySnapshot | null => {
    const d = raw as Partial<CapabilitySnapshot> | null | undefined;
    if (d == null || typeof d !== 'object' || d.platform == null) return null;
    return {
      platform: d.platform,
      capabilities: d.capabilities ?? [],
      coreCapabilities: d.coreCapabilities ?? [],
      platformOps: d.platformOps ?? [],
    };
  };

  /**
   * 拉一次能力表:插件推送 platform 后自动触发(不必额外加推送帧),
   * 失败只落 debug 日志 —— 面板显示空态即可,不打断别的功能。
   */
  const refreshCapabilities = async (): Promise<void> => {
    getBridge().connect();
    try {
      const snap = toSnapshot(await getBridge().pingPlugin());
      setCapability(() => snap);
      if (snap == null) pushLog(t('bridge.log.capabilityMissing'), 'debug');
    } catch (e) {
      pushLog(
        t('bridge.log.capabilityFailed', {
          message: e instanceof Error ? e.message : String(e),
        }),
        'debug',
      );
    }
  };

  onMount(() => {
    if (subscribed) return;
    subscribed = true;
    const b = getBridge();
    b.connect();
    b.subscribe((e) => {
      if (e.type === 'status') {
        setStatus(() => e.status);
        // 掉线即清空能力快照:留着旧平台的能力表会与当前连接不符。
        // 被顶替同样要清 —— 面板已不再持有通道,快照不再代表任何真实连接
        if (e.status === 'disconnected' || e.status === 'superseded') {
          setCapability(() => null);
          // 版本结论同样随通道失效:daemon 都不在了,「有新版」无从谈起
          setDaemonVersion(() => '');
          setLatest(() => ({ ui: null, mcp: null }));
          resetActivity();
        } else {
          setDaemonVersion(() => b.daemonVersion);
          // 掉线期间的选择补发一次,与 daemon 侧状态收敛(幂等,同值重发无害)
          if (consentChoice != null) b.setConsent(consentChoice);
        }
      } else if (e.type === 'selection') setSelection(() => e.data);
      else if (e.type === 'version') setLatest(() => e.latest);
      else if (e.type === 'platform') {
        setPlatform(() => e.platform);
        void refreshCapabilities();
      } else if (e.type === 'log') pushLog(e.line, e.level);
      else if (e.type === 'ui_env') {
        setCanResize(() => e.canResize);
        setChromeHeight(() => e.chromeHeight);
        setEnvMinimized(() => e.minimized);
      } else if (e.type === 'locale_state') applyStoredChoice(e.stored);
      else if (e.type === 'activity') applyActivity(e.phase);
      else if (e.type === 'consent') {
        consentChoice = e.granted;
        setConsentGranted(e.granted);
        setConsentAsked(e.asked ?? true);
      }
    });
    onCleanup(clearSettle);
  });

  const store: BridgeStore = {
    status,
    port: createSignal(WS_PORT)[0],
    log,
    selection,
    platform,
    capability,
    canResize,
    chromeHeight,
    envMinimized,
    latest,
    daemonVersion,
    activity,
    consentGranted,
    consentAsked,
    connect: () => getBridge().connect(),
    disconnect: () => getBridge().disconnect(),
    rescan: () => getBridge().rescan(),
    refreshCapabilities: () => void refreshCapabilities(),
    clearLog: () => setLog([]),
    setConsent: (granted: boolean) => {
      consentChoice = granted;
      setConsentGranted(granted);
      getBridge().setConsent(granted);
    },
    ping: async () => {
      getBridge().connect();
      try {
        const data = await getBridge().pingPlugin();
        setCapability(() => toSnapshot(data));
        pushLog(
          t('bridge.log.pingOk', { data: JSON.stringify(data) }),
          'debug',
        );
      } catch (e) {
        pushLog(
          t('bridge.log.pingFailed', {
            message: e instanceof Error ? e.message : String(e),
          }),
          'error',
        );
      }
    },
  };

  return (
    <BridgeContext.Provider value={store}>
      {props.children}
    </BridgeContext.Provider>
  );
}

export function useBridge(): BridgeStore {
  const ctx = useContext(BridgeContext);
  if (!ctx) throw new Error(t('bridge.error.useBridge'));
  return ctx;
}
