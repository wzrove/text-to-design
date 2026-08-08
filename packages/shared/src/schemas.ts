import { z } from 'zod';

// ---- 枚举大小写归一化 ----
// 布局/对齐/模式枚举值大小写不敏感(接受 center/CENTER/CEntER),不做别名映射。
function normEnumInput(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  return v.trim().toUpperCase();
}
/** 枚举字段:大小写不敏感,归一化后再走严格枚举校验 */
const pre = <const T extends readonly [string, ...string[]]>(vals: T) =>
  z.preprocess(normEnumInput, z.enum(vals));

// 序列化节点类型(与 SerializedNodeType 对应)
export const nodeTypeSchema = z.enum([
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
]);

// 输出 schema(各工具 outputSchema 复用)
export interface SerializedLayout {
  mode: 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  primaryAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER';
}

export interface SerializedNode {
  id: string;
  name: string;
  type: z.infer<typeof nodeTypeSchema>;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  fill?: string;
  gradient?: {
    type: 'GRADIENT_LINEAR';
    stops: { color: string; position: number }[];
  };
  stroke?: string;
  strokeWeight?: number;
  strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
  strokeCap?: 'NONE' | 'ROUND' | 'SQUARE' | 'ARROW_LINES' | 'ARROW_EQUILATERAL';
  strokeJoin?: 'MITER' | 'BEVEL' | 'ROUND';
  dashPattern?: number[];
  cornerSmoothing?: number;
  blendMode?: string;
  constraints?: { horizontal: ConstraintType; vertical: ConstraintType };
  layoutGrids?: SerializedLayoutGrid[];
  clipsContent?: boolean;
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number };
  shadow?: { x: number; y: number; radius: number; color: string };
  cornerRadius?: number;
  radiusTopLeft?: number;
  radiusTopRight?: number;
  radiusBottomLeft?: number;
  radiusBottomRight?: number;
  pointCount?: number;
  layout?: SerializedLayout;
  layoutGrow?: number;
  layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT';
  childCount?: number;
  children?: SerializedNode[];
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  vectorPaths?: { data: string; windingRule: string }[];
  variantProperties?: Record<string, string>;
  mainComponentId?: string;
  variantGroupProperties?: Record<string, string[]>;
}

export type ConstraintType = 'MIN' | 'MAX' | 'STRETCH' | 'CENTER' | 'SCALE';

export interface SerializedLayoutGrid {
  pattern: 'ROWS' | 'COLUMNS' | 'GRID';
  alignment?: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER';
  gutterSize?: number;
  count?: number;
  sectionSize?: number;
  offset?: number;
  visible?: boolean;
  color?: string;
}

