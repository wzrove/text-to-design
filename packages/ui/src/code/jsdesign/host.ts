import type { DesignHost } from 'text-to-design-shared';

/**
 * jsDesign 平台 adapter:运行时 jsDesign 全局(类型来自
 * @jsdesigndeveloper/plugin-typings)结构上满足 DesignHost,单点断言收窄。
 */
export const host = jsDesign as unknown as DesignHost;
