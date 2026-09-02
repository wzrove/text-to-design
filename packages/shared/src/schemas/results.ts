import { z } from 'zod';
import { nodeTypeSchema } from './node-type';
import {
  componentPropertyValueSchema,
  hostCapabilitySchema,
  pluginPlatformSchema,
} from './platform';
import { serializedNodeSchema } from './serialized-node';

// ---- 结果 schema ----
export const createdResultSchema = z.object({
  created: z.union([serializedNodeSchema, z.array(serializedNodeSchema)]),
});
export const updatedResultSchema = z.object({
  updated: z.array(serializedNodeSchema),
  /** 写时检测到的平台已知问题(如实例内文字样式覆盖渲染不生效) */
  warnings: z.array(z.string()).optional(),
});

export const pingResultSchema = z.object({
  connected: z.boolean(),
  platform: pluginPlatformSchema.optional(),
  capabilities: z
    .array(hostCapabilitySchema)
    .optional()
    .describe('当前平台支持的能力列表(先查此字段再决定能否调用平台特有操作)'),
  error: z.string().optional(),
});
export const getSelectionResultSchema = z.object({
  selection: z.array(serializedNodeSchema),
  pageName: z.string(),
});
export const findResultSchema = z.object({
  nodes: z.array(serializedNodeSchema),
  total: z.number(),
});
export const manageNodesResultSchema = z.object({
  selected: z.array(z.string()).optional(),
  removed: z.array(z.string()).optional(),
  ungrouped: z.array(z.string()).optional(),
  moved: z.array(serializedNodeSchema).optional(),
  cleaned: z.array(z.string()).optional(),
  created: z
    .union([serializedNodeSchema, z.array(serializedNodeSchema)])
    .optional(),
});
/** 实例覆盖摘要(只回传键名,不回传大体积值) */
export const overrideSummarySchema = z.object({
  variantProperties: z.record(z.string(), z.string()).optional(),
  componentProperties: z
    .record(z.string(), componentPropertyValueSchema)
    .optional(),
  propsSummary: z.array(z.string()).optional(),
});

/** 单实例套用结果 */
export const applyOverrideItemSchema = z.object({
  instanceId: z.string(),
  instanceName: z.string(),
  ok: z.boolean(),
  message: z.string().optional(),
});

export const manageComponentsResultSchema = z.object({
  created: z
    .union([serializedNodeSchema, z.array(serializedNodeSchema)])
    .optional(),
  swapped: z.array(serializedNodeSchema).optional(),
  updated: z.array(serializedNodeSchema).optional(),
  /** copy_overrides 返回的快照标识(=源实例 id) */
  snapshotId: z.string().optional(),
  sourceName: z.string().optional(),
  /** copy_overrides 返回的复制摘要 */
  captured: overrideSummarySchema.optional(),
  /** apply/sync 返回的逐条套用结果 */
  applied: z.array(applyOverrideItemSchema).optional(),
  /** apply/sync 返回的已套用摘要 */
  source: overrideSummarySchema.optional(),
  /** detach_instance 部分失败时逐条报告(id + 原因);全部失败直接抛错 */
  failed: z.array(z.object({ id: z.string(), message: z.string() })).optional(),
});
export const exportResultSchema = z.object({
  exports: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      format: z.enum(['PNG', 'JPG', 'SVG', 'PDF']),
      mimeType: z.string(),
      size: z.number(),
      path: z.string().optional(),
      dataUrl: z.string().optional(),
    }),
  ),
});
export const listFontsResultSchema = z.object({
  families: z.array(z.string()),
  count: z.number(),
});

/** 页面结构总览:当前页顶层节点的轻量摘要(不递归子节点) */
export const pageStructureResultSchema = z.object({
  pageName: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: nodeTypeSchema,
      x: z.number(),
      y: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      childCount: z.number().optional(),
    }),
  ),
  count: z.number(),
});

/** 本地样式枚举结果(两平台 API 同构:PAINT/TEXT/EFFECT/GRID) */
export const listStylesResultSchema = z.object({
  styles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['PAINT', 'TEXT', 'EFFECT', 'GRID']),
    }),
  ),
  count: z.number(),
});
