import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createSignal, onMount, useContext } from 'solid-js';
import type { PluginPlatform } from 'text-to-design-shared';
import { WS_PORT } from 'text-to-design-shared';
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
  connect: () => void;
  disconnect: () => void;
  rescan: () => void;
  ping: () => void;
  refreshCapabilities: () => void;
  clearLog: () => void;
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
      if (snap == null) pushLog('能力表回包异常(缺 platform)', 'debug');
    } catch (e) {
      pushLog(
        `能力表获取失败: ${e instanceof Error ? e.message : String(e)}`,
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
        }
      } else if (e.type === 'selection') setSelection(() => e.data);
      else if (e.type === 'platform') {
        setPlatform(() => e.platform);
        void refreshCapabilities();
      } else if (e.type === 'log') pushLog(e.line, e.level);
      else if (e.type === 'ui_env') setCanResize(() => e.canResize);
    });
  });

  const store: BridgeStore = {
    status,
    port: createSignal(WS_PORT)[0],
    log,
    selection,
    platform,
    capability,
    canResize,
    connect: () => getBridge().connect(),
    disconnect: () => getBridge().disconnect(),
    rescan: () => getBridge().rescan(),
    refreshCapabilities: () => void refreshCapabilities(),
    clearLog: () => setLog([]),
    ping: async () => {
      getBridge().connect();
      try {
        const data = await getBridge().pingPlugin();
        setCapability(() => toSnapshot(data));
        pushLog(`ping 插件成功: ${JSON.stringify(data)}`, 'debug');
      } catch (e) {
        pushLog(
          `ping 插件失败: ${e instanceof Error ? e.message : String(e)}`,
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
  if (!ctx) throw new Error('useBridge 必须在 <BridgeProvider> 内使用');
  return ctx;
}
