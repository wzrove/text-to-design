import { z } from 'zod';

// ---- 节点类型枚举 (对齐 runtime NodeType) ----
export const nodeTypeSchema = z
  .enum([
    'SLICE',
    'FRAME',
    'GROUP',
    'COMPONENT_SET',
    'COMPONENT',
    'INSTANCE',
    'BOOLEAN_OPERATION',
    'VECTOR',
    'STAR',
    'LINE',
    'ELLIPSE',
    'POLYGON',
    'RECTANGLE',
    'TEXT',
  ])
  .describe(
    '节点类型:SLICE=切片 | FRAME=容器 | GROUP=分组 | COMPONENT_SET=组件集 | COMPONENT=组件 | INSTANCE=实例 | BOOLEAN_OPERATION=布尔运算 | VECTOR=矢量 | STAR=星形 | LINE=线段 | ELLIPSE=椭圆 | POLYGON=多边形 | RECTANGLE=矩形 | TEXT=文本',
  );
export type NodeType = z.infer<typeof nodeTypeSchema>;
