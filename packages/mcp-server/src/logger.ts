import { appendFileSync } from 'node:fs';
import { LOG_LEVEL_ORDER, type LogLevel } from 'text-to-design-shared';

const FILE =
  process.env.TEXT_TO_DESIGN_MCP_LOG ?? '/tmp/text-to-design-mcp.log';

type Level = LogLevel;

const LEVEL_ORDER = LOG_LEVEL_ORDER;

const LEVEL =
  (process.env.TEXT_TO_DESIGN_MCP_LOG_LEVEL as Level | undefined) ?? 'info';

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
