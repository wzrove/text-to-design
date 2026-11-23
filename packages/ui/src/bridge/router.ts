import type {
  ActivityPushFrame,
  ConsentPushFrame,
  ConsentSetFrame,
  CopyRequest,
  CopyRequestFrame,
  CopyResult,
  LocaleChoice,
  LocaleStateMessage,
  LogRecord,
  PluginError,
  PluginPlatform,
  PluginRequest,
  PluginResponse,
  SelectionMeta,
  SelectionSummaryData,
  ServerPush,
  ServerStatusFrame,
  UiEnvMessage,
  VersionPushFrame,
} from 'text-to-design-shared';
import {
  COPY_REQUEST_TIMEOUT_MS,
  isActivityPushFrame,
  isCanvasReadRequest,
  isConsentPushFrame,
  isVersionPushFrame,
  parseSelectionMeta,
  parseSelectionSummaryData,
  toStoredChoice,
  UI_FORWARD_TIMEOUT_MS,
} from 'text-to-design-shared';
import { t } from '../i18n/useLocale';
import { extractBytes, stripBytes } from './binary';
import { postToCode, readCodeMessage } from './codeChannel';
import type { Conn, LogLevel, Pending } from './types';

/** 摘要在超时消息里的字符上限:长批不把报错本身撑成第二份入参 */
const TIMEOUT_SHAPE_MAX = 400;

/**
 * 超时错误里的入参摘要:**只放标量、数组长度与 `ops` 的类型计数**,不展开内容。
 *
 * 目的是让「为什么超时」在下一次上报里自证 —— 25s 预算被顶穿的已知分支
 * (scope=document 全量加载 / ids 逐个深读 / depth 过大深序列化 / 某个 `execute` op 卡死)
 * 在只有「插件响应超时」一句话时完全无法区分。
 *
 * `ops` / `calls` 单独处理(2026-11-17 线上 2 次 `execute` 超时取证受阻):这两个是
 * **编排入参**,真正决定耗时的是里面的 `type` / `tool`。只给 `ops[3]` 时,一次
 * `create_svg` 超时与一次 3 个 `create_frame` 超时在日志里长得一模一样。
 * 只取类型名、按出现次数折叠(product 名是自由文本,**不**进摘要)。
 */
function describeParamsForTimeout(params: unknown): string {
  if (params == null || typeof params !== 'object' || Array.isArray(params)) {
    return 'none';
  }
  /** 编排数组成员的类型名,按出现次数折叠;超长/非字面的名字截断,免得报错被撑大 */
  const shapeOfRuns = (list: readonly unknown[]): string => {
    if (list.length === 0) return '';
    const tally = new Map<string, number>();
    for (const it of list) {
      if (it == null || typeof it !== 'object') continue;
      const rec = it as { type?: unknown; tool?: unknown };
      const raw =
        typeof rec.type === 'string'
          ? rec.type
          : typeof rec.tool === 'string'
            ? rec.tool
            : '?';
      const name = raw.length > 40 ? `${raw.slice(0, 39)}~` : raw;
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    if (tally.size === 0) return `[${list.length}]`;
    return (
      '[' +
      [...tally.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, n]) => (n > 1 ? `${name}×${n}` : name))
        .join(',') +
      ']'
    );
  };
  /** 只有这两个键是「工具调用编排」数组;其余数组照旧只给长度 */
  const runShape = (list: readonly unknown[]): string =>
    Array.isArray(list) ? shapeOfRuns(list) : '';
  const out: string[] = [];
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v == null) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out.push(`${k}=${v}`);
    else if (typeof v === 'string') out.push(`${k}=${v.length}ch`);
    else if (Array.isArray(v)) {
      const runs = k === 'ops' || k === 'calls' ? runShape(v) : '';
      out.push(runs === '' ? `${k}[${v.length}]` : `${k}${runs}`);
    } else out.push(`${k}=obj`);
  }
  if (out.length === 0) return 'none';
  const joined = out.join(' ');
  return joined.length > TIMEOUT_SHAPE_MAX
    ? `${joined.slice(0, TIMEOUT_SHAPE_MAX)}…`
    : joined;
}

