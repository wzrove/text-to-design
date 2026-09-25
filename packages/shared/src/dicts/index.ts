/**
 * 跨侧字典数据总出口。
 *
 * 这里只放「纯数据 + 派生文案」的查找表:MCP server 与插件 UI 必须看到同一份
 * 取值与顺序时才收进来;单侧专有的展示文案(面板样式类名、单侧业务词表)留在各自包内。
 */
export * from './boolean-operation';
export * from './capability';
export * from './error-code';
export * from './font';
export * from './i18n';
export * from './log';
export * from './node-type';
export * from './platform';
export * from './platform-value-domain';
export * from './prop-applicability';
export * from './search-scope';
export * from './unapplied-prop';
