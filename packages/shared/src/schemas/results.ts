import { z } from 'zod';
import { SEARCH_SCOPES } from '../dicts/search-scope';
import { STYLE_KINDS } from '../dicts/style-kind';
import { observedNodeTypeSchema } from './node-type';
import {
  componentPropertyValueSchema,
  coreCapabilitySchema,
  hostCapabilitySchema,
  platformOpInfoSchema,
  pluginPlatformSchema,
} from './platform';
import { serializedNodeSchema } from './serialized-node';

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
  /** apply/sync 跳过了哪一类覆盖及为什么(如 swapToSource=false 时的变体属性,0023) */
  warnings: z.array(z.string()).optional(),
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
  /**
   * 分页元信息(可选:插件版本错位时旧产物不发,不能让只读调用整体失败 —— 同 `fonts`)。
   * `total` 是**过滤后**的家族总数,`truncated` 表示这一页之外还有。
   */
  total: z.number().optional().describe('schema.results.total'),
  offset: z.number().optional().describe('schema.results.offset'),
  truncated: z.boolean().optional().describe('schema.results.truncated'),
});

/**
 * 资源清单条目(0039):可复用资源只有 id 与名称是跨平台稳定事实,其余字段
 * (组件属性 / 变体轴 / 样式值)随平台形态漂移,要看它们按 id 走 jsd_find。
 */
export const assetRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * 变体集条目:多一层「维度 → 可选值」。
 *
 * **为什么必须给**:只给 id + 名称的话,调用方只知道「有个组件集」,不知道能切哪些值 ——
 * 而复用的第一步正是「切到已有的值」(jsd_set_instance_properties),拿不到取值清单就只能猜字符串。
 *
 * `properties` **可选**:即时设计与 Figma 能从节点上的 `variantGroupProperties` 直接读到
 * (一次读数),MasterGo 原生没有这个字段(它的读法在 `mg_list_variant_properties` op 里)——
 * 键缺席 = 本平台读不到,**不是**空对象(与 `assets` 整块的缺席语义一致:有就有,没有就不发)。
 */
export const variantRefSchema = assetRefSchema.extend({
  properties: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe(
      '维度 → 可选值,如 {"状态":["默认","禁用"]};平台读不到该字段时整个键省略',
    ),
});

/** 本地样式条目:四类同构(PAINT / TEXT / EFFECT / GRID),靠 `type` 区分 */
export const styleRefSchema = assetRefSchema.extend({
  type: z.enum(['PAINT', 'TEXT', 'EFFECT', 'GRID']),
});

/**
 * 设计系统资源清单(0039):四个面在**当前产物里恒在**,本平台没有的面是空数组。
 *
 * 为什么四个面都恒在而不是各自可选:资源面的缺席是**常态**而非异常 —— 即时设计
 * typings 全文无 variable 声明(接不了),而 Figma / MasterGo 读得到。
 * 若让它们可选,调用方就分不清「这个平台没有这个面」与「插件产物旧了没发这个键」。
 * 三平台的完整事实在 `dicts/platform-knowledge.ts`(0032)。
 *
 * `summary` 是**派生**的计数,不是第二份事实:它的用处是让「这文档有没有可复用的东西」
 * 一眼可判(否则要先数数组长度)—— 设计前的第一问就是它,复用纪律(见 `getPage.description`)
 * 挂在它后面。
 *
 * 整块 `assets` 则必须声明为**可选**:插件与 MCP 各自升级,产物错位时旧插件发不出
 * 这个键,而 `structured()` 对过不了 schema 的结果一律判 `isError` + 空结构 —— 那样
 * 「插件旧了」会表现为整条只读调用失败(同 `listFontsResultSchema` 的
 * `total`/`offset`/`truncated` 为什么可选:旧产物不发,不能连坐只读调用)。
 * 于是约定:键缺席 = 产物错位;键在但数组空 = 本平台没这个面。
 */
export const assetsSchema = z.object({
  /** 各面条目数(派生计数,供「有没有可复用的东西」一眼判断) */
  summary: z.object({
    components: z.number(),
    variants: z.number(),
    styles: z.number(),
    variables: z.number(),
  }),
  /** 组件(COMPONENT) */
  components: z.array(assetRefSchema),
  /** 变体集(COMPONENT_SET);带维度 → 可选值 */
  variants: z.array(variantRefSchema),
  /** 本地样式(PAINT / TEXT / EFFECT / GRID 全量,靠 type 区分) */
  styles: z.array(styleRefSchema),
  /** 变量(Figma / MasterGo 声明 `variables`;即时设计无该面,恒空 —— 见 0043) */
  variables: z.array(assetRefSchema),
});

/** 页面结构总览:当前页顶层节点的几何摘要(不递归子节点) + 设计系统资源清单 */
export const pageStructureResultSchema = z.object({
  pageName: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: observedNodeTypeSchema,
      x: z.number(),
      y: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  ),
  count: z.number(),
  /** 恒发(见上);声明为可选只为插件/MCP 产物错位时不让整条调用失败 */
  assets: assetsSchema.optional(),
  /** 文档级页面总览(0011 批次 5):全量加载后可安全读各页顶层,childCount 为顶层节点数 */
  pages: z
    .array(
      z.object({
        name: z.string(),
        childCount: z.number(),
      }),
    )
    .optional(),
  /**
   * 本次读取的附加说明(三种来源各成一句,用 `;` 拼接):
   * ① 0011 的成本标注 —— document 范围首次触发全量加载时点名(幂等,此后不再出现);
   * ② 0039 的枚举降级 —— 某页资源枚举因坏节点失败时点名页名(该页清单可能不全);
   * ③ 0043 的能力缺席 —— 某资源面在本平台未声明能力位时点名(清单恒空 ≠ 文档里没有)。
   */
  note: z.string().optional(),
});

/** 本地样式枚举结果(两平台 API 同构:PAINT/TEXT/EFFECT/GRID;类别词汇见 `dicts/style-kind.ts`) */
export const listStylesResultSchema = z.object({
  styles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(STYLE_KINDS),
    }),
  ),
  count: z.number(),
  /**
   * 0043:本平台未声明 `styleEnumeration` 时 `styles` 恒空 —— 那是**清单读不出来**,
   * 不是「文档里没有样式」。不点这一句,空数组会被读成后者(0007 禁止静默降级)。
   * 声明为可选:旧插件不发这个键,不能因此把整条只读调用判成失败。
   */
  note: z.string().optional(),
});