/**
 * 超时成因的**已知签名**。
 *
 * 25s 只有「没在预算内返回」这一层事实,而线上记录里同一句 `forward_timeout` 背后是
 * 完全不同的根因(error_reports 2026-11-17:`find` 13 次、`execute` 2 次)。这两条的
 * 已知机制各有明确症状,故按 method 直接把排查前提写进报错:否则每次都要重走一遍
 * 「是不是插件卡死」的取证。
 *
 * 只写**已知的**:没登记的方法照旧只转入参摘要,不做猜测。
 */
function timeoutCauseOf(method: string): string | null {
  switch (method) {
    case 'find':
    case 'get_page':
      // dec 0039 修订:即时设计/MG 上任何「触碰非当前页」的枚举都会挂到转发上限
      // i18n-exempt: 随错误包上行给 MCP(模型读),语言归 MCP 侧(见 0016)
      return '本平台读不到非当前页(触碰即挂死);若调用传了 scope=document,这类枚举在即时设计上可能被退回当前页而前置耗时失控';
    case 'list_styles':
    case 'export':
    case 'jsd_export':
      // i18n-exempt: 同上,随错误包上行
      return '该方法的运行时成员可能是永不 settle 的 *Async 变体:平台须声明同步入口(dec e1e66f0a)';
    default:
      return null;
  }
}

function describeTimeoutError(method: string, params: unknown): string {
  const cause = timeoutCauseOf(method);
  // i18n-exempt: 随错误包上行给 MCP(模型读),语言归 MCP 侧(见 0016)
  const tail = cause == null ? '' : `;已知成因:${cause}`;
  // i18n-exempt: 同上
  return `插件响应超时(入参 ${describeParamsForTimeout(params)})${tail}`;
}

/** 请求/响应关联:转发挂超时定时器,code 回包直接回发 WS;localPending 仅存定时器/ping 等待 */
export class Router {
  private localPending = new Map<string, Pending>();
  private globalSeq = 0;
  /**
   * 画布只读:面板复制模式为「代码」时置位(见 App.tsx)。
   * 代码模式下 MCP 侧本该只读内容,但请求是模型发起的,只能在这里拦。
   */
  private canvasReadOnly = false;
  private conn: Conn;
  private emit: (record: LogRecord) => void;

  /** 插件主动推送的选中状态(selectionchange) */
  onSelection:
    | ((data: SelectionSummaryData | null, meta?: SelectionMeta) => void)
    | null = null;

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

  /** daemon 代查到的 npm 最新版本(见 0038);查不到时两项为 null */
  onVersion: ((frame: VersionPushFrame) => void) | null = null;

  /** 某次 tools/call 的相位(见 shared/activity-channel.ts) */
  onActivity: ((frame: ActivityPushFrame) => void) | null = null;

  /** daemon 回推的上报同意状态(见 shared/consent-channel.ts) */
  onConsent: ((frame: ConsentPushFrame) => void) | null = null;

  constructor(conn: Conn, log: (record: LogRecord) => void) {
    this.conn = conn;
    this.emit = log;
  }

  /** router 自己产的日志没有分类,统一按 bridge 档;daemon 来的记录直接走 emit */
  private log(level: LogLevel, message: string): void {
    this.emit({ level, scope: 'bridge', message });
  }

  /** 由 App 跟随复制模式切换(见 shared/dicts/canvas-readonly) */
  setCanvasReadOnly(readOnly: boolean): void {
    this.canvasReadOnly = readOnly;
  }

  pingPlugin(): Promise<unknown> {
    const id = `ui-ping-${Date.now()}-${this.globalSeq++}`;
    return this.sendToCode({ type: 'request', id, method: 'ping', params: {} });
  }

