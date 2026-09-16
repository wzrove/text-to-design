import { z } from 'zod';
import {
  NODE_TYPE_DESCRIBE,
  NODE_TYPES,
  OBSERVED_NODE_TYPES,
} from '../dicts/node-type';

// ---- 节点类型枚举 (对齐 runtime NodeType;取值表在 ../dicts/node-type.ts) ----
/** 写路径(创建/校验)支持的类型:jsDesign 的 14 类 */
export const nodeTypeSchema = z.enum(NODE_TYPES).describe(NODE_TYPE_DESCRIBE);
export type NodeType = z.infer<typeof nodeTypeSchema>;

/**
 * 读路径(序列化结果)允许出现的类型 = 上面 14 类 + Figma 独有的 20 类只读类型。
 * 只放宽读、不放宽写:否则 Figma 画布上本来就有 SECTION/STICKY,一条结果里出现
 * 一个未知类型就会让整条 get_selection/find 校验失败、退化成空结构 + isError。
 */
export const observedNodeTypeSchema = z
  .enum(OBSERVED_NODE_TYPES)
  .describe(
    `${NODE_TYPE_DESCRIBE};另有 Figma 独有只读类型(TEXT_PATH/STICKY/SECTION/TABLE/SLIDE 等 20 类)可能出现在读结果里,本仓不支持创建与修改它们`,
  );
export type ObservedNodeType = z.infer<typeof observedNodeTypeSchema>;
