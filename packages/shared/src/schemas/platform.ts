import { z } from 'zod';
import { CORE_CAPABILITIES, HOST_CAPABILITIES } from '../dicts/capability';
import { PLATFORMS } from '../dicts/platform';

/** 平台枚举:当前支持即时设计/Figma,未来新增平台在 ../dicts/platform.ts 加值 */
export const pluginPlatformSchema = z.enum(PLATFORMS);
export type PluginPlatform = z.infer<typeof pluginPlatformSchema>;

/**
 * 平台能力枚举:adapter 声明当前平台支持哪些超集能力(供 ping/capabilities 上报)。
 *
 * 取值表在 ../dicts/capability.ts(与「能力门控的属性表」同一份真源);core 的
 * 超集字段判定也吃这张表 —— 由插件入口 setHostCapabilities 注入,不再是两套事实。
 *
 * 语义边界 —— 只列**调用方能实际用上**的能力面:
 * - 不含 `getMainComponentAsync`:Figma typings 有此 API,但本仓 manifest 走 legacy
 *   documentAccess(core 用同步 mainComponent),core 零调用,列出来只会让调用方
 *   以为有异步通路 —— 能力表与 typings 的事实核对见各插件包的 sync-guarantee.ts。
 */
export const hostCapabilitySchema = z.enum(HOST_CAPABILITIES);
export type HostCapability = z.infer<typeof hostCapabilitySchema>;

/**
 * 核心能力:所有平台 adapter 都实现、**不随平台变化**的功能面。
 * 与上面的平台超集能力分开上报(见 P5):调用方要判断「导出/图片填充/
 * 批量编排」这类能力是否可用时看这里,不要再从 capabilities 里找
 * ——capabilities 只列平台差异项,jsDesign 只有 `styles` 是正确的。
 *
 * 取值与中文标签在 ../dicts/capability.ts(经 shared 根出口导出);
 * 这里只做 zod 派生,不再自己维护一份取值。
 */
export const coreCapabilitySchema = z.enum(CORE_CAPABILITIES);
export type CoreCapability = z.infer<typeof coreCapabilitySchema>;

/**
 * ping 回传的平台特有操作条目。
 *
 * 为什么不只回传一个 `platformOps` 能力名:调用方(尤其模型)要能**发现** op 名与
 * 入参形状,否则只能猜 —— 而猜出来的 op 名只在报错里才被打回。事实源是插件侧
 * PlatformMeta.platformOps(含 zod inputSchema),这里只透传「名/标题/描述」,
 * 描述里已写明 params 形状,不把 schema 本体塞进线格式。
 */
export const platformOpInfoSchema = z.object({
  name: z.string().describe('op 名,调用 jsd_platform_op 时原样传'),
  title: z.string(),
  description: z.string().describe('含 params 形状说明'),
});
export type PlatformOpInfo = z.infer<typeof platformOpInfoSchema>;

/** 实例组件属性值(Figma ComponentPropertyValue 的线格式,preferredValues 对齐 InstanceSwapPreferredValue) */
export const componentPropertyValueSchema = z.object({
  type: z.enum(['BOOLEAN', 'VARIANT', 'TEXT', 'INSTANCE_SWAP']),
  value: z.union([z.boolean(), z.string()]),
  preferredValues: z
    .array(
      z.object({
        type: z.enum(['COMPONENT', 'COMPONENT_SET']),
        key: z.string(),
      }),
    )
    .optional(),
});
export type ComponentPropertyValue = z.infer<
  typeof componentPropertyValueSchema
>;