  copy(request: CopyRequest): Promise<CopyResult> {
    const frame: CopyRequestFrame = {
      type: 'request',
      id: `ui-copy-${Date.now()}-${this.globalSeq++}`,
      method: 'jsd_copy',
      params: request,
    } as CopyRequestFrame;
    const ws = this.conn.ws;
    if (ws == null || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(t('bridge.log.pluginTimeout')));
    }
    const promise = new Promise<CopyResult>((resolve, reject) => {
      this.localPending.set(frame.id, {
        resolve: (data) => resolve(data as CopyResult),
        reject,
        timer: window.setTimeout(() => {
          if (this.localPending.delete(frame.id)) {
            reject(new Error(t('bridge.log.pluginTimeout')));
          }
        }, COPY_REQUEST_TIMEOUT_MS),
      });
    });
    ws.send(JSON.stringify(frame));
    return promise;
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

  /**
   * 把用户的上报同意选择发给 daemon(见 shared/consent-channel.ts)。
   * 不在线则静默丢弃:用户的选择已留本地,重连时补发一次即可收敛。
   */
  sendConsent(granted: boolean): void {
    const ws = this.conn.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const frame: ConsentSetFrame = { type: 'consent_set', granted };
      ws.send(JSON.stringify(frame));
    }
  }

  /** 面板自报插件版本给 daemon(见 shared/version-channel.ts);离线丢弃,重连会再发 */
  sendUiVersion(version: string): void {
    const ws = this.conn.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ui_version', version }));
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
      // daemon 侧日志实时推送:直接进面板(级别过滤/去重由 LogDrawer 承接)。
      // record 缺席 = 旧 daemon,按 level+line 造一条,scope 只能给兜底值
      this.emit(
        msg.record ?? { level: msg.level, scope: 'daemon', message: msg.line },
      );
      return;
    }
    if (isVersionPushFrame(msg)) {
      this.onVersion?.(msg);
      return;
    }
    if (isActivityPushFrame(msg)) {
      this.onActivity?.(msg);
      return;
    }
    if (isConsentPushFrame(msg)) {
      this.onConsent?.(msg);
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
    if (msg.type === 'response' && this.localPending.has(msg.id)) {
      const entry = this.localPending.get(msg.id);
      if (entry == null) return;
      this.localPending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.ok) entry.resolve?.(msg.data);
      else entry.reject?.(new Error(msg.error?.message ?? 'jsd_copy error'));
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

  /**
   * 转发服务器请求给插件:只挂超时定时器,code 回包由 onCodeMessage 直接回发。
   *
   * 代码模式下的写请求不转发,当场回错(MCP 侧看到的仍是正常响应,模型能读到
   * 下一步该干什么,而不是等一个永远不会来的超时)。
   */
  private forwardRequest(conn: Conn, msg: PluginRequest): void {
    if (this.canvasReadOnly && !isCanvasReadRequest(msg.method, msg.params)) {
      this.sendResponseOverWs(conn, msg.id, false, undefined, {
        code: 'canvas_read_only',
        // i18n-exempt: 随错误包上行给 MCP(模型读),语言归 MCP 侧(见 0016)
        message: `画布只读:面板复制模式为「代码」,${msg.method} 等写入请求被拒绝;需要改画布请让用户把面板顶部模式切到「设计」`,
      });
      return;
    }
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
          //
          // 带上**本次调用的入参形状**:25s 超时只说明「没在预算内返回」,而根因可能是
          // scope=document 全量加载 / ids 深读 / depth 过大深序列化。这三条分支在
          // 上报的 message 里原来是无法区分的(实测 find 连续 57 次超时,只能猜)。
          // 只放标量与数组长度,不放 id 内容本身 —— 诊断够用,又不会把画布细节带出去。
          message: describeTimeoutError(msg.method, msg.params),
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
      // 信封拆包收在 codeChannel(两种形状都收,理由见那边注释:MasterGo 不拆
      // `pluginMessage`,只认一种的话所有回包会被静默丢弃 → daemon ping 超时)
      const pm = readCodeMessage(event.data) as
        | PluginRequest
        | PluginResponse
        | { type: 'selection'; data: unknown; meta?: unknown }
        | { type: 'platform'; platform: PluginPlatform }
        | UiEnvMessage
        | LocaleStateMessage
        | null;
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
        const meta = parseSelectionMeta(pm.meta);
        this.onSelection?.(
          parseSelectionSummaryData(pm.data),
          meta ?? undefined,
        );
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