export const serializedLayoutSchema: z.ZodType<SerializedLayout> = z.object({
  mode: pre(['HORIZONTAL', 'VERTICAL']).describe(
    '自动布局方向:HORIZONTAL|VERTICAL',
  ),
  itemSpacing: z.number().optional().describe('自动布局项间距(px)'),
  padding: z.number().optional().describe('自动布局内边距,四边统一(px)'),
  paddingTop: z.number().optional().describe('上内边距(px)'),
  paddingRight: z.number().optional().describe('右内边距(px)'),
  paddingBottom: z.number().optional().describe('下内边距(px)'),
  paddingLeft: z.number().optional().describe('左内边距(px)'),
  primaryAxisSizingMode: pre(['FIXED', 'AUTO'])
    .optional()
    .describe('主轴尺寸模式:FIXED|AUTO'),
  counterAxisSizingMode: pre(['FIXED', 'AUTO'])
    .optional()
    .describe('交叉轴尺寸模式:FIXED|AUTO'),
  primaryAxisAlignItems: pre(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
    .optional()
    .describe('主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN'),
  counterAxisAlignItems: pre(['MIN', 'MAX', 'CENTER'])
    .optional()
    .describe('交叉轴对齐:MIN|MAX|CENTER'),
});

export const serializedNodeSchema: z.ZodType<SerializedNode> = z.object({
  id: z.string(),
  name: z.string(),
  type: nodeTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  opacity: z.number().optional(),
  locked: z.boolean().optional(),
  fill: z.string().optional(),
  gradient: z
    .object({
      type: z.literal('GRADIENT_LINEAR'),
      stops: z.array(z.object({ color: z.string(), position: z.number() })),
    })
    .optional(),
  stroke: z.string().optional(),
  strokeWeight: z.number().optional(),
  strokeAlign: z.enum(['CENTER', 'INSIDE', 'OUTSIDE']).optional(),
  strokeCap: z
    .enum(['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL'])
    .optional(),
  strokeJoin: z.enum(['MITER', 'BEVEL', 'ROUND']).optional(),
  dashPattern: z.array(z.number()).optional(),
  cornerSmoothing: z.number().optional(),
  blendMode: z.string().optional(),
  constraints: z
    .object({
      horizontal: z.enum(['MIN', 'MAX', 'STRETCH', 'CENTER', 'SCALE']),
      vertical: z.enum(['MIN', 'MAX', 'STRETCH', 'CENTER', 'SCALE']),
    })
    .optional(),
  layoutGrids: z
    .array(
      z.object({
        pattern: z.enum(['ROWS', 'COLUMNS', 'GRID']),
        alignment: z.enum(['MIN', 'MAX', 'STRETCH', 'CENTER']).optional(),
        gutterSize: z.number().optional(),
        count: z.number().optional(),
        sectionSize: z.number().optional(),
        offset: z.number().optional(),
        visible: z.boolean().optional(),
        color: z.string().optional(),
      }),
    )
    .optional(),
  clipsContent: z.boolean().optional(),
  arcData: z
    .object({
      startingAngle: z.number(),
      endingAngle: z.number(),
      innerRadius: z.number(),
    })
    .optional(),
  shadow: z
    .object({
      x: z.number(),
      y: z.number(),
      radius: z.number(),
      color: z.string(),
    })
    .optional(),
  cornerRadius: z.number().optional(),
  radiusTopLeft: z.number().optional(),
  radiusTopRight: z.number().optional(),
  radiusBottomLeft: z.number().optional(),
  radiusBottomRight: z.number().optional(),
  pointCount: z.number().optional(),
  layout: serializedLayoutSchema.optional(),
  layoutGrow: z.number().optional(),
  layoutAlign: z
    .enum(['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'])
    .optional(),
  childCount: z.number().optional(),
  children: z.array(z.lazy(() => serializedNodeSchema)).optional(),
  characters: z.string().optional(),
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  fontWeight: z.string().optional(),
  textAlignVertical: z.enum(['TOP', 'CENTER', 'BOTTOM']).optional(),
  textAutoResize: z
    .enum(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'])
    .optional(),
  textCase: z.enum(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE']).optional(),
  textDecoration: z.enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH']).optional(),
  vectorPaths: z
    .array(z.object({ data: z.string(), windingRule: z.string() }))
    .optional(),
  variantProperties: z.record(z.string(), z.string()).optional(),
  mainComponentId: z.string().optional(),
  variantGroupProperties: z.record(z.string(), z.array(z.string())).optional(),
});

export const createdResultSchema = z.object({
  created: z.union([serializedNodeSchema, z.array(serializedNodeSchema)]),
});
export const updatedResultSchema = z.object({
  updated: z.array(serializedNodeSchema),
});
export const pingResultSchema = z.object({
  connected: z.boolean(),
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
export const manageComponentsResultSchema = z.object({
  created: z
    .union([serializedNodeSchema, z.array(serializedNodeSchema)])
    .optional(),
  swapped: z.array(serializedNodeSchema).optional(),
  updated: z.array(serializedNodeSchema).optional(),
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

// 输入 schema(各工具 inputSchema 复用)

export const pingSchema = z.object({});

export const getSelectionSchema = z.object({
  depth: z
    .number()
    .optional()
    .describe('序列化深度,0 表示只含节点自身属性;缺省 2'),
});

export const executeOpSchema = z.enum([
  'frame',
  'rect',
  'ellipse',
  'line',
  'polygon',
  'star',
  'vector',
  'boolean',
  'text',
]);

export interface ExecuteOp {
  op?: z.infer<typeof executeOpSchema>;
  name?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fill?: string;
  radius?: number;
  radiusTopLeft?: number;
  radiusTopRight?: number;
  radiusBottomLeft?: number;
  radiusBottomRight?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  stroke?: string;
  strokeWeight?: number;
  strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
  strokeCap?: 'NONE' | 'ROUND' | 'SQUARE' | 'ARROW_LINES' | 'ARROW_EQUILATERAL';
  strokeJoin?: 'MITER' | 'BEVEL' | 'ROUND';
  dashPattern?: number[];
  cornerSmoothing?: number;
  blendMode?: string;
  constraints?: {
    horizontal: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER' | 'SCALE';
    vertical: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER' | 'SCALE';
  };
  layoutGrids?: Array<{
    pattern: 'ROWS' | 'COLUMNS' | 'GRID';
    alignment?: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER';
    gutterSize?: number;
    count?: number;
    sectionSize?: number;
    offset?: number;
    visible?: boolean;
    color?: string;
    colorOpacity?: number;
  }>;
  clipsContent?: boolean;
  arcData?: {
    startingAngle: number;
    endingAngle: number;
    innerRadius: number;
  };
  shadow?: {
    color?: string;
    x?: number;
    y?: number;
    radius?: number;
    spread?: number;
  };
  gradient?: {
    stops?: { color: string; position: number }[];
    angle?: number;
  };
  pointCount?: number;
  innerRadius?: number;
  booleanType?: 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';
  paths?:
    | string
    | { data: string; windingRule?: 'NONZERO' | 'EVENODD' | 'NONE' }
    | Array<
        string | { data: string; windingRule?: 'NONZERO' | 'EVENODD' | 'NONE' }
      >;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  characters?: string;
  textAlign?: 'LEFT' | 'CENTER' | 'RIGHT';
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  lineHeight?: number;
  letterSpacing?: number;
  layout?: SerializedLayout;
  layoutGrow?: number;
  layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT';
  children?: ExecuteOp[];
}

export const executeNodeSchema: z.ZodType<ExecuteOp> = z.lazy(() =>
  z.object({
    op: executeOpSchema
      .optional()
      .describe(
        '操作类型:frame|rect|ellipse|line|text|vector|…(见 op 枚举,缺省 rect)',
      ),
    name: z.string().optional().describe('图层名'),
    x: z.number().optional().describe('X 坐标(px)'),
    y: z.number().optional().describe('Y 坐标(px)'),
    w: z.number().optional().describe('宽度(px)'),
    h: z.number().optional().describe('高度(px)'),
    fill: z.string().optional().describe('填充色,hex(#ff0000)或 rgba(r,g,b,a)'),
    radius: z.number().optional().describe('圆角半径(px),四角统一'),
    radiusTopLeft: z.number().optional().describe('左上圆角(px)'),
    radiusTopRight: z.number().optional().describe('右上圆角(px)'),
    radiusBottomLeft: z.number().optional().describe('左下圆角(px)'),
    radiusBottomRight: z.number().optional().describe('右下圆角(px)'),
    rotation: z.number().optional().describe('旋转角度(deg)'),
    opacity: z.number().optional().describe('不透明度 0-1'),
    locked: z.boolean().optional().describe('锁定图层'),
    stroke: z.string().optional().describe('描边色,hex 或 rgba'),
    strokeWeight: z.number().optional().describe('描边宽度(px)'),
    strokeAlign: pre(['CENTER', 'INSIDE', 'OUTSIDE'])
      .optional()
      .describe('描边对齐:CENTER|INSIDE|OUTSIDE'),
    strokeCap: z
      .enum(['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL'])
      .optional()
      .describe('描边端点:NONE|ROUND|SQUARE|ARROW_LINES|ARROW_EQUILATERAL'),
    strokeJoin: z
      .enum(['MITER', 'BEVEL', 'ROUND'])
      .optional()
      .describe('描边连接:MITER|BEVEL|ROUND'),
    dashPattern: z.array(z.number()).optional().describe('虚线段数组,如 [4,4]'),
    cornerSmoothing: z.number().optional().describe('圆角平滑度 0-1'),
    blendMode: z.string().optional().describe('混合模式,如 NORMAL'),
    constraints: z
      .object({
        horizontal: pre(['MIN', 'MAX', 'STRETCH', 'CENTER', 'SCALE']).describe(
          '水平约束:MIN|MAX|STRETCH|CENTER|SCALE',
        ),
        vertical: pre(['MIN', 'MAX', 'STRETCH', 'CENTER', 'SCALE']).describe(
          '垂直约束:MIN|MAX|STRETCH|CENTER|SCALE',
        ),
      })
      .optional()
      .describe('自动布局中的约束'),
    layoutGrids: z
      .array(
        z.object({
          pattern: z
            .enum(['ROWS', 'COLUMNS', 'GRID'])
            .describe('网格类型:ROWS|COLUMNS|GRID'),
          alignment: z
            .enum(['MIN', 'MAX', 'STRETCH', 'CENTER'])
            .optional()
            .describe('对齐:MIN|MAX|STRETCH|CENTER'),
          gutterSize: z.number().optional().describe('沟槽尺寸(px)'),
          count: z.number().optional().describe('网格数'),
          sectionSize: z.number().optional().describe('分节尺寸(px)'),
          offset: z.number().optional().describe('偏移(px)'),
          visible: z.boolean().optional().describe('是否可见'),
          color: z.string().optional().describe('网格颜色,hex'),
          colorOpacity: z.number().optional().describe('网格颜色不透明度 0-1'),
        }),
      )
      .optional()
      .describe('布局网格(参考线)'),
    clipsContent: z.boolean().optional().describe('是否裁剪溢出内容'),
    arcData: z
      .object({
        startingAngle: z.number().describe('起始角度(deg)'),
        endingAngle: z.number().describe('结束角度(deg)'),
        innerRadius: z.number().describe('内半径(px)'),
      })
      .optional()
      .describe('环形路径参数(弧线)'),
    shadow: z
      .object({
        color: z.string().optional().describe('阴影色,hex 或 rgba'),
        x: z.number().optional().describe('水平偏移(px)'),
        y: z.number().optional().describe('垂直偏移(px)'),
        radius: z.number().optional().describe('模糊半径(px)'),
        spread: z.number().optional().describe('扩散(px)'),
      })
      .optional()
      .describe('投影'),
    gradient: z
      .object({
        stops: z
          .array(
            z.object({
              color: z.string().describe('色标颜色'),
              position: z.number().describe('位置 0-1'),
            }),
          )
          .optional()
          .describe('渐变节点'),
        angle: z.number().optional().describe('渐变角度(deg)'),
      })
      .optional()
      .describe('线性渐变填充'),
    pointCount: z.number().optional().describe('多边形/polygon op 的顶点数'),
    innerRadius: z.number().optional().describe('多边形内半径(px)'),
    booleanType: z
      .enum(['UNION', 'SUBTRACT', 'INTERSECT', 'EXCLUDE'])
      .optional()
      .describe('布尔运算组合画布:UNION|SUBTRACT|INTERSECT|EXCLUDE'),
    paths: z
      .union([
        z.string(),
        z.object({
          data: z.string(),
          windingRule: z.enum(['NONZERO', 'EVENODD', 'NONE']).optional(),
        }),
        z.array(
          z.union([
            z.string(),
            z.object({
              data: z.string(),
              windingRule: z.enum(['NONZERO', 'EVENODD', 'NONE']).optional(),
            }),
          ]),
        ),
      ])
      .optional()
      .describe('矢量路径:SVG path data 字符串(或对象/数组)'),
    fontSize: z.number().optional().describe('字号(px)'),
    fontWeight: z.number().optional().describe('字重(如 400/700)'),
    fontFamily: z.string().optional().describe('字体族'),
    characters: z.string().optional().describe('文本内容'),
    textAlign: pre(['LEFT', 'CENTER', 'RIGHT'])
      .optional()
      .describe('水平对齐:LEFT|CENTER|RIGHT'),
    textAlignVertical: pre(['TOP', 'CENTER', 'BOTTOM'])
      .optional()
      .describe('垂直对齐:TOP|CENTER|BOTTOM'),
    textAutoResize: z
      .enum(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'])
      .optional()
      .describe('文本自适应:NONE|WIDTH_AND_HEIGHT|HEIGHT|TRUNCATE'),
    textCase: pre(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE'])
      .optional()
      .describe('文本大小写:ORIGINAL|UPPER|LOWER|TITLE'),
    textDecoration: pre(['NONE', 'UNDERLINE', 'STRIKETHROUGH'])
      .optional()
      .describe('文本装饰:NONE|UNDERLINE|STRIKETHROUGH'),
    lineHeight: z.number().optional().describe('行高(px)'),
    letterSpacing: z.number().optional().describe('字间距(px)'),
    layout: serializedLayoutSchema.optional().describe('自动布局参数'),
    layoutGrow: z
      .number()
      .optional()
      .describe('自动布局内伸缩系数,>0 则自动填满剩余空间'),
    layoutAlign: pre(['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'])
      .optional()
      .describe('自动布局内对齐:MIN|CENTER|MAX|STRETCH|INHERIT'),
    children: z
      .array(z.lazy(() => executeNodeSchema))
      .optional()
      .describe('子节点数组(递归)'),
  }),
);

export const placementSchema = z.object({
  mode: z
    .enum(['center', 'manual', 'absolute'])
    .optional()
    .describe('放置模式,默认 center'),
  x: z.number().optional().describe('absolute 模式下的绝对 X 坐标'),
  y: z.number().optional().describe('absolute 模式下的绝对 Y 坐标'),
});

export const executeSchema = z.object({
  ops: z.array(executeNodeSchema).describe('设计指令节点树'),
  placement: placementSchema.optional().describe('放置方式,缺省 center 居中'),
});

export const createSvgSchema = z.object({
  svg: z
    .string()
    .describe(
      '完整 SVG 字符串,如 <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0 L100 0 L100 100 Z" fill="#ff0000"/></svg>',
    ),
  name: z.string().optional().describe('生成的图层名,默认 svg-design'),
});

export const htmlToDesignSchema = z.object({
  html: z.string().describe('HTML 片段,支持内联 style'),
  name: z.string().optional().describe('生成的图层名,默认 html-design'),
});

export const createIconSchema = z.object({
  icon: z
    .string()
    .describe(
      '图标名/别名/语义描述,如 home、arrow-right、magnifier(搜索)、refresh;支持模糊匹配与别名联想,查无返回候选提示',
    ),
  size: z.number().optional().describe('图标边长 px,默认 24'),
  color: z.string().optional().describe('描边颜色(十六进制),默认 #000000'),
  strokeWidth: z.number().optional().describe('描边宽度,默认 2'),
  name: z.string().optional().describe('生成的图层名,默认 icon-<图标名>'),
});

export const updateSelectionPropsSchema = z.object({
  name: z.string().optional().describe('图层名称'),
  fill: z
    .string()
    .optional()
    .describe('十六进制颜色,如 #ff0000 或 #ff000080(带透明度)'),
  x: z.number().optional().describe('X 坐标(px)'),
  y: z.number().optional().describe('Y 坐标(px)'),
  w: z.number().optional().describe('宽度(px)'),
  h: z.number().optional().describe('高度(px)'),
  cornerRadius: z.number().optional().describe('四角统一圆角半径'),
  radiusTopLeft: z.number().optional().describe('左上角圆角'),
  radiusTopRight: z.number().optional().describe('右上角圆角'),
  radiusBottomLeft: z.number().optional().describe('左下角圆角'),
  radiusBottomRight: z.number().optional().describe('右下角圆角'),
  visible: z.boolean().optional().describe('是否可见'),
  rotation: z.number().optional().describe('旋转角度(度)'),
  opacity: z.number().optional().describe('不透明度 0~1'),
  locked: z.boolean().optional().describe('是否锁定'),
  cornerSmoothing: z.number().optional().describe('圆角平滑度 0~1'),
  blendMode: z.string().optional().describe('混合模式,如 MULTIPLY/SCREEN 等'),
  clipsContent: z.boolean().optional().describe('frame 内容是否裁剪'),
  constraints: z
    .object({
      horizontal: pre(['MIN', 'MAX', 'STRETCH', 'CENTER', 'SCALE']).describe(
        '水平约束:MIN|MAX|STRETCH|CENTER|SCALE',
      ),
      vertical: pre(['MIN', 'MAX', 'STRETCH', 'CENTER', 'SCALE']).describe(
        '垂直约束:MIN|MAX|STRETCH|CENTER|SCALE',
      ),
    })
    .optional()
    .describe('响应式约束(图钉),如 {horizontal:MIN,vertical:TOP}'),
  layoutGrids: z
    .array(
      z.object({
        pattern: z
          .enum(['ROWS', 'COLUMNS', 'GRID'])
          .describe('网格类型:ROWS|COLUMNS|GRID'),
        alignment: z
          .enum(['MIN', 'MAX', 'STRETCH', 'CENTER'])
          .optional()
          .describe('对齐:MIN|MAX|STRETCH|CENTER'),
        gutterSize: z.number().optional().describe('沟槽尺寸(px)'),
        count: z.number().optional().describe('网格数'),
        sectionSize: z.number().optional().describe('分节尺寸(px)'),
        offset: z.number().optional().describe('偏移(px)'),
        visible: z.boolean().optional().describe('是否可见'),
        color: z.string().optional().describe('网格颜色,hex'),
        colorOpacity: z.number().optional().describe('颜色不透明度 0-1'),
      }),
    )
    .optional()
    .describe('网格参考线(网格布局)'),
  arcData: z
    .object({
      startingAngle: z.number().describe('起始角度(deg)'),
      endingAngle: z.number().describe('结束角度(deg)'),
      innerRadius: z.number().describe('内半径(px)'),
    })
    .optional()
    .describe('椭圆/环形起止角度与内半径'),
  characters: z.string().optional().describe('文本内容'),
  fontSize: z.number().optional().describe('字号(px)'),
  fontWeight: z.number().optional().describe('字重'),
  fontFamily: z.string().optional().describe('字体族'),
  textAlign: pre(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'])
    .optional()
    .describe('文本对齐方式'),
  textAlignVertical: pre(['TOP', 'CENTER', 'BOTTOM'])
    .optional()
    .describe('文本垂直对齐'),
  textAutoResize: z
    .enum(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'])
    .optional()
    .describe('文本自动尺寸'),
  textCase: pre(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE'])
    .optional()
    .describe('文本大小写'),
  textDecoration: pre(['NONE', 'UNDERLINE', 'STRIKETHROUGH'])
    .optional()
    .describe('文本装饰(下划线/删除线)'),
  lineHeight: z.number().optional().describe('行高'),
  letterSpacing: z.number().optional().describe('字距'),
  stroke: z.string().optional().describe('描边颜色,如 #ffffff'),
  strokeWeight: z.number().optional().describe('描边粗细'),
  strokeAlign: pre(['CENTER', 'INSIDE', 'OUTSIDE'])
    .optional()
    .describe('描边对齐'),
  strokeCap: z
    .enum(['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL'])
    .optional()
    .describe('线帽/箭头'),
  strokeJoin: z
    .enum(['MITER', 'BEVEL', 'ROUND'])
    .optional()
    .describe('折角连接方式'),
  dashPattern: z.array(z.number()).optional().describe('虚线模式,如 [4,4]'),
  shadow: z
    .object({
      color: z.string().optional().describe('阴影颜色'),
      x: z.number().optional().describe('阴影 X 偏移'),
      y: z.number().optional().describe('阴影 Y 偏移'),
      radius: z.number().optional().describe('阴影模糊半径'),
      spread: z.number().optional().describe('阴影扩展'),
    })
    .optional()
    .describe('原生阴影(下拉阴影)'),
  layoutMode: pre(['NONE', 'HORIZONTAL', 'VERTICAL'])
    .optional()
    .describe('自动布局方向'),
  primaryAxisSizingMode: pre(['FIXED', 'AUTO'])
    .optional()
    .describe('主轴尺寸模式(仅自动布局生效)'),
  counterAxisSizingMode: pre(['FIXED', 'AUTO'])
    .optional()
    .describe('交叉轴尺寸模式(仅自动布局生效)'),
  primaryAxisAlignItems: pre(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
    .optional()
    .describe('主轴对齐方式(仅自动布局生效)'),
  counterAxisAlignItems: pre(['MIN', 'MAX', 'CENTER'])
    .optional()
    .describe('交叉轴对齐方式(仅自动布局生效)'),
  itemSpacing: z.number().optional().describe('自动布局项间距'),
  padding: z.number().optional().describe('自动布局内边距(四边统一)'),
  paddingTop: z.number().optional().describe('自动布局上内边距'),
  paddingRight: z.number().optional().describe('自动布局右内边距'),
  paddingBottom: z.number().optional().describe('自动布局下内边距'),
  paddingLeft: z.number().optional().describe('自动布局左内边距'),
  layoutGrow: z
    .number()
    .optional()
    .describe('子节点主轴填充 0=固定 1=填充(仅自动布局父容器内生效)'),
  layoutAlign: pre(['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'])
    .optional()
    .describe('子节点交叉轴对齐(仅自动布局父容器内生效)'),
  pointCount: z.number().optional().describe('多边形/星形角点数'),
});

export const updateSelectionSchema = z.object({
  ids: z.array(z.string()).optional().describe('指定节点 id,缺省用当前选中'),
  matchName: z
    .string()
    .optional()
    .describe('按节点 name 过滤,仅命中节点被修改'),
  recursive: z.boolean().optional().describe('是否递归应用到子节点,默认 false'),
  props: updateSelectionPropsSchema.describe('要修改的属性'),
});

export const findSchema = z.object({
  name: z.string().optional().describe('按名称模糊匹配(包含)'),
  type: z
    .string()
    .optional()
    .describe(
      '节点类型,如 FRAME/RECTANGLE/TEXT/ELLIPSE/LINE/POLYGON/STAR/VECTOR',
    ),
  recursive: z.boolean().optional().describe('是否递归查找(默认 true)'),
  depth: z.number().optional().describe('序列化深度,缺省 1'),
});

export const manageNodesSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('select'),
    ids: z.array(z.string()).describe('要选中的节点 id 列表'),
  }),
  z.object({
    op: z.literal('remove'),
    ids: z
      .array(z.string())
      .optional()
      .describe('要删除的节点 id 列表,缺省用当前选中'),
    matchName: z.string().optional().describe('按名称精确匹配过滤'),
  }),
  z.object({
    op: z.literal('clone'),
    ids: z.array(z.string()).describe('要复制的节点 id 列表'),
  }),
  z.object({
    op: z.literal('group'),
    ids: z.array(z.string()).describe('要编组的节点 id 列表'),
    name: z.string().optional().describe('组名'),
  }),
  z.object({
    op: z.literal('ungroup'),
    ids: z.array(z.string()).describe('要取消编组的节点 id 列表'),
  }),
  z.object({
    op: z.literal('flatten'),
    ids: z
      .array(z.string())
      .describe('要合并为单个矢量的节点 id 列表(至少 2 个)'),
  }),
  z.object({
    op: z.literal('outline_stroke'),
    ids: z.array(z.string()).describe('要转描边的节点 id 列表'),
  }),
  z.object({
    op: z.literal('reparent'),
    ids: z.array(z.string()).describe('要移动的节点 id 列表'),
    parentId: z
      .string()
      .optional()
      .describe('目标父节点 id,缺省用当前选中第一个节点'),
    index: z.number().optional().describe('插入位置,缺省追加到末尾'),
  }),
  z.object({
    op: z
      .literal('repair')
      .describe(
        '清理引擎残留的失效节点(wrapper 移除后遗留的 dangling 引用)。遍历当前页,读取失败/损坏的节点直接删除',
      ),
  }),
]);

export const manageComponentsSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create_component'),
    ids: z.array(z.string()).describe('要固化为组件的节点 id 列表'),
    name: z.string().optional().describe('组件名,默认 component'),
  }),
  z.object({
    op: z.literal('create_instance'),
    ids: z
      .array(z.string())
      .describe('组件(COMPONENT)节点 id 列表,每个生成一个实例'),
  }),
  z.object({
    op: z.literal('detach_instance'),
    ids: z.array(z.string()).describe('实例(INSTANCE)节点 id 列表'),
  }),
  z.object({
    op: z.literal('import_component'),
    key: z.string().describe('组件 Key'),
    name: z.string().optional().describe('导入后的组件名'),
  }),
  z.object({
    op: z.literal('swap_component'),
    ids: z.array(z.string()).describe('实例(INSTANCE)节点 id 列表'),
    componentId: z.string().describe('目标组件(COMPONENT)节点 id'),
  }),
  z.object({
    op: z.literal('set_instance_properties'),
    ids: z.array(z.string()).describe('实例(INSTANCE)节点 id 列表'),
    properties: z
      .record(z.string(), z.string())
      .describe('变体属性名→值,如 {"状态":"禁用"}'),
  }),
  z.object({
    op: z.literal('combine_as_variants'),
    ids: z.array(z.string()).describe('组件(COMPONENT)节点 id 列表(至少 2 个)'),
    name: z.string().optional().describe('组件集名'),
  }),
]);

export const exportSchema = z.object({
  ids: z.array(z.string()).describe('要导出的节点 id 列表'),
  format: z
    .enum(['PNG', 'JPG', 'SVG', 'PDF'])
    .optional()
    .describe('导出格式,默认 PNG'),
  scale: z.number().optional().describe('缩放倍率(PNG/JPG),默认 1'),
  savePath: z.string().optional().describe('落盘文件绝对路径,如 /tmp/icon.png'),
  includeDataUrl: z
    .boolean()
    .optional()
    .describe('是否同时返回 base64 dataURL,默认 false'),
});

export const fillImageSchema = z.object({
  ids: z.array(z.string()).describe('要填充图片的节点 id 列表'),
  sourcePath: z.string().describe('本地图片文件绝对路径,如 /tmp/poster.png'),
});

export const listFontsSchema = z.object({});
