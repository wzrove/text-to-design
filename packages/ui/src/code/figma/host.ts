import type { DesignHost } from 'text-to-design-shared';

/**
 * Figma 平台 adapter:运行时 figma 全局(类型来自 @figma/plugin-typings)
 * 结构上满足 DesignHost,单点断言收窄。
 */
export const host = figma as unknown as DesignHost;
