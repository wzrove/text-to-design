import {
  CONFIRM_STALE_MS,
  CONFIRM_TIMEOUT_MS,
  HEARTBEAT_MS,
  isConfirmExpired,
  PROBE_DELAY_MS,
  SUPERSEDED_CLOSE_CODE,
  WS_HANDSHAKE_TIMEOUT_MS,
} from 'text-to-design-shared';
import type { EventBus } from './events';
import type { Router } from './router';
import type { BridgeEvent, BridgeStatus, Conn } from './types';

/** 被顶替时给用户的一行提示:既要说明原因,也要给出唯一可行的动作 */
const SUPERSEDED_HINT =
  '通道已被另一个插件面板接管,自动重连已停止(点右上角「重试」可夺回)';

/**
 * 单连接生命周期:一个 ws 的打开/关闭/错误处理、全局状态派生与事件发射。
 *
 * 状态推进只有两个来源,别处一律不改 status:
 * ① 本地 socket 生命周期(onopen → connecting,onclose → disconnected);
 * ② daemon 的权威判定(状态帧 `ready` → connected,`superseded` → superseded)。
 * 「被顶替」必须由 daemon 告知而不能本地推断:本地看到的只是「对端把连接关了」,
 * 与「daemon 挂了」无法区分,而两者处置完全相反(见 BridgeStatus 注释)。
 */
export class ConnectionManager {
  status: BridgeStatus = 'disconnected';
  /** 最近一次收到 daemon 状态确认的时间戳,0 = 从未确认 */
  lastConfirmedAt = 0;
  private manualOff = false;
  private superseded = false;
  private conn: Conn;
  private router: Router;
  private events: EventBus;
  /** 当前连接的打开时刻(用于确认超时判定) */
  private openAt = 0;
  private confirmTimer: number | undefined;
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

  open(): Promise<boolean> {
    const conn = this.conn;
    if (!conn || this.manualOff || this.superseded) {
      return Promise.resolve(false);
    }
    // 上一轮可能仍停在 CONNECTING:先收掉,避免反复重试堆积孤儿 socket。
    // 注意不能在这里置空 conn.ws —— 旧 socket 的 onclose 仍需 settle 它的 promise,
    // 否则 Scanner 的 await 会永久悬挂、整个扫描器卡死。
    if (conn.ws && conn.ws.readyState !== WebSocket.OPEN) conn.ws.close();

    return new Promise((resolve) => {
      let done = false;
      let handshakeTimer: number | undefined;
      const settle = (ok: boolean) => {
        if (done) return;
        done = true;
        if (handshakeTimer !== undefined) clearTimeout(handshakeTimer);
        handshakeTimer = undefined;
        resolve(ok);
      };
      const socket = new WebSocket(`ws://localhost:${conn.port}`);
      socket.binaryType = 'arraybuffer';
      conn.ws = socket;
      this.setStatus('connecting');

      // 握手兜底:onopen 之前卡住也必须落地,否则 await 它的重连循环永久停摆
      // (详见 shared WS_HANDSHAKE_TIMEOUT_MS 注释)。先 close 触发正常收尾路径,
      // 再直接 settle —— 万一宿主 webview 吞掉 close 事件,循环也不能被卡住。
      handshakeTimer = window.setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) return;
        this.emit(
          'log',
          `WS 握手超时(${WS_HANDSHAKE_TIMEOUT_MS}ms),放弃本次连接: ${conn.port}`,
        );
        try {
          socket.close();
        } catch {
          // 关闭失败不影响兜底语义:下面的 settle 已经保证循环继续
        }
        settle(false);
      }, WS_HANDSHAKE_TIMEOUT_MS);

