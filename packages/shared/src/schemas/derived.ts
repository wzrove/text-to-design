import type { z } from 'zod';
import type { findSchema, updateNodePropsSchema } from './inputs';
import type { nodeTypeSchema } from './node-type';
import type {
  findResultSchema,
  listFontsResultSchema,
  listStylesResultSchema,
  pageStructureResultSchema,
} from './results';

// ---- 由 schema 推导的领域类型(core 与 index.ts 复用,唯一真源) ----

export type SerializedNodeType = z.infer<typeof nodeTypeSchema>;
export type FindParams = z.infer<typeof findSchema>;
export type FindResult = z.infer<typeof findResultSchema>;
export type UpdateNodeProps = z.infer<typeof updateNodePropsSchema>;
export type ListFontsResult = z.infer<typeof listFontsResultSchema>;
export type ListStylesResult = z.infer<typeof listStylesResultSchema>;
export type PageStructureResult = z.infer<typeof pageStructureResultSchema>;

/** 插件 exportNodes 原始返回(keyed by id,含二进制字节) */
export interface RawExportFile {
  id: string;
  name: string;
  format: 'PNG' | 'JPG' | 'SVG' | 'PDF';
  scale: number;
  mimeType: string;
  bytes: Uint8Array;
}
