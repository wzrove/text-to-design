import {
  CONFIRM_STALE_MS,
  CONFIRM_TIMEOUT_MS,
  HEARTBEAT_MS,
  isConfirmExpired,
  PROBE_DELAY_MS,
  SUPERSEDED_CLOSE_CODE,
  WS_HANDSHAKE_TIMEOUT_MS,
} from 'text-to-design-shared';
import { t } from '../i18n/useLocale';
import type { EventBus } from './events';
import type { Router } from './router';
import type { BridgeEvent, BridgeStatus, Conn } from './types';

/**
 * 单连接生命周期:一个 ws 的打开/关闭/错误处理、全局状态派生与事件发射。
 *
 * 状态推进只有两个来源,别处一律不改 status:
 * ① 本地连接尝试与 socket 生命周期;
 * ② daemon 的权威判定(状态帧 `ready` → connected,`superseded` → superseded)。
 * 「被顶替」必须由 daemon 告知而不能本地推断:本地看到的只是「对端把连接关了」,
 * 与「daemon 挂了」无法区分,而两者处置完全相反(见 BridgeStatus 注释)。
 */
export class ConnectionManager {
  status: BridgeStatus = 'disconnected';
  /** 最近一次收到 daemon 状态确认的时间戳,0 = 从未确认 */
  lastConfirmedAt = 0;
  private superseded = false;
  private conn: Conn;
  private router: Router;
  private events: EventBus;
  private finishAttempt?: (confirmed: boolean) => void;
  /** 已连接后的确认过期看门狗(半开连接检测) */
  private staleTimer: number | undefined;

  /** 状态变更回调(门面注入,用于驱动扫描器启停) */
  onStatusChange: ((status: BridgeStatus) => void) | null = null;

  constructor(conn: Conn, router: Router, events: EventBus) {
    this.conn = conn;
    this.router = router;
    this.events = events;
  }

  get isOpen(): boolean {
    return !!this.conn?.ws && this.conn.ws.readyState === WebSocket.OPEN;
  }

  /** 通道是否已被别的面板顶替(扫描器据此停摆,不自动夺回) */
  get isSuperseded(): boolean {
    return this.superseded;
  }

  open(showConnecting: boolean): Promise<boolean> {
    const conn = this.conn;
    if (conn.ws || this.superseded) return Promise.resolve(false);

    return new Promise((resolve) => {
      const socket = new WebSocket(`ws://localhost:${conn.port}`);
      socket.binaryType = 'arraybuffer';
      conn.ws = socket;
      let timeout: number;
      this.finishAttempt = (confirmed) => {
        clearTimeout(timeout);
        this.finishAttempt = undefined;
        resolve(confirmed);
      };
      const fail = (message: string) => {
        if (conn.ws !== socket) return;
        this.emit('log', message);
        this.detach();
        this.setStatus('disconnected');
        socket.close();
      };
      timeout = window.setTimeout(() => {
        fail(
          t('bridge.log.handshakeTimeout', {
            ms: WS_HANDSHAKE_TIMEOUT_MS,
            port: conn.port,
          }),
        );
      }, WS_HANDSHAKE_TIMEOUT_MS);

      socket.onopen = () => {
        if (conn.ws !== socket) return;
        clearTimeout(timeout);
        timeout = window.setTimeout(() => {
          fail(t('bridge.log.confirmTimeout', { port: conn.port }));
        }, CONFIRM_TIMEOUT_MS);
        this.setStatus('connecting');
        this.emit('log', t('bridge.log.serverConnected', { port: conn.port }));
        setTimeout(() => {
          if (conn.ws === socket) this.router.probeServer();
        }, PROBE_DELAY_MS);
      };

      socket.onmessage = (event) => {
        if (conn.ws !== socket) return;
        this.onWsMessage(conn, event);
      };

      socket.onclose = (event) => {
        if (conn.ws !== socket) return;
        if (event.code === SUPERSEDED_CLOSE_CODE) {
          this.markSuperseded();
          return;
        }
        this.detach();
        this.setStatus('disconnected');
        this.emit('log', t('bridge.log.closed', { port: conn.port }));
      };

      socket.onerror = () => {
        console.error('ws error', conn.port);
      };

      // 后台探测等端口打开再更新徽章，避免端口拒绝时闪烁。
      if (showConnecting) this.setStatus('connecting');
    });
  }

