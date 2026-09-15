import { z } from 'zod';
import { NODE_TYPE_DESCRIBE, NODE_TYPES } from '../dicts/node-type';

// ---- 节点类型枚举 (对齐 runtime NodeType;取值表在 ../dicts/node-type.ts) ----
export const nodeTypeSchema = z.enum(NODE_TYPES).describe(NODE_TYPE_DESCRIBE);
export type NodeType = z.infer<typeof nodeTypeSchema>;
