import { appendFileSync } from 'node:fs';
import { LOG_LEVEL_ORDER, type LogLevel } from 'text-to-design-shared';

const FILE =
  process.env.TEXT_TO_DESIGN_MCP_LOG ?? '/tmp/text-to-design-mcp.log';

type Level = LogLevel;

const LEVEL_ORDER = LOG_LEVEL_ORDER;

const LEVEL =
  (process.env.TEXT_TO_DESIGN_MCP_LOG_LEVEL as Level | undefined) ?? 'info';

/** 日志外发钩子:write 触发时同步回调(daemon 借此把日志实时推送插件 UI) */
export type LogSink = (level: Level, line: string) => void;

let sink: LogSink | null = null;
/** 重入守卫:sink 执行期间(write→send→内部 debug/warn 再进 write)不再发射,防递归刷屏 */
let emitting = false;

/** 注册/卸载日志发射钩子(传 null 卸载);logger 保持零本地依赖,由入口组装 */
export function setLogSink(fn: LogSink | null): void {
  sink = fn;
}

/** 追加一行日志到文件(daemon detached + stdio ignored,stderr 不可见,必须落盘) */
function write(level: Level, line: string): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[LEVEL]) return;
  try {
    appendFileSync(
      FILE,
      `${new Date().toISOString()} [${level.toUpperCase()}] [text-to-design-mcp] ${line}\n`,
    );
  } catch {
    // 日志失败不影响主流程
  }
  if (sink && !emitting) {
    emitting = true;
    try {
      sink(level, line);
    } catch {
      // 推送失败不影响主流程
    } finally {
      emitting = false;
    }
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
