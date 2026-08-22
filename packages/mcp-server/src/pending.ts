import type {
  PluginMethod,
  PluginRequest,
  PluginResponse,
} from 'text-to-design-shared';
import { log, warn } from './logger';

export type { PluginMethod };

type Pending = {
  id: string;
  method: PluginMethod;
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  waitBinary: boolean;
  binaryCount: number;
  buffers: Buffer[];
  /** 二进制响应 meta 帧中的结构数据(bytes 已被 UI 剥离) */
  data?: unknown;
  /** 请求发出时刻,用于统计耗时 */
  startedAt: number;
  /** 客户端取消传播:MCP tools/call 的 AbortSignal 联动清理 */
  abort?: { signal: AbortSignal; listener: () => void };
};

const DEFAULT_TIMEOUT = 30000;

/** 单次桥接请求选项 */
export interface RequestOptions {
  /** 超时毫秒数;缺省 DEFAULT_TIMEOUT */
  timeout?: number;
  /** 中止信号(MCP ctx.mcpReq.signal),触发后立即清理并拒绝 */
  signal?: AbortSignal;
}

/** 请求关联:发出发送、pending 表、响应/二进制帧组装、超时与整体拒绝 */
export class PendingManager {
  private pending = new Map<string, Pending>();
  private seq = 0;
  private binaryTarget: Pending | null = null;
  private sendFn: (text: string, binary?: Buffer) => void;

  constructor(send: (text: string, binary?: Buffer) => void) {
    this.sendFn = send;
  }

  request(
    method: PluginMethod,
    params: unknown,
    opts: RequestOptions = {},
  ): Promise<unknown> {
    const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
    const signal = opts.signal;
    const id = `r${++this.seq}`;
    const binary =
      params &&
      typeof params === 'object' &&
      'bytes' in (params as Record<string, unknown>)
        ? ((params as Record<string, unknown>).bytes as Uint8Array)
        : null;
    const payload = (
      binary != null
        ? {
            type: 'request',
            id,
            method,
            params: {
              ...(params as Record<string, unknown>),
              hasBinary: true,
              bytes: undefined,
            },
          }
        : { type: 'request', id, method, params }
    ) as PluginRequest;
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const entry: Pending = {
        id,
        method,
        resolve,
        reject,
        timer: null as unknown as NodeJS.Timeout,
        waitBinary: false,
        binaryCount: 0,
        buffers: [],
        startedAt,
      };
      entry.timer = setTimeout(() => {
        this.pending.delete(id);
        this.detachAbort(entry);
        warn(`请求超时: ${id} ${method} 耗时=${Date.now() - startedAt}ms`);
        reject(new Error(`请求超时: ${method}`));
      }, timeout);
      if (signal) {
        if (signal.aborted) {
          clearTimeout(entry.timer);
          reject(new Error(`请求已取消: ${method}`));
          return;
        }
        entry.abort = {
          signal,
          listener: () => {
            if (this.pending.delete(id)) {
              this.detachAbort(entry);
              log(`请求取消: ${id} ${method} 耗时=${Date.now() - startedAt}ms`);
              reject(new Error(`请求已取消: ${method}`));
            }
          },
        };
        signal.addEventListener('abort', entry.abort.listener, {
          once: true,
        });
      }
      this.pending.set(id, entry);
      log(
        `发出请求: ${id} ${method}${binary != null ? ` +binary(${binary.byteLength}B)` : ''}`,
      );
      this.sendFn(
        JSON.stringify(payload),
        binary != null ? Buffer.from(binary) : undefined,
      );
    });
  }

  /** 结束时统一摘除 abort 监听,防泄漏 */
  private detachAbort(entry: Pending): void {
    if (entry.abort) {
      entry.abort.signal.removeEventListener('abort', entry.abort.listener);
      entry.abort = undefined;
    }
  }

  onText(raw: Buffer): void {
    let msg: PluginResponse | PluginRequest;
    try {
      msg = JSON.parse(raw.toString()) as PluginResponse | PluginRequest;
    } catch {
      warn(`WS 文本解析失败: ${raw.toString().slice(0, 100)}`);
      return;
    }
    if (msg.type === 'request') {
      if (msg.method === 'ping') {
        log(`收到 ping 请求: ${msg.id} (自动回 pong)`);
        this.sendFn(
          JSON.stringify({
            type: 'response',
            id: msg.id,
            ok: true,
            data: { pong: true },
          }),
        );
      } else {
        log(`收到未知请求: ${msg.id} ${msg.method} (忽略)`);
      }
      return;
    }
    if (msg.type !== 'response') {
      log(`收到非响应消息: type=${(msg as { type?: string }).type}`);
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) {
      warn(`未匹配响应: id=${msg.id}(可能已超时或来源不明)`);
      return;
    }
    if (msg.hasBinary && (msg.binaryCount ?? 1) > 0) {
      log(`二进制响应开始: id=${msg.id} count=${msg.binaryCount ?? 1}`);
      pending.waitBinary = true;
      pending.binaryCount = msg.binaryCount ?? 1;
      pending.data = msg.data;
      this.binaryTarget = pending;
      return;
    }
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    this.detachAbort(pending);
    log(
      `响应: ${pending.id} ${pending.method} ok=${msg.ok} 耗时=${Date.now() - pending.startedAt}ms${msg.ok ? '' : ` error=${msg.error ?? ''}`}`,
    );
    if (msg.ok) pending.resolve(msg.data);
    else pending.reject(new Error(msg.error ?? 'plugin error'));
  }

  onBinary(raw: Buffer): void {
    if (!this.binaryTarget) {
      log(`孤儿二进制帧 len=${raw.byteLength}(无待组装响应)`);
      return;
    }
    this.binaryTarget.buffers.push(raw);
    log(
      `二进制帧: id=${this.binaryTarget.id} ${this.binaryTarget.buffers.length}/${this.binaryTarget.binaryCount}`,
    );
    if (this.binaryTarget.buffers.length >= this.binaryTarget.binaryCount) {
      const target = this.binaryTarget;
      this.binaryTarget = null;
      const total = target.buffers.reduce((s, b) => s + b.byteLength, 0);
      log(
        `二进制组装完成: id=${target.id} ${target.buffers.length} 帧 ${total}B 耗时=${Date.now() - target.startedAt}ms`,
      );
      this.settle(target);
    }
  }

  rejectAll(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      this.detachAbort(p);
      p.reject(err);
    }
    this.pending.clear();
  }

  clear(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      this.detachAbort(p);
    }
    this.pending.clear();
    this.binaryTarget = null;
  }

  private settle(pending: Pending): void {
    this.pending.delete(pending.id);
    clearTimeout(pending.timer);
    this.detachAbort(pending);
    pending.resolve(mergeBytes(pending.data, pending.buffers));
  }
}

/** 把二进制帧回填进 meta 结构(按帧序与插入序一一对应),兜底返回裸 Buffer */
function mergeBytes(data: unknown, buffers: Buffer[]): unknown {
  const single = buffers.length === 1 ? buffers[0] : buffers;
  if (!data || typeof data !== 'object') return single;
  const d = data as Record<string, unknown>;
  if (d.exports && typeof d.exports === 'object') {
    const exports_ = d.exports as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.entries(exports_).forEach(([k, e], i) => {
      out[k] = { ...(e as Record<string, unknown>), bytes: buffers[i] };
    });
    return { ...d, exports: out };
  }
  return { ...d, bytes: single };
}
