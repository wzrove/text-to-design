import type { ErrorCode } from './error-code';

/**
 * 日志级别字典(唯一真源):级别全表 + 排序权重。
 *
 * MCP daemon 落盘门槛按权重比较,插件 UI 日志档位过滤也按权重比较——两侧原先
 * 各自维护一份序号表(UI 的 RANK 还额外为 'all' 占位),此处只留共享真源,
 * UI 侧派生自己的档位表。
 */

/** 级别全表(由轻到重;顺序即权重顺序) */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * 日志事件的来源档位(唯一真源):daemon 侧 logger 打标,遥测 worker 按它分类与校验。
 * 只有三值 —— 别放开成自由文本,否则消费端又得回去对字符串做正则。
 */
export const LOG_SCOPES = ['bridge', 'tool', 'daemon'] as const;

export type LogScope = (typeof LOG_SCOPES)[number];

/** 级别 → 权重:比较用,数值本身无语义,只用大小关系 */
export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/** 上报用的级别子集:遥测只收这三档(与 worker 的 zod 同一份) */
export const ERROR_REPORT_LEVELS = ['fatal', 'error', 'warn'] as const;

export type ErrorReportLevel = (typeof ERROR_REPORT_LEVELS)[number];

export function isErrorReportLevel(level: LogLevel): level is ErrorReportLevel {
  return (ERROR_REPORT_LEVELS as readonly string[]).includes(level);
}

/**
 * 一条结构化日志:**UI 抽屉、落盘文件、遥测上报三处共用同一形状**。
 *
 * `message` 给人看;`scope` / `code` / `subject` 给分类与分组(见 error-report)。
 * `id` / `count` 不在这里 —— 那是投递与聚合的元数据,只有遥测载荷才有。
 */
export interface LogRecord {
  level: LogLevel;
  scope: LogScope;
  message: string;
  code?: ErrorCode;
  subject?: string;
  stack?: string;
  context?: Record<string, unknown>;
}
