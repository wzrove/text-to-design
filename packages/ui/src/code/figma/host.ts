import type { DesignHost } from 'text-to-design-shared';

/**
 * Figma 平台 adapter:运行时 figma 全局(类型来自 @figma/plugin-typings)
 * 结构上满足 DesignHost,单点断言收窄。getLocal*Styles 为 PluginAPI 原生符号,
 * listStyles 直接经 host 读取,无需额外注入。
 */
export const host = figma as unknown as DesignHost;
