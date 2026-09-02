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
