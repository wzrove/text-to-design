import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
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
 */
/**
 * 上报目标与密钥:随 npm 包分发(终端用户不会配 env)。key 走 npm 公开分发,
 * 解包即得 —— 它只是挡扫描器的口令,不是真秘密;真防护靠后端限流与轮换。
 * 部署 worker 后把两项 DEFAULT 填成真值;env 覆盖用于轮换期新旧并行。
 */
const DEFAULT_ENDPOINT =
  'https://telemetry.text-to-design.wzrove.com/v1/errors';
const DEFAULT_API_KEY = 'dev-insecure-key';

const ENDPOINT = process.env.TEXT_TO_DESIGN_TELEMETRY_URL ?? DEFAULT_ENDPOINT;
const API_KEY = process.env.TEXT_TO_DESIGN_TELEMETRY_KEY ?? DEFAULT_API_KEY;

const DATA_DIR = join(homedir(), '.text-to-design');
const INSTALL_ID_PATH = join(DATA_DIR, 'install-id');

/** 后端单批上限(/v1/errors 每次最多 50 条);队列总容量放宽一倍 */
const BATCH_MAX = 50;
const QUEUE_MAX = 100;
/** 冲刷节奏:错误遥测无时效性,慢冲即可(fatal 有进程级兜底,不受它约束) */
const FLUSH_INTERVAL_MS = 120_000;

interface QueuedError {
  level: 'error' | 'fatal' | 'warn';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  /** 同一错误的聚合次数(后端真列,默认 1) */
  count?: number;
}

let queue: QueuedError[] = [];
let installId = '';
let flushing = false;

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

export function captureError(
  level: QueuedError['level'],
  message: string,
  stack?: string,
  context?: Record<string, unknown>,
): void {
  if (ENDPOINT === '' || API_KEY === '' || !getConsent()) return;
  // 去重按整个队列聚合同名错误:重复出现只累加 count,不占新位
  for (let i = queue.length - 1; i >= 0; i--) {
    const e = queue[i];
    if (e.message === message) {
      e.count = (e.count ?? 1) + 1;
      return;
    }
  }
  const platform = getPlatformState()?.platform;
  queue.push({
    level,
    message: message.slice(0, 8000),
    stack: stack?.slice(0, 20000),
    context: platform != null ? { ...(context ?? {}), platform } : context,
  });
  if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX);
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
        errors: batch,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      debug(`遥测上报失败: HTTP ${res.status}`);
      return;
    }
    queue = queue.slice(batch.length);
  } catch (e) {
    debug(`遥测上报失败: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    flushing = false;
  }
}

/** 定时批量上报;未配置 endpoint/key 时返回 null(零开销) */
export function startTelemetryLoop(): (() => void) | null {
  if (ENDPOINT === '' || API_KEY === '') return null;
  const timer = setInterval(() => void flushTelemetry(), FLUSH_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
