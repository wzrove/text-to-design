import { WS_PORT } from 'text-to-design-shared';
import { ConnectionManager } from './connection';
import { EventBus } from './events';
import { Router } from './router';
import { Scanner } from './scanner';
import type { BridgeEvent, BridgeStatus, Conn } from './types';

export type { BridgeEvent, BridgeStatus } from './types';

/**
 * 门面:组合扫描器 / 连接管理器 / 路由器,单连接,对外 API 固定。
 *
 * 对外只暴露三个动作,语义互不重叠:
 * - {@link connect}  幂等启动(挂载时调用;已连/已排队则不做事,也**不**夺回被顶替的通道)
 * - {@link rescan}   用户显式「重试」:强制夺回被顶替的通道并立即重试一次
 * - {@link disconnect} 手动断开
 */
export class BridgeSocket {
  private conn: Conn;
  private events = new EventBus();
  private router: Router;
  private connection: ConnectionManager;
  private scanner: Scanner;

  constructor(port = WS_PORT) {
    this.conn = { port, ws: null, binaryIn: null };
    this.router = new Router(this.conn, (level, line) =>
      this.events.emit({ type: 'log', level, line }),
    );
    this.router.onSelection = (data) =>
      this.events.emit({ type: 'selection', data });
    this.router.onPlatform = (platform) =>
      this.events.emit({ type: 'platform', platform });
    this.router.onServerStatus = (frame) => {
      if (frame.state === 'superseded') {
        this.connection.markSuperseded();
        return;
      }
      // daemon 每 HEARTBEAT_MS 重发 ready;只有从非 connected 首次确认才打日志,
      // 避免每次心跳都刷「服务已确认连接」
      const alreadyConnected = this.connection.status === 'connected';
      this.connection.markConfirmed();
      if (!alreadyConnected) {
        this.events.emit({
          type: 'log',
          level: 'info',
          line: `服务已确认连接(版本 ${frame.version})`,
        });
      }
    };
    this.router.onServerPong = () => this.connection.markConfirmed();
    this.connection = new ConnectionManager(
      this.conn,
      this.router,
      this.events,
    );
    this.scanner = new Scanner({
      isConnected: () => this.connection.isOpen,
      isSuperseded: () => this.connection.isSuperseded,
      open: () => this.connection.open(),
    });
    this.connection.onStatusChange = () => this.scanner.refresh();
    window.addEventListener('message', this.router.onCodeMessage);
  }

  get isOpen(): boolean {
    return this.connection.isOpen;
  }

  get currentStatus(): BridgeStatus {
    return this.connection.status;
  }

  get lastConfirmedAt(): number {
    return this.connection.lastConfirmedAt;
  }

  subscribe(cb: (e: BridgeEvent) => void): () => void {
    return this.events.subscribe(cb);
  }

  /** 幂等启动:不清「被顶替」标记,避免与另一个面板互相顶替 */
  connect(): void {
    this.connection.resume();
    this.scanner.connect();
  }

  /** 用户显式重试:夺回被顶替的通道 + 重置退避 + 立即重试一次 */
  rescan(): void {
    this.connection.reclaim();
    this.scanner.connect();
  }

  disconnect(): void {
    this.scanner.abort();
    this.router.rejectAll(new Error('手动断开连接'));
    this.connection.close();
  }

  pingPlugin(): Promise<unknown> {
    return this.router.pingPlugin();
  }

  probeServer(): void {
    this.router.probeServer();
  }
}
