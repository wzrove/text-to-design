/**
 * i18n 数据出口:两份 catalog + locale 取值/归一化/查表。
 *
 * 这里只放**纯数据 + 纯函数**;跨侧消息契约在 `shared/src/locale-channel.ts`,
 * UI 侧的响应式包装在 `ui/src/i18n/useLocale.tsx`(字典包不认识 Solid)。
 */
export * from './locale';
export * from './messages.en';
export * from './messages.zh-CN';
