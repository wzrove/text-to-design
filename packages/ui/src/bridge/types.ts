// 日志级别唯一真源在 shared,这里再导出维持既有导入路径
import type {
  CoreCapability,
  HostCapability,
  LogLevel,
  PlatformOpInfo,
  PluginPlatform,
  PluginRequest,
} from 'text-to-design-shared';

export type { LogLevel };

/**
 * 面板显示用的能力快照:UI 主动向插件 code 侧 ping 拿到的回包
 * (与 daemon 侧 platform-state 同源同形状,但 UI 只读展示、不做可用性判定)。
 */
export type CapabilitySnapshot = {
  platform: PluginPlatform;
  capabilities: readonly HostCapability[];
  coreCapabilities: readonly CoreCapability[];
  platformOps: readonly PlatformOpInfo[];
};

/**
 * 面板连接相位(四态,与 daemon 下发的状态帧一一对应)。
 *
 * `superseded` 单列而不并入 `disconnected`,因为它表示「daemon 在、但这条通道被
 * 另一个面板顶替了」—— 处置方式与掉线相反:掉线要**自动重连**,被顶替则
 * **不能**自动重连(两个面板会互相顶替,形成无限拉锯),只能等用户手动夺回。
 */
export type BridgeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'superseded';

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