  close(): void {
    const socket = this.conn.ws;
    this.detach();
    socket?.close();
    this.setStatus('disconnected');
  }

  private detach(): void {
    this.conn.ws = null;
    this.finishAttempt?.(false);
    this.stopStaleWatch();
  }

  /** 收到 daemon 状态确认(状态帧或 pong)→ 已连接 */
  markConfirmed(): void {
    if (this.superseded) return;
    this.lastConfirmedAt = Date.now();
    this.finishAttempt?.(true);
    // 不传 force:30s 心跳反复重发 status=connected 会触发 UI 每 30s 重发 consent_set/ui_version 刷屏
    this.setStatus('connected');
    this.startStaleWatch();
  }

  /**
   * 半开连接看门狗:daemon 每 HEARTBEAT_MS 重发 ready,连续 CONFIRM_STALE_MS
   * 收不到就主动关闭,交给既有 Scanner 重连。没有它时,链路黑洞且无 onclose
   * 会让面板永久停在「已连接」却收不到任何推送。
   */
  private startStaleWatch(): void {
    this.stopStaleWatch();
    this.staleTimer = window.setInterval(() => {
      const ws = this.conn?.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (isConfirmExpired(this.lastConfirmedAt, Date.now())) {
        this.emit(
          'log',
          t('bridge.log.stale', {
            ms: CONFIRM_STALE_MS,
            port: this.conn.port,
          }),
        );
        ws.close();
      }
    }, HEARTBEAT_MS);
  }

  private stopStaleWatch(): void {
    if (this.staleTimer !== undefined) clearInterval(this.staleTimer);
    this.staleTimer = undefined;
  }

  /** daemon 明确告知:这条通道被另一个面板接管 → 停止自动重连,等用户夺回 */
  markSuperseded(): void {
    if (this.superseded) return;
    this.superseded = true;
    const socket = this.conn.ws;
    this.detach();
    this.setStatus('superseded');
    this.emit('log', t('bridge.log.superseded'));
    if (socket?.readyState === WebSocket.OPEN) socket.close();
  }

  /**
   * 手动夺回:清掉「被顶替」标记并允许重连。只应由用户显式动作触发 ——
   * 自动重连路径不得调用,否则两个面板会互相顶替、无限拉锯。
   */
  reclaim(): void {
    this.superseded = false;
  }

  private onWsMessage(conn: Conn, event: MessageEvent): void {
    try {
      if (typeof event.data === 'string') {
        this.router.onWsText(conn, event.data);
        return;
      }
      this.router.onWsBinary(conn, event.data as ArrayBuffer);
    } catch (e) {
      this.emit(
        'log',
        t('bridge.log.wsFailed', {
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  private setStatus(status: BridgeStatus, force = false): void {
    if (!force && status === this.status) return;
    this.status = status;
    this.emit('status', status);
    this.onStatusChange?.(status);
  }

  private emit(type: 'status', status: BridgeStatus): void;
  private emit(type: 'log', message: string): void;
  private emit(type: 'status' | 'log', value: string): void {
    // 不整块 `as BridgeEvent`:那会把「log 事件少带 record」这类形状错误盖掉 ——
    // 消费端读到 undefined.record,渲染时才炸(见 useBridge 的 pushLog)。
    const event: BridgeEvent =
      type === 'status'
        ? { type, status: value as BridgeStatus }
        : {
            type: 'log',
            record: {
              level: 'info',
              scope: 'bridge',
              message: value as string,
            },
          };
    this.events.emit(event);
  }
}
