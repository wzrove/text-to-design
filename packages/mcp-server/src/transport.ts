import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { version } from '../package.json' with { type: 'json' };
import { debug, log } from './logger';

/** WSS/HTTP 生命周期(固定端口,被占即失败),消息透传上层 */
export class Transport {
  private wss: WebSocketServer | null = null;
  private http: HttpServer | null = null;
  private client: WebSocket | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private _port = 0;

  onMessage: ((raw: Buffer, isBinary: boolean) => void) | null = null;
  /** 插件 WS 连上时触发(每次新连接一次) */
  onConnect: (() => void) | null = null;
  onDisconnect: ((err: Error) => void) | null = null;

  get port(): number {
    return this._port;
  }

  async start(port: number): Promise<void> {
    this.http = createServer();
    this.wss = new WebSocketServer({ server: this.http });
    this.wss.on('error', () => {
      // 端口冲突等错误由 tryListen 处理,此处避免未捕获异常
    });
    this.heartbeat = setInterval(() => {
      if (this.client && this.client.readyState === WebSocket.OPEN) {
        this.client.send(
          JSON.stringify({ type: 'status', state: 'connected', version }),
        );
        debug('心跳: 下发状态确认');
      }
    }, 30_000);
    this.wss.on('connection', (ws) => {
      this.client = ws;
      const line = '[text-to-design-mcp] 插件已连接\n';
      process.stderr.write(line);
      log('插件已连接');
      try {
        this.onConnect?.();
      } catch (e) {
        log(`onConnect 回调异常: ${e instanceof Error ? e.message : String(e)}`);
      }
      ws.send(
        JSON.stringify({
          type: 'status',
          state: 'connected',
          version,
        }),
      );
      debug('已下发状态确认(status connected)');
      ws.on('message', (raw: Buffer, isBinary: boolean) => {
        const buf = Buffer.isBuffer(raw)
          ? raw
          : Buffer.from(raw as ArrayBuffer);
        debug(`收到 WS 消息 len=${buf.length} bin=${isBinary}`);
        this.onMessage?.(buf, isBinary);
      });
      ws.on('close', () => {
        if (this.client === ws) this.client = null;
        const line = '[text-to-design-mcp] 插件断开\n';
        process.stderr.write(line);
        log('插件断开');
        this.onDisconnect?.(new Error('plugin disconnected'));
      });
      ws.on('error', () => {
        if (this.client === ws) this.client = null;
        this.onDisconnect?.(new Error('plugin connection error'));
      });
    });
    const ok = await this.tryListen(port);
    if (!ok) {
      this.http.close();
      throw new Error(
        `端口 ${port} 已被占用。已有 text-to-design-mcp 实例在运行?请检查残留进程后重试`,
      );
    }
    this._port = port;
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.wss?.close();
    this.http?.close();
  }

  get isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  send(data: string | Buffer): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.client.send(data);
      debug(`发送 WS 消息 len=${data.length} bin=${typeof data !== 'string'}`);
    } else {
      log(`发送失败: 无客户端连接(${data.length} 字节被丢弃)`);
    }
  }

  private tryListen(p: number): Promise<boolean> {
    return new Promise((resolve) => {
      const onError = (): void => {
        cleanup();
        resolve(false);
      };
      const onListening = (): void => {
        cleanup();
        resolve(true);
      };
      const cleanup = (): void => {
        this.http?.off('error', onError);
        this.http?.off('listening', onListening);
      };
      this.http?.once('error', onError);
      this.http?.once('listening', onListening);
      this.http?.listen(p);
    });
  }
}
