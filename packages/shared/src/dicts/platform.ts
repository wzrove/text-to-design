/**
 * 平台字典(唯一真源):平台枚举 + 显示名。
 *
 * 原先平台名散在 mcp-server config.CLIENT.label 与插件 UI EnvironmentBadge.LABEL
 * 两处硬编码,新增平台(如未来第三个设计工具)需两处同改,此处收敛。
 */

import { MESSAGES_ZH_CN } from './i18n/messages.zh-CN';

/** 平台枚举(即运行时标识;未来新增平台在此加值) */
export const PLATFORMS = ['jsdesign', 'figma'] as const;

export type PlatformKey = (typeof PLATFORMS)[number];

/**
 * 平台 → 展示名。
 *
 * **投影自 i18n catalog 的 `zh-CN` 分支**,不另写一份字面量:否则「面板上的平台名」
 * 与「MCP 日志里的平台名」会各自漂移,而它们说的是同一个事实。
 *
 * 这份导出的寿命到 B3 为止 —— 那时 MCP 侧接上自己的 locale,消费点改成边界 `t()`,
 * 这个投影连同 `MESSAGES_ZH_CN` 的直接引用一起删(面板侧早已走 `t('platform.*')`)。
 */
export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  jsdesign: MESSAGES_ZH_CN['platform.jsdesign'],
  figma: MESSAGES_ZH_CN['platform.figma'],
};
