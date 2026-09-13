import { z } from 'zod';

/** 平台枚举:当前支持即时设计/Figma,未来新增平台在此加值 */
export const pluginPlatformSchema = z.enum(['jsdesign', 'figma']);
export type PluginPlatform = z.infer<typeof pluginPlatformSchema>;

/** 平台能力枚举:adapter 声明当前平台支持哪些超集能力(供 ping/capabilities 上报) */
export const hostCapabilitySchema = z.enum([
  'styles',
  'textTruncation',
  'componentProperties',
  'variables',
  'getMainComponentAsync',
  'platformOps',
]);
export type HostCapability = z.infer<typeof hostCapabilitySchema>;

/**
 * 核心能力:所有平台 adapter 都实现、**不随平台变化**的功能面。
 * 与上面的平台超集能力分开上报(见 P5):调用方要判断「导出/图片填充/
 * 批量编排」这类能力是否可用时看这里,不要再从 capabilities 里找
 * ——capabilities 只列平台差异项,jsDesign 只有 `styles` 是正确的。
 */
export const coreCapabilitySchema = z.enum([
  'create',
  'modify',
  'structure',
  'component',
  'export',
  'image',
]);
export type CoreCapability = z.infer<typeof coreCapabilitySchema>;

/** 核心能力全集:ping 直接回传该常量(两平台一致,无需 adapter 各自声明) */
export const CORE_CAPABILITIES: readonly CoreCapability[] = [
  'create',
  'modify',
  'structure',
  'component',
  'export',
  'image',
];

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
