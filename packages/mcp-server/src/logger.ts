import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LOG_LEVEL_ORDER,
  type LogLevel,
  type LogRecord,
} from 'text-to-design-shared';

/**
 * 落盘路径:走 `os.tmpdir()` 而不是写死 `/tmp` —— Node 在 Windows 上会把
 * `/tmp/...` 解析成 `C:\tmp\...`,而那个目录通常不存在,`appendFileSync` 抛错又被
 * 下面那个 catch 吞掉,结果是**整个 daemon 在 Windows 上没有任何日志可查**
 * (macOS/Linux 恰好有个真的 /tmp,所以这个盲区只在 Windows 上暴露)。
 */
const FILE =
  process.env.TEXT_TO_DESIGN_MCP_LOG ??
  join(tmpdir(), 'text-to-design-mcp.log');

type Level = LogLevel;

const LEVEL_ORDER = LOG_LEVEL_ORDER;

/** 落盘门槛(默认 info)。只约束日志文件:面板推送全量下发,由 UI 档位过滤消化噪音 */
const LEVEL =
  (process.env.TEXT_TO_DESIGN_MCP_LOG_LEVEL as Level | undefined) ?? 'info';

/** error / warn 的结构化标签(message 走第一个参数) */
export type LogTag = Pick<LogRecord, 'scope' | 'code' | 'subject'>;

/**
 * 日志外发钩子:write 触发时同步回调。daemon 借它把日志实时推送插件 UI + 采遥测;
 * 收到的是**结构化记录**,与落盘文件、遥测上报同一形状(见 shared/dicts/log)。
 *
 * 不变式:sink 实现内部不得再调用 log*(否则形成递归)。当前唯一实现走
 * Bridge.notifyLog → Transport.sendPush(无日志发送通道),满足该约束。
 */
export type LogSink = (record: LogRecord) => void;

let sink: LogSink | null = null;

export function setLogSink(fn: LogSink | null): void {
  sink = fn;
}

/**
 * 落盘(JSONL)+ 外发(daemon detached + stdio ignored,stderr 不可见,必须落盘)。
 *
 * 文件行 = `{time, ...LogRecord}`:与上报同一形状,结构化可解析 ——
 * `jq 'select(.scope=="bridge" and .code=="engine_error")'` 直接可用。
 */
function write(record: LogRecord): void {
  if (LEVEL_ORDER[record.level] >= LEVEL_ORDER[LEVEL]) {
    try {
      appendFileSync(
        FILE,
        `${JSON.stringify({ time: new Date().toISOString(), ...record })}\n`,
      );
    } catch {
      // 日志失败不影响主流程
    }
  }
  // 推送不受 LEVEL 门槛约束:级别只决定落盘量,面板自带档位过滤,避免 UI 侧 debug 盲区
  try {
    sink?.(record);
  } catch {
    // 推送失败不影响主流程
  }
}

export function log(message: string): void {
  write({ level: 'info', scope: 'daemon', message });
}

export function debug(message: string): void {
  write({ level: 'debug', scope: 'daemon', message });
}

export function warn(message: string, tag?: LogTag): void {
  write({ level: 'warn', scope: 'daemon', message, ...tag });
}

export function error(message: string, tag?: LogTag): void {
  write({ level: 'error', scope: 'daemon', message, ...tag });
}
