/**
 * 查找范围字典(唯一真源):jsd_find 的 scope 取值 + 中文标签。
 *
 * MCP server 的入参描述与 core 的跨页门控(0011 批次 5)共用这一份数据。
 */

/** 查找范围取值 */
export const SEARCH_SCOPES = ['page', 'document'] as const;

export type SearchScope = (typeof SEARCH_SCOPES)[number];

/** 范围 → 中文标签(错误/提示文案共用) */
export const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = {
  page: '当前页',
  document: '全文档',
};
