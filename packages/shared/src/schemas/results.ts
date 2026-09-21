import { z } from 'zod';
import { SEARCH_SCOPES } from '../dicts/search-scope';
import { observedNodeTypeSchema } from './node-type';
import {
  componentPropertyValueSchema,
  coreCapabilitySchema,
  hostCapabilitySchema,
  platformOpInfoSchema,
  pluginPlatformSchema,
} from './platform';
import { serializedNodeSchema } from './serialized-node';

// ---- 结果 schema ----
export const createdResultSchema = z.object({
  created: z.union([serializedNodeSchema, z.array(serializedNodeSchema)]),
  /** 写时检测到的平台已知问题(如能力门控字段被跳过:创建的节点没带上截断/样式 id) */
  warnings: z.array(z.string()).optional(),
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
    .describe('schema.results.capabilities'),
  coreCapabilities: z
    .array(coreCapabilitySchema)
    .optional()
    .describe(
      '所有平台都具备的核心能力(create/modify/structure/component/export/image),不随平台变化',
    ),
  platformOps: z
    .array(platformOpInfoSchema)
    .optional()
    .describe(
      '当前平台可用的特有操作名单(名/标题/参数说明)。调用 jsd_platform_op 前先看这里,不要猜 op 名',
    ),
  error: z.string().optional(),
});
export const getSelectionResultSchema = z.object({
  selection: z.array(serializedNodeSchema),
  pageName: z.string(),
});
export const findResultSchema = z.object({
  nodes: z.array(serializedNodeSchema),
  total: z.number(),
  /** 实际生效的查找范围(document 为显式传入;page 为缺省,一般省略) */
  scope: z.enum(SEARCH_SCOPES).optional(),
  /**
   * 成本标注(0011 批次 5):document 范围首次触发全量加载时点名,
   * 让调用方知道这次调用比当前页查找贵在哪里。
   */
  note: z.string().optional(),
});
export const manageNodesResultSchema = z.object({
  selected: z.array(z.string()).optional(),
  removed: z.array(z.string()).optional(),
  ungrouped: z.array(z.string()).optional(),
  moved: z.array(serializedNodeSchema).optional(),
  /**
   * reparent 与 moved 同义(同一份数组):该 op 历史上只回 moved,而占位符最常见
   * 写法是 {{id.updated[0].id}},两个键同时在,写哪个都能解析。
   */
  updated: z.array(serializedNodeSchema).optional(),
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
  families: z.array(z.string()).describe('schema.results.families'),
  /**
   * 每个族实际可用的字型(style)。
   *
   * 可选字段是为了**插件版本错位**:输出校验在 daemon 侧,插件若还跑着旧产物,
   * 这里缺失不该让一次只读调用整体失败(必填会让旧插件直接报校验错误)。
   */
  fonts: z
    .array(
      z.object({
        family: z.string().describe('schema.results.family'),
        styles: z.array(z.string()).describe('schema.results.styles'),
      }),
    )
    .optional()
    .describe(
      'family → 可用 style 明细。写 fontName 前照这份清单取组合(family+style 需精确匹配,猜错会静默退回默认字重)',
    ),
  count: z.number().describe('schema.results.count'),
});

/** 页面结构总览:当前页顶层节点的轻量摘要(不递归子节点) */
export const pageStructureResultSchema = z.object({
  pageName: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: observedNodeTypeSchema,
      x: z.number(),
      y: z.number(),
      /** 在页面 children 里的下标 = 绘制顺序,0 = 最底层(顶层节点同理) */
      z: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      childCount: z.number().optional(),
    }),
  ),
  count: z.number(),
  /** 文档级页面总览(0011 批次 5):全量加载后可安全读各页顶层,childCount 为顶层节点数 */
  pages: z
    .array(
      z.object({
        name: z.string(),
        childCount: z.number(),
      }),
    )
    .optional(),
  /** 成本标注:document 范围首次触发全量加载时点名(幂等,此后不再出现) */
  note: z.string().optional(),
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