      socket.onopen = () => {
        // 已被更新的尝试取代:如实回 false,让扫描器按未连上处理
        if (conn.ws !== socket) {
          settle(false);
          return;
        }
        this.openAt = Date.now();
        this.setStatus('connecting', true);
        this.emit(
          'log',
          `MCP server 已连接,等待服务确认: ws://localhost:${conn.port}`,
        );
        settle(true);
        // 延迟探测:绕开代理层「连接瞬间首条消息易丢」的窗口,主动 ping 确认双向可达
        setTimeout(() => this.router.probeServer(), PROBE_DELAY_MS);
        // 确认超时:CONFIRM_TIMEOUT_MS 内未收到 daemon 确认(状态帧/pong)→ 关闭重连
        this.confirmTimer = window.setTimeout(() => {
          if (conn.ws !== socket) return;
          if (this.lastConfirmedAt < this.openAt) {
            this.emit('log', `服务确认超时,关闭重连: ${conn.port}`);
            socket.close();
          }
        }, CONFIRM_TIMEOUT_MS);
      };

      socket.onmessage = (event) => {
        if (conn.ws !== socket) return;
        this.onWsMessage(conn, event);
      };

      socket.onclose = (event) => {
        const isCurrent = conn.ws === socket;
        if (isCurrent) {
          if (this.confirmTimer) clearTimeout(this.confirmTimer);
          this.confirmTimer = undefined;
          this.stopStaleWatch();
          conn.ws = null;
        }
        // 先 settle:哪怕这条 socket 已被取代,也必须让等待它的 Scanner 落地
        settle(false);
        if (!isCurrent) return;

        // 顶替:帧与关闭码任一到达即可判定。此处只在「仅靠关闭码得知」时补一条日志
        if (this.superseded || event.code === SUPERSEDED_CLOSE_CODE) {
          const first = !this.superseded;
          this.superseded = true;
          this.setStatus('superseded');
          if (first) this.emit('log', SUPERSEDED_HINT);
          return;
        }
        this.setStatus('disconnected', true);
        this.emit('log', `连接断开: ${conn.port}`);
      };

      socket.onerror = () => {
        console.error('ws error', conn.port);
        // 不主动 close、不降级状态:代理层瞬时 error 不应误杀连接,
        // 真死连接由 onclose 兜底,确认超时由上述定时器兜底
      };
    });
  }

  close(): void {
    this.manualOff = true;
    this.stopStaleWatch();
    const conn = this.conn;
    if (conn?.ws) {
      conn.ws.close();
      conn.ws = null;
    }
    this.setStatus('disconnected');
  }

  /** 收到 daemon 状态确认(状态帧或 pong)→ 已连接 */
  markConfirmed(): void {
    if (this.superseded) return; // 顶替后迟到的确认不作数
    this.lastConfirmedAt = Date.now();
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    this.confirmTimer = undefined;
    this.setStatus('connected', true);
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
          `服务确认过期(${CONFIRM_STALE_MS}ms 未收到心跳),关闭重连: ${this.conn.port}`,
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
    this.stopStaleWatch();
    this.setStatus('superseded');
    this.emit('log', SUPERSEDED_HINT);
    const ws = this.conn?.ws;
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  }

  /** 清除手动断开标记,允许自动/手动重连 */
  resume(): void {
    this.manualOff = false;
  }

  /**
   * 手动夺回:清掉「被顶替」标记并允许重连。只应由用户显式动作触发 ——
   * 自动重连路径不得调用,否则两个面板会互相顶替、无限拉锯。
   */
  reclaim(): void {
    this.superseded = false;
    this.manualOff = false;
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
        `WS 消息处理失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * 状态推进的唯一出口。如实上报,不做时间维度的修饰 —— `connecting` 的
   * 「进行时」语义由徽章自己表达(转圈),面板结构不为它改变,所以这里
   * 不需要为了防闪烁去延迟或吞掉任何一次状态推进。
   */
  private setStatus(status: BridgeStatus, force = false): void {
    if (!force && status === this.status) return;
    this.status = status;
    this.emit('status', status);
    this.onStatusChange?.(status);
  }

  private emit(type: 'status', status: BridgeStatus): void;
  private emit(type: 'log', line: string): void;
  private emit(type: 'status' | 'log', value: BridgeStatus | string): void {
    const event = (
      type === 'status' ? { type, status: value } : { type, line: value }
    ) as BridgeEvent;
    this.events.emit(event);
  }
}
