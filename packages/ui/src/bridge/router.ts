import type {
  LocaleChoice,
  LocaleStateMessage,
  PluginError,
  PluginPlatform,
  PluginRequest,
  PluginResponse,
  ServerPush,
  ServerStatusFrame,
  UiEnvMessage,
} from 'text-to-design-shared';
import { toStoredChoice, UI_FORWARD_TIMEOUT_MS } from 'text-to-design-shared';
import { t } from '../i18n/useLocale';
import { extractBytes, stripBytes } from './binary';
import { postToCode } from './codeChannel';
import type { Conn, LogLevel, Pending } from './types';

/** 请求/响应关联:转发挂超时定时器,code 回包直接回发 WS;localPending 仅存定时器/ping 等待 */
export class Router {
  private localPending = new Map<string, Pending>();
  private globalSeq = 0;
  private conn: Conn;
  private log: (level: LogLevel, line: string) => void;

  /** 插件主动推送的选中状态(selectionchange) */
  onSelection: ((data: unknown) => void) | null = null;

  /** 插件主动推送的当前平台(jsdesign/figma) */
  onPlatform: ((platform: PluginPlatform) => void) | null = null;

  /** 插件上报的宿主面板环境(有没有 ui.resize),决定 UI 走自适应还是填充布局 */
  onEnv: ((env: UiEnvMessage) => void) | null = null;

  /** 插件上报的宿主存储里的语言选择(见 shared/locale-channel.ts) */
  onLocale: ((stored: LocaleChoice | null) => void) | null = null;

  /** daemon 主动下发的连接状态帧(ready / superseded),连接相位的唯一权威来源 */
  onServerStatus: ((frame: ServerStatusFrame) => void) | null = null;

  /**
   * daemon 对 UI 主动 ping 的 pong 回包。
   *
   * 单独成回调而不再塞进 onServerStatus:一个是**推送**、一个是**应答**,
   * 语义不同 —— 混用会让「谁在什么时候把状态改成 connected」无从追查。
   */
  onServerPong: (() => void) | null = null;

  constructor(conn: Conn, log: (level: LogLevel, line: string) => void) {
    this.conn = conn;
    this.log = log;
  }

  pingPlugin(): Promise<unknown> {
    const id = `ui-ping-${Date.now()}-${this.globalSeq++}`;
    return this.sendToCode({ type: 'request', id, method: 'ping', params: {} });
  }

