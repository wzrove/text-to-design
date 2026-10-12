import type { z } from 'zod';
import type { findSchema } from './inputs';
import type { observedNodeTypeSchema } from './node-type';
import type {
  assetRefSchema,
  assetsSchema,
  findResultSchema,
  listFontsResultSchema,
  listStylesResultSchema,
  pageStructureResultSchema,
} from './results';
import type {
  MoveProps,
  RenameProps,
  ResizeProps,
  SetCornerRadiusProps,
  SetEffectsProps,
  SetFillProps,
  SetLayoutProps,
  SetShapeProps,
  SetStrokeProps,
  SetTextProps,
  SetVisibilityProps,
} from './split-ops';

// ---- 由 schema 推导的领域类型(core 与 index.ts 复用,唯一真源) ----

export type SerializedNodeType = z.infer<typeof observedNodeTypeSchema>;
export type FindParams = z.infer<typeof findSchema>;
export type FindResult = z.infer<typeof findResultSchema>;
// 引擎赋值函数(applyProps)按字段逐个判空,入参需容纳全部 11 个方法的字段;
// 11 组字段零重叠,故取 Partial 交集,不额外维护一张大表。
export type UpdateNodeProps = Partial<SetFillProps> &
  Partial<SetStrokeProps> &
  Partial<SetCornerRadiusProps> &
  Partial<SetTextProps> &
  Partial<MoveProps> &
  Partial<ResizeProps> &
  Partial<SetLayoutProps> &
  Partial<SetEffectsProps> &
  Partial<SetVisibilityProps> &
  Partial<RenameProps> &
  Partial<SetShapeProps>;
export type ListFontsResult = z.infer<typeof listFontsResultSchema>;
export type ListStylesResult = z.infer<typeof listStylesResultSchema>;
export type PageStructureResult = z.infer<typeof pageStructureResultSchema>;
/** 可复用资源的最小引用(id + 名称);契约层 `getLocalVariablesAsync` 也回这个形状 */
export type AssetRef = z.infer<typeof assetRefSchema>;
/** 设计系统资源清单(0039);`PageStructureResult['assets']` 因版本错位容错而是可选的 */
export type Assets = z.infer<typeof assetsSchema>;

/** 插件 exportNodes 原始返回(keyed by id,含二进制字节) */
export interface RawExportFile {
  id: string;
  name: string;
  format: 'PNG' | 'JPG' | 'SVG' | 'PDF';
  scale: number;
  mimeType: string;
  bytes: Uint8Array;
}
