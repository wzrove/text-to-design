import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { createServer } from 'node:http';
import {
  HEARTBEAT_MS,
  type ServerStatusFrame,
  SUPERSEDED_CLOSE_CODE,
} from 'text-to-design-shared';
import { WebSocket, WebSocketServer } from 'ws';
import { version } from '../package.json' with { type: 'json' };
import { HTTP_PORT } from './config';
import { debug, log, warn } from './logger';

/** 关闭码 → 人话:排查掉线时,「谁掐的」比一个裸数字有用得多 */
function describeClose(code: number): string {
  if (code === SUPERSEDED_CLOSE_CODE) return '被新面板顶替';
  if (code === 1000) return '正常关闭';
  if (code === 1001) return '对端离开(页面卸载 / iframe 被回收)';
  if (code === 1005) return '无关闭码(对端未发关闭帧)';
  if (code === 1006) return '异常中断(进程被杀 / 代理掐线 / 页面被冻结)';
  return '其他关闭码';
}

/**
 * 单通道插件桥:daemon 侧持有唯一的插件面板连接(WS)。
 *
 * 通道模型刻意是**单通道**而非广播 —— 一个 daemon 同时只服务一个插件面板:
 * ① 请求响应靠 id 关联,多通道下「请求发给谁」也得一并建模;
 * ② 设计客户端同一时刻只有一个文档在前台,多面板没有实际收益。
 * 因此新连接**顶替**旧连接,且顶替必须对旧面板可见:否则它的 ws 仍是 OPEN,
 * 会一直显示「已连接」却再也收不到任何推送 —— 静默假在线比直接报错更难排查。
 * 可见性走两条冗余路径:`superseded` 状态帧 + 关闭码 {@link SUPERSEDED_CLOSE_CODE}
 * (帧可能被中间代理吞掉,关闭码不会)。
 */
export class Transport {
  private wss: WebSocketServer | null = null;
  private http: HttpServer | null = null;
  private client: WebSocket | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private _port = 0;
  /** 顶替累计次数:排查「面板莫名掉线」时区分「没连上」与「被别的面板顶了」 */
  private takeovers = 0;

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
    this.wss.on('error', (e) => {
      // 端口冲突等错误由 tryListen 处理,此处避免未捕获异常,但需留痕
      warn(`WS server 错误: ${e instanceof Error ? e.message : String(e)}`);
    });
    this.heartbeat = setInterval(() => this.heartbeatTick(), HEARTBEAT_MS);
    this.wss.on('connection', (ws, req) => this.attach(ws, req));

    const ok = await this.tryListen(port);
    if (!ok) {
      this.http.close();
      throw new Error(
        `插件 WS 端口 ${port} 已被占用。若确实是残留的 text-to-design-mcp,` +
          `先 \`curl -X POST http://127.0.0.1:${HTTP_PORT}/shutdown\` 收掉它;` +
          `否则用 \`ss -tlnp | grep ${port}\` 找出占用者`,
      );
    }
    this._port = port;
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.client = null;
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
      warn(`发送失败: 无客户端连接(${data.length} 字节被丢弃)`);
    }
  }

  /** 日志/状态推送专用通道:不打印自身日志——否则「推送一条日志 → send 再打一条 debug →
   *  又推送一条」会形成自激链;调用方已判定在线,静默失败由 logger 的 try/catch 兜住 */
  sendPush(frame: string): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.client.send(frame);
    }
  }

  /** 新连接接入:先顶替旧通道(见类注释),再以 ready 帧完成握手 */
  private attach(ws: WebSocket, req: IncomingMessage): void {
    const peer = `${req.socket.remoteAddress ?? '?'}:${req.socket.remotePort ?? '?'}`;
    const prev = this.client;
    if (prev && prev !== ws) {
      this.takeovers += 1;
      warn(`插件通道被新连接顶替(累计 ${this.takeovers} 次),关闭旧通道`);
      this.sendStatus(prev, 'superseded');
      prev.close(SUPERSEDED_CLOSE_CODE, 'superseded');
    }
    this.client = ws;
    log(`插件已连接(peer=${peer})`);
    try {
      this.onConnect?.();
    } catch (e) {
      log(`onConnect 回调异常: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.sendStatus(ws, 'ready');
    ws.on('message', (raw: Buffer, isBinary: boolean) => {
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      debug(`收到 WS 消息 len=${buf.length} bin=${isBinary}`);
      this.onMessage?.(buf, isBinary);
    });
    ws.on('close', (code: number, reason: Buffer) => {
      // 被顶替的旧通道关闭时**必须**提前退出:它若继续走 onDisconnect,
      // 会把刚接管的通道连坐判成离线 —— rejectAll 杀掉新通道在途请求、
      // 清空平台状态缓存,表现为「换了个面板就莫名其妙报插件离线」
      if (this.client !== ws) {
        debug('旧通道关闭(已被顶替),忽略');
        return;
      }
      this.client = null;
      // 落关闭码:这是区分「谁掐的」的唯一现场证据。
      // 1000 正常关闭 / 1001 对端离开(页面卸载、iframe 被回收) /
      // 1006 异常中断(无关闭帧:进程被杀、代理掐线、页面被冻结)
      const why = reason.length > 0 ? ` reason=${reason.toString()}` : '';
      log(`插件断开: code=${code}${why} peer=${peer} (${describeClose(code)})`);
      this.onDisconnect?.(new Error(`plugin disconnected (code=${code})`));
    });
    ws.on('error', (e: Error) => {
      if (this.client !== ws) return;
      this.client = null;
      log(`插件通道错误: ${e.message} peer=${peer}`);
      this.onDisconnect?.(new Error(`plugin connection error: ${e.message}`));
    });
  }

  /** 心跳:重发 ready,让 UI 持续拿到确认源;通道空闲/已断则不打扰 */
  private heartbeatTick(): void {
    const client = this.client;
    if (!client || client.readyState !== WebSocket.OPEN) return;
    this.sendStatus(client, 'ready');
    debug('心跳: 下发状态确认');
  }

  private sendStatus(ws: WebSocket, state: ServerStatusFrame['state']): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const frame: ServerStatusFrame = { type: 'status', state, version };
    try {
      ws.send(JSON.stringify(frame));
      debug(`已下发状态帧(${state})`);
    } catch (e) {
      warn(
        `状态帧下发失败(${state}): ${e instanceof Error ? e.message : String(e)}`,
      );
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
