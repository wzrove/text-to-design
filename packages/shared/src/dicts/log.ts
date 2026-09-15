/**
 * 日志级别字典(唯一真源):级别全表 + 排序权重。
 *
 * MCP daemon 落盘门槛按权重比较,插件 UI 日志档位过滤也按权重比较——两侧原先
 * 各自维护一份序号表(UI 的 RANK 还额外为 'all' 占位),此处只留共享真源,
 * UI 侧派生自己的档位表。
 */

/** 级别全表(由轻到重;顺序即权重顺序) */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** 级别 → 权重:比较用,数值本身无语义,只用大小关系 */
export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
