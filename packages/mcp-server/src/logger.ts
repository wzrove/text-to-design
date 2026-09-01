import { appendFileSync } from 'node:fs';
import { LOG_LEVEL_ORDER, type LogLevel } from 'text-to-design-shared';

const FILE =
  process.env.TEXT_TO_DESIGN_MCP_LOG ?? '/tmp/text-to-design-mcp.log';

type Level = LogLevel;

const LEVEL_ORDER = LOG_LEVEL_ORDER;

/** 落盘门槛(默认 info)。只约束日志文件:面板推送全量下发,由 UI 档位过滤消化噪音 */
const LEVEL =
  (process.env.TEXT_TO_DESIGN_MCP_LOG_LEVEL as Level | undefined) ?? 'info';

/** 日志外发钩子:write 触发时同步回调(daemon 借此把日志实时推送插件 UI) */
export type LogSink = (level: Level, line: string) => void;

let sink: LogSink | null = null;

/** 注册/卸载日志发射钩子(传 null 卸载);logger 保持零本地依赖,由入口组装。
 *  不变式:sink 实现内部不得再调用 log*(否则形成递归)。当前唯一实现走
 *  Bridge.notifyLog → Transport.sendPush(无日志发送通道),满足该约束 */
export function setLogSink(fn: LogSink | null): void {
  sink = fn;
}

/** 落盘 + 外发(daemon detached + stdio ignored,stderr 不可见,必须落盘) */
function write(level: Level, line: string): void {
  if (LEVEL_ORDER[level] >= LEVEL_ORDER[LEVEL]) {
    try {
      appendFileSync(
        FILE,
        `${new Date().toISOString()} [${level.toUpperCase()}] [text-to-design-mcp] ${line}\n`,
      );
    } catch {
      // 日志失败不影响主流程
    }
  }
  // 推送不受 LEVEL 门槛约束:级别只决定落盘量,面板自带档位过滤,避免 UI 侧 debug 盲区
  try {
    sink?.(level, line);
  } catch {
    // 推送失败不影响主流程
  }
}

export function log(line: string): void {
  write('info', line);
}

export function debug(line: string): void {
  write('debug', line);
}

export function warn(line: string): void {
  write('warn', line);
}

export function error(line: string): void {
  write('error', line);
}
