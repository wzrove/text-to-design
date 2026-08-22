import type { PluginPlatform, PluginRequest } from 'text-to-design-shared';

export type BridgeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/** 面板日志级别(与服务端 logger 语义对齐) */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type BridgeEvent =
  | { type: 'status'; status: BridgeStatus }
  | { type: 'log'; level: LogLevel; line: string }
  | { type: 'selection'; data: unknown }
  | { type: 'platform'; platform: PluginPlatform };

export type Conn = {
  port: number;
  ws: WebSocket | null;
  binaryIn: {
    msg: PluginRequest;
    buffers: Uint8Array[];
    expected: number;
  } | null;
};

export type Pending = {
  resolve?: (data: unknown) => void;
  reject?: (err: Error) => void;
  timer: number;
};

/** UI 侧超时必须小于服务器侧(30s),保证 UI 先超时先回错误包,不留孤儿 */
export const TIMEOUT = 25000;
export const SCAN_INTERVAL = 1000;
/** 重连退避封顶 */
export const MAX_SCAN_INTERVAL = 10000;
