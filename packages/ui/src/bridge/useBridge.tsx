import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createSignal, onMount, useContext } from 'solid-js';
import type { PluginPlatform } from 'text-to-design-shared';
import { WS_PORT } from 'text-to-design-shared';
import type { BridgeStatus } from './BridgeSocket';
import { BridgeSocket } from './BridgeSocket';
import type { LogLevel } from './types';

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
  connect: () => void;
  disconnect: () => void;
  rescan: () => void;
  ping: () => void;
}

const BridgeContext = createContext<BridgeStore>();

export function BridgeProvider(props: ParentProps) {
  const [status, setStatus] = createSignal<BridgeStatus>('disconnected');
  const [log, setLog] = createSignal<LogEntry[]>([]);
  const [selection, setSelection] = createSignal<unknown>(null);
  const [platform, setPlatform] = createSignal<PluginPlatform | null>(null);

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

  onMount(() => {
    if (subscribed) return;
    subscribed = true;
    const b = getBridge();
    b.connect();
    b.subscribe((e) => {
      if (e.type === 'status') setStatus(() => e.status);
      else if (e.type === 'selection') setSelection(() => e.data);
      else if (e.type === 'platform') setPlatform(() => e.platform);
      else if (e.type === 'log') pushLog(e.line, e.level);
    });
  });

  const store: BridgeStore = {
    status,
    port: createSignal(WS_PORT)[0],
    log,
    selection,
    platform,
    connect: () => getBridge().connect(),
    disconnect: () => getBridge().disconnect(),
    rescan: () => getBridge().rescan(),
    ping: async () => {
      getBridge().connect();
      try {
        const data = await getBridge().pingPlugin();
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
