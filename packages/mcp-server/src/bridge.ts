import type { LogLevel, ServerPush } from 'text-to-design-shared';
import { CLIENT } from './config';
import { log, warn } from './logger';
import type { PluginMethod, RequestOptions } from './pending';
import { PendingManager } from './pending';
import { Transport } from './transport';

/** 离线日志环形缓冲容量:插件不在线期间先入队,上线按入队顺序回放一次 */
const OFFLINE_LOG_RING = 200;

/** 门面:组合传输层与请求关联层,对外 API 不变 */
export class Bridge {
  private transport = new Transport();
  private pending: PendingManager;
  /** 离线期间攒下的日志(旧→新),上线回放后清空 */
  private logRing: ServerPush[] = [];

  /** 插件连接状态变化(true=已连上,false=断开),供工具可用性联动 */
  onConnectionChange: ((connected: boolean) => void) | null = null;

  constructor() {
    this.pending = new PendingManager((text, binary) => {
      this.transport.send(text);
      if (binary) this.transport.send(binary);
    });
    this.transport.onMessage = (raw, isBinary) => {
      if (isBinary) this.pending.onBinary(raw);
      else this.pending.onText(raw);
    };
    this.transport.onConnect = () => {
      // 先回放离线日志,再广播连接状态变化:随后的「工具可用性同步: 上线」
      // 会排在历史之后,面板时间线不倒挂
      this.replayLogs();
      this.onConnectionChange?.(true);
    };
    this.transport.onDisconnect = (err) => {
      this.pending.rejectAll(err);
      this.onConnectionChange?.(false);
    };
  }

  get port(): number {
    return this.transport.port;
  }

  start(port: number): Promise<void> {
    return this.transport.start(port);
  }

  stop(): void {
    this.pending.clear();
    this.logRing = [];
    this.transport.stop();
  }

  get isConnected(): boolean {
    return this.transport.isConnected;
  }

  request(
    method: PluginMethod,
    params: unknown,
    opts: RequestOptions = {},
  ): Promise<unknown> {
    if (!this.transport.isConnected) {
      warn(`请求被拒(插件未连接): ${method}`);
      return Promise.reject(
        new Error(
          `${CLIENT.runtime} 插件未连接。请先在${CLIENT.label}客户端中运行该插件。`,
        ),
      );
    }
    return this.pending.request(method, params, opts);
  }

  /** 把一条 daemon 日志发给插件 UI:在线直推,离线进环形缓冲待上线回放 */
  notifyLog(level: LogLevel, line: string): void {
    const push: ServerPush = { type: 'log', level, line };
    if (!this.transport.isConnected) {
      if (this.logRing.length >= OFFLINE_LOG_RING) this.logRing.shift();
      this.logRing.push(push);
      return;
    }
    this.sendLogPush(push);
  }

  /** 上线回放:按入队顺序补发离线日志(只补一次,发送失败不重试) */
  private replayLogs(): void {
    if (this.logRing.length === 0) return;
    const batch = this.logRing;
    this.logRing = [];
    log(`回放离线日志 ${batch.length} 条`);
    for (const push of batch) this.sendLogPush(push);
  }

  private sendLogPush(push: ServerPush): void {
    try {
      this.transport.sendPush(JSON.stringify(push));
    } catch {
      // 推送失败不影响主流程
    }
  }
}
