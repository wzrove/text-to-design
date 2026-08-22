import { CLIENT } from './config';
import { log } from './logger';
import type { PluginMethod, RequestOptions } from './pending';
import { PendingManager } from './pending';
import { Transport } from './transport';

/** 门面:组合传输层与请求关联层,对外 API 不变 */
export class Bridge {
  private transport = new Transport();
  private pending: PendingManager;

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
    this.transport.onConnect = () => this.onConnectionChange?.(true);
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
      log(`请求被拒(插件未连接): ${method}`);
      return Promise.reject(
        new Error(
          `${CLIENT.runtime} 插件未连接。请先在${CLIENT.label}客户端中运行该插件。`,
        ),
      );
    }
    return this.pending.request(method, params, opts);
  }
}
