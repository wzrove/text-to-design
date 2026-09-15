/**
 * 平台字典(唯一真源):平台枚举 + 显示名。
 *
 * 原先平台名散在 mcp-server config.CLIENT.label 与插件 UI EnvironmentBadge.LABEL
 * 两处硬编码,新增平台(如未来第三个设计工具)需两处同改,此处收敛。
 */

/** 平台枚举(即运行时标识;未来新增平台在此加值) */
export const PLATFORMS = ['jsdesign', 'figma'] as const;

export type PlatformKey = (typeof PLATFORMS)[number];

/** 平台 → 展示名(MCP 侧工具/日志文案与插件 UI 徽章共用) */
export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  jsdesign: '即时设计',
  figma: 'Figma',
};