  /** 向 daemon 发 ping 探测(daemon 自动回 pong),用于确认连接双向可达 */
  probeServer(): void {
    const ws = this.conn.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'request',
          id: `ui-probe-${Date.now()}-${this.globalSeq++}`,
          method: 'ping',
          params: {},
        }),
      );
    }
  }

  onWsText(conn: Conn, text: string): void {
    let msg: PluginRequest | PluginResponse | ServerPush;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.type === 'status') {
      this.onServerStatus?.(msg);
      return;
    }
    if (msg.type === 'log') {
      // daemon 侧日志实时推送:直接进面板(级别过滤/去重由 LogDrawer 承接)
      this.log(msg.level, msg.line);
      return;
    }
    if (
      msg.type === 'response' &&
      msg.ok &&
      (msg.data as { pong?: boolean } | undefined)?.pong
    ) {
      // daemon 对 ping 探测的自动回包 → 双向可达
      this.onServerPong?.();
      return;
    }
    if (msg.type === 'request') {
      this.log(
        'debug',
        t('bridge.log.recvRequest', {
          method: (msg as PluginRequest).method,
        }),
      );
      const raw = msg as PluginRequest & {
        params?: { hasBinary?: boolean; binaryCount?: number };
      };
      if (raw.params?.hasBinary) {
        conn.binaryIn = {
          msg,
          buffers: [],
          expected: raw.params.binaryCount ?? 1,
        };
        return;
      }
      this.forwardRequest(conn, msg);
      return;
    }
    this.log('debug', t('bridge.log.recvResponse', { id: msg.id }));
  }

  onWsBinary(conn: Conn, data: ArrayBuffer): void {
    const bytes = new Uint8Array(data);
    if (conn.binaryIn) {
      conn.binaryIn.buffers.push(bytes);
      if (conn.binaryIn.buffers.length >= conn.binaryIn.expected) {
        const bin = conn.binaryIn;
        conn.binaryIn = null;
        const params = {
          ...(bin.msg.params as Record<string, unknown>),
          bytes: bin.buffers.length === 1 ? bin.buffers[0] : bin.buffers,
          hasBinary: undefined,
          binaryCount: undefined,
        };
        this.forwardRequest(conn, {
          ...bin.msg,
          params: params as PluginRequest['params'],
        } as PluginRequest);
      }
      return;
    }
  }

  /** 转发服务器请求给插件:只挂超时定时器,code 回包由 onCodeMessage 直接回发 */
  private forwardRequest(conn: Conn, msg: PluginRequest): void {
    const timer = window.setTimeout(() => {
      if (this.localPending.delete(msg.id)) {
        this.log(
          'error',
          t('bridge.log.forwardTimeout', { method: msg.method }),
        );
        this.sendResponseOverWs(conn, msg.id, false, undefined, {
          code: 'forward_timeout',
          // i18n-exempt: 该文案随错误包上行给 MCP(模型读),语言归 MCP 侧,
          // 不跟面板 locale 走(见 0016「两处语言可以不同步」)
          message: '插件响应超时',
        });
      }
    }, UI_FORWARD_TIMEOUT_MS);
    this.localPending.set(msg.id, { timer });
    postToCode(msg);
  }

  /** 将响应发回 MCP server;若 data 含二进制(bytes),拆为 meta + 二进制帧 */
  private sendResponseOverWs(
    conn: Conn,
    id: string,
    ok: boolean,
    data?: unknown,
    error?: PluginError,
  ): void {
    const bytes = extractBytes(data);
    const meta: PluginResponse =
      bytes.length > 0
        ? {
            type: 'response',
            id,
            ok: true,
            data: stripBytes(data),
            hasBinary: true,
            binaryCount: bytes.length,
          }
        : ok
          ? { type: 'response', id, ok: true, data }
          : { type: 'response', id, ok: false, error };
    this.sendOverWs(conn.ws, meta);
    if (bytes) {
      for (const b of bytes) {
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(new Uint8Array(b));
        }
      }
    }
  }

  onCodeMessage = (event: MessageEvent): void => {
    try {
      const pm = event.data?.pluginMessage as
        | PluginRequest
        | PluginResponse
        | { type: 'selection'; data: unknown }
        | { type: 'platform'; platform: PluginPlatform }
        | UiEnvMessage
        | LocaleStateMessage
        | undefined;
      if (!pm) return;
      if (pm.type === 'ui_env') {
        this.onEnv?.(pm);
        return;
      }
      if (pm.type === 'locale_state') {
        // 存储里的脏值一律当「没选过」,守卫在 shared 侧(读的是跨版本存活的外部输入)
        this.onLocale?.(toStoredChoice((pm as { stored?: unknown }).stored));
        return;
      }
      if (pm.type === 'selection') {
        this.onSelection?.(pm.data);
        return;
      }
      if (pm.type === 'platform') {
        this.onPlatform?.(pm.platform);
        return;
      }
      if (!pm.id) return;
      if (pm.type !== 'response') {
        // 插件只回响应,不主动发请求;意外请求忽略并记日志
        this.log(
          'debug',
          t('bridge.log.ignoreUnknown', {
            type: (pm as { type?: string }).type ?? '',
          }),
        );
        return;
      }
      const entry = this.localPending.get(pm.id);
      if (entry) {
        clearTimeout(entry.timer);
        this.localPending.delete(pm.id);
      }
      const resolve = entry?.resolve;
      if (resolve) {
        // UI 自发的 ping 回包:按 promise 形态 resolve/reject
        if (pm.ok) resolve(pm.data);
        else entry?.reject?.(new Error(pm.error?.message ?? 'plugin error'));
        return;
      }
      // 服务器请求的回包:直接回发 WS
      this.sendResponseOverWs(this.conn, pm.id, pm.ok, pm.data, pm.error);
    } catch (e) {
      this.log(
        'error',
        t('bridge.log.codeFailed', {
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  };

  /** ping 专用:发请求给插件并等回包 */
  private sendToCode(request: PluginRequest): Promise<unknown> {
    const promise = new Promise<unknown>((resolve, reject) => {
      this.localPending.set(request.id, {
        resolve,
        reject,
        timer: window.setTimeout(() => {
          if (this.localPending.delete(request.id)) {
            reject(new Error(t('bridge.log.pluginTimeout')));
          }
        }, UI_FORWARD_TIMEOUT_MS),
      });
    });
    postToCode(request);
    return promise;
  }

  private sendOverWs(ws: WebSocket | null, msg: PluginResponse): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      this.log('error', t('bridge.log.sendFailed', { id: msg.id }));
      return;
    }
    ws.send(JSON.stringify(msg));
  }

  rejectAll(err: Error): void {
    for (const [, p] of this.localPending) {
      clearTimeout(p.timer);
      p.reject?.(err);
    }
    this.localPending.clear();
  }
}
