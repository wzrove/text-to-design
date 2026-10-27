import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  errorGroupKey,
  isErrorReportLevel,
  type LogRecord,
} from 'text-to-design-shared';
import { SERVER_VERSION } from './config';
import { getConsent } from './consent';
import { debug } from './logger';
import { getPlatformState, getUiVersion } from './platform-state';

/**
 * 错误上报器:采集 daemon 侧错误,批量推给 telemetry worker(见 packages/telemetry)。
 *
 * 三重门,任一不满足则整条链路 no-op:① endpoint/key 已配置(部署 worker 后填,
 * 支持环境变量轮换);② 用户已同意(getConsent,默认不同意);③ 队列非空。
 *
 * 采集口只有两个:logger 的 error 级(工具失败/桥接错误的汇聚点,在 index.ts
 * 的 sink 组合处接)与进程级异常(run.ts)。上报失败只留 debug 并保留队列重试
 * —— 遥测自身的任何异常都不允许影响 daemon。
 *
 * 冲刷节奏是**事件驱动**的(dec 1a135e6a):无常驻定时器 —— 空队列零 timer,
 * 首条错误入队才挂一个延迟窗口,队列满则立即冲,失败按指数退避重挂。
 */
/**
 * 上报目标与密钥:**构建期**从仓库根 `.env.local` 烤进产物(见 vite.config.ts),运行时 env 可
 * 覆盖(轮换期新旧并行)。注入空串 = 本次构建没配 → 整条链路 no-op(三重门第一道)。
 *
 * 为什么烤进产物:终端用户不会配 env,而 key 随 npm 包公开分发、解包即得 —— 它不是
 * 真秘密(挡扫描器的口令,真防护靠后端限流与轮换),所以「不进 git、只进 dist」
 * 是这里能拿到的最好状态(与 UI 的 `__APP_VERSION__` 同一套,见 dec 0016)。
 */
declare const __TELEMETRY_DEFAULT_URL__: string;
declare const __TELEMETRY_DEFAULT_KEY__: string;

const DEFAULT_ENDPOINT =
  typeof __TELEMETRY_DEFAULT_URL__ === 'string'
    ? __TELEMETRY_DEFAULT_URL__
    : '';
const DEFAULT_API_KEY =
  typeof __TELEMETRY_DEFAULT_KEY__ === 'string'
    ? __TELEMETRY_DEFAULT_KEY__
    : '';

const ENDPOINT = process.env.TEXT_TO_DESIGN_TELEMETRY_URL ?? DEFAULT_ENDPOINT;
const API_KEY = process.env.TEXT_TO_DESIGN_TELEMETRY_KEY ?? DEFAULT_API_KEY;

const DATA_DIR = join(homedir(), '.text-to-design');
const INSTALL_ID_PATH = join(DATA_DIR, 'install-id');

/** 后端单批上限(/v1/errors 每次最多 50 条);队列总容量放宽一倍 */
const BATCH_MAX = 50;
const QUEUE_MAX = 100;
/** 首条错误入队后的聚合窗口:窗口内不重置,持续错误流也能按期成批(dec 1a135e6a) */
const FLUSH_DELAY_MS = 10_000;
/** 上报失败后的退避:指数 + jitter,封顶 5 分钟(dec 1a135e6a) */
const RETRY_BASE_MS = 10_000;
const RETRY_MAX_MS = 300_000;

/** 一条待上报错误 = 结构化日志 + 投递/聚合元数据(形状与落盘、UI 推送一致) */
interface QueuedError extends LogRecord {
  /** 条目级稳定 id:重试重发同一批时 worker 靠它去重(dec 1a135e6a) */
  id: string;
  /** 分组键(scope|code|subject|归一化 message,见 shared/dicts/error-report) */
  fingerprint: string;
  /** 同一错误的聚合次数(后端真列,默认 1) */
  count?: number;
  /** 已进请求体:count 已定格,去重与溢出裁剪都必须跳过它(dec 1a135e6a) */
  inflight?: boolean;
}

let queue: QueuedError[] = [];
let installId = '';
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let failCount = 0;
let stopped = false;

/** 匿名安装标识:本机一次生成、永续复用(与 consent.json 同目录) */
async function readInstallId(): Promise<string> {
  if (installId !== '') return installId;
  try {
    const v = (await readFile(INSTALL_ID_PATH, 'utf8')).trim();
    if (v.length >= 8) {
      installId = v;
      return v;
    }
  } catch {
    // 读不到(首跑/被删)走生成
  }
  installId = randomUUID();
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(INSTALL_ID_PATH, `${installId}\n`, 'utf8');
  } catch {
    // 写失败不拦本次上报:大不了下次再生成一个
  }
  return installId;
}

/**
 * 挂一次延迟冲刷。已挂则不重置 —— 否则持续错误流会把冲刷无限推迟(dec 1a135e6a)。
 * unref:待发 timer 不阻碍进程退出;退出路径本来就有显式 flush。
 */
