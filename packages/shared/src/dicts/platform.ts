/**
 * 平台字典(唯一真源):平台枚举 + 显示名。
 *
 * 原先平台名散在 mcp-server config.CLIENT.label 与插件 UI EnvironmentBadge.LABEL
 * 两处硬编码,新增平台(如未来第三个设计工具)需两处同改,此处收敛。
 */

/** 平台枚举(即运行时标识;未来新增平台在此加值) */
export const PLATFORMS = ['jsdesign', 'figma', 'mastergo'] as const;

export type PlatformKey = (typeof PLATFORMS)[number];

/**
 * 平台 → 展示名。
 *
 * 取值与 i18n catalog 的 `platform.*` 三条逐字相同(client-label 测试断言这一点),
 * 但**不 import catalog**:整对象 import 会让打包器保留整份 zh-CN 字典
 * (`dicts/index.ts` 是 `export*` barrel),而 telemetry 只用三个枚举、一个分组函数,
 * 却因此吃下 553/569 条中文文案。新增平台时两处同改,由测试兜住。
 */
export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  jsdesign: '即时设计',
  figma: 'Figma',
  mastergo: 'MasterGo',
};