function scheduleFlush(delayMs: number): void {
  if (stopped || flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushTelemetry();
  }, delayMs);
  flushTimer.unref();
}

function cancelFlush(): void {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** 指数退避 + jitter;成功时由 flushTelemetry 归零 failCount */
function scheduleRetry(): void {
  failCount++;
  const backoff = Math.min(RETRY_BASE_MS * 2 ** (failCount - 1), RETRY_MAX_MS);
  // jitter 打散多实例同时失败后的重试波峰,避免同刻集中打 worker
  const delay = backoff / 2 + Math.random() * (backoff / 2);
  cancelFlush();
  scheduleFlush(delay);
}

/** 溢出只裁**非在途**的最旧条目:在途条目已序列化,删了它的结果就无从处理(dec 1a135e6a) */
function trimQueue(): void {
  let excess = queue.length - QUEUE_MAX;
  for (let i = 0; i < queue.length && excess > 0; ) {
    if (queue[i].inflight === true) {
      i++;
      continue;
    }
    queue.splice(i, 1);
    excess--;
  }
}

/**
 * 采一条错误进上报队列。入参就是 `LogRecord`(与落盘、UI 推送同一形状,见
 * shared/dicts/log);非上报级别(debug/info)直接丢弃。
 */
export function captureError(record: LogRecord): void {
  if (!isErrorReportLevel(record.level)) return;
  if (ENDPOINT === '' || API_KEY === '' || !getConsent()) return;
  const { message, scope, code, subject } = record;
  // 去重按整个队列聚合同**形状**错误(见 errorGroupKey):重复出现只累加 count,不占新位。
  // 在途条目跳过:它的 count 已随请求体定格,再加也到不了服务端(dec 1a135e6a)
  const fingerprint = errorGroupKey({ scope, code, subject, message });
  for (let i = queue.length - 1; i >= 0; i--) {
    const e = queue[i];
    if (e.inflight === true) continue;
    if (e.fingerprint === fingerprint) {
      e.count = (e.count ?? 1) + 1;
      // 兜住「队列有货但没有 timer」的路径(如同意关闭期间滞留后重开)
      scheduleFlush(FLUSH_DELAY_MS);
      return;
    }
  }
  const platform = getPlatformState()?.platform;
  queue.push({
    ...record,
    id: randomUUID(),
    fingerprint,
    message: message.slice(0, 8000),
    stack: record.stack?.slice(0, 20000),
    context:
      platform != null
        ? { ...(record.context ?? {}), platform }
        : record.context,
  });
  trimQueue();
  if (queue.length >= BATCH_MAX) {
    cancelFlush();
    void flushTelemetry();
    return;
  }
  scheduleFlush(FLUSH_DELAY_MS);
}

/** 显式投影:inflight / fingerprint 是本地调度状态,不上线 */
function toWire(e: QueuedError): Record<string, unknown> {
  return {
    id: e.id,
    level: e.level,
    message: e.message,
    stack: e.stack,
    context: e.context,
    count: e.count,
    scope: e.scope,
    code: e.code,
    subject: e.subject,
  };
}

export async function flushTelemetry(timeoutMs = 5_000): Promise<void> {
  if (
    flushing ||
    queue.length === 0 ||
    ENDPOINT === '' ||
    API_KEY === '' ||
    !getConsent()
  ) {
    return;
  }
  flushing = true;
  const batch = queue.slice(0, BATCH_MAX);
  // 先定格:此后到达的同名错误另起一条,不再往已序列化的对象上加 count
  for (const e of batch) e.inflight = true;
  try {
    const fingerprint = await readInstallId();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        user: {
          fingerprint,
          mcpVersion: SERVER_VERSION,
          clientVersion: getUiVersion() ?? undefined,
        },
        errors: batch.map(toWire),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      debug(`遥测上报失败: HTTP ${res.status}`);
      scheduleRetry();
      return;
    }
    // 按标记出队,不依赖「前缀」假设:往返期间队列可能已被裁剪或追加(dec 1a135e6a)
    queue = queue.filter((e) => e.inflight !== true);
    failCount = 0;
    // 一批装不下(队列 > BATCH_MAX)时接着排空,别等下次错误来触发
    if (queue.length > 0) scheduleFlush(0);
  } catch (e) {
    debug(`遥测上报失败: ${e instanceof Error ? e.message : String(e)}`);
    scheduleRetry();
  } finally {
    // 失败时这些对象仍在队列里,解锁以便下轮重新聚合;成功时已出队,置位无害
    for (const e of batch) e.inflight = false;
    flushing = false;
  }
}

/**
 * 停止冲刷调度(shutdown 路径用):置停标志并清待发 timer,避免关闭过程再挂新 timer。
 * 不拦显式 `flushTelemetry` —— 退出前的最后一次冲刷仍要发出去。
 */
export function stopTelemetry(): void {
  stopped = true;
  cancelFlush();
}
