import type { McpServer } from '@modelcontextprotocol/server';
import {
  booleanOperationNodeSchema,
  createdResultSchema,
  createIconSchema,
  createSvgSchema,
  ellipseNodeSchema,
  frameNodeSchema,
  groupNodeSchema,
  htmlToDesignSchema,
  lineNodeSchema,
  placementSchema,
  polygonNodeSchema,
  rectangleNodeSchema,
  starNodeSchema,
  textNodeSchema,
  vectorNodeSchema,
} from 'text-to-design-shared';
import { z } from 'zod';
import type { Bridge } from '../bridge';
import {
  type BridgeToolDef,
  bridgeTool,
  type FollowUp,
  type ToolHandle,
} from '../core/registry';
import { htmlToSvg } from '../htmlToDesign';
import { findIcon, iconToSvg, suggestIcons } from '../icons';

type CreateNodeKind =
  | 'FRAME'
  | 'RECTANGLE'
  | 'ELLIPSE'
  | 'LINE'
  | 'POLYGON'
  | 'STAR'
  | 'VECTOR'
  | 'TEXT'
  | 'GROUP'
  | 'BOOLEAN_OPERATION';

/**
 * 各节点类型的 per-type 子 schema(取 shape 去掉 type 字面量,再挂 placement)。
 * 类型只用到 .shape 重建同形 object,故只声明 shape 这一必需成员,避免 any 逃逸类型检查;
 * 子 schema 带 refine/strict 包装,不能收窄成 z.ZodObject。
 */
type PerTypeNodeSchema = { shape: Record<string, z.ZodType> };

const PER_TYPE_NODE_SCHEMA: Record<CreateNodeKind, PerTypeNodeSchema> = {
  FRAME: frameNodeSchema,
  RECTANGLE: rectangleNodeSchema,
  ELLIPSE: ellipseNodeSchema,
  LINE: lineNodeSchema,
  POLYGON: polygonNodeSchema,
  STAR: starNodeSchema,
  VECTOR: vectorNodeSchema,
  TEXT: textNodeSchema,
  GROUP: groupNodeSchema,
  BOOLEAN_OPERATION: booleanOperationNodeSchema,
};

/**
 * 单节点 per-type 入参 schema:复用该类型 executeNodeSchema 子类型的字段集合,
 * 去掉 type 字面量(工具已固化该类型)、挂上可选 placement。children 等 lazy 字段
 * 原样保留,strict 拒绝越界字段。zod4 的 .omit 不支持含 refine 的 object,故用
 * shape 重建。
 */
function nodeCreateInputSchema(type: CreateNodeKind): z.ZodType {
  const shape: Record<string, unknown> = {
    ...PER_TYPE_NODE_SCHEMA[type].shape,
  };
  delete shape.type;
  return z.object({ ...shape, placement: placementSchema.optional() }).strict();
}

type CreateNodeDef = Pick<
  BridgeToolDef,
  'name' | 'title' | 'description' | 'annotations' | 'followUp'
>;

/**
 * 构造 per-type create 工具:method='execute'、payload 注入单节点 op 负载
 * `{ops:[{type,...args}]}`,placement 保留顶层;插件协议不变,只是把 op 的
 * type 字面量与字段子集固化到工具定义里。共享 createdResultSchema 输出。
 */
function createNodeTool(
  type: CreateNodeKind,
  def: CreateNodeDef,
): BridgeToolDef {
  return {
    method: 'execute',
    inputSchema: nodeCreateInputSchema(type),
    outputSchema: createdResultSchema,
    payload: (args) => {
      const { placement, ...node } = args as Record<string, unknown>;
      const ops = [{ type, ...node }];
      return placement !== undefined ? { ops, placement } : { ops };
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      ...def.annotations,
    },
    ...def,
  };
}

/** 建多节点/编排后续步骤的 followUp 引导(per-type create 共用) */
const CREATE_BATCH_FOLLOWUP: FollowUp = {
  type: 'tool',
  tool: 'jsd_batch',
  description:
    '一次建多个根节点或编排后续步骤(jsd_create_nodes 已并入 jsd_batch)',
};

/**
 * 创建类:per-type 单节点小工具 / SVG 导入 / 图标 / HTML 转设计。
 * 仿 server.ts 的 create_rectangle / create_frame / create_text / create_section 模式:
 * 每个节点类型一个工具,入参只聚焦该类型字段;多根/复杂树批量创建用 jsd_batch 编排。
 */
export function registerCreateTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const createNodeTools: BridgeToolDef[] = [
    createNodeTool('FRAME', {
      name: 'jsd_create_frame',
      title: '创建 Frame 容器',
      description: `创建单个 FRAME 容器节点,入参只含 FRAME 字段:width/height 尺寸、layoutMode 自动布局(itemSpacing/padding*/主轴交叉轴尺寸对齐)与填充描边等视觉字段。本工具只建一个根 FRAME;层级结构用 children 递归嵌套,子节点 x/y 相对父节点。auto-layout 前必须设 layoutMode=HORIZONTAL 或 VERTICAL(否则布局字段被忽略)。未显式传 fills 时引擎默认白底,透明容器传 fills:[{type:"SOLID",color:{r:0,g:0,b:0},opacity:0}]。建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('RECTANGLE', {
      name: 'jsd_create_rectangle',
      title: '创建矩形',
      description: `创建单个 RECTANGLE 矩形节点,入参只含矩形字段:width/height 尺寸、cornerRadius 四角圆角与填充描边等视觉字段。本工具只建一个根矩形;层级结构用 children 递归嵌套,子节点 x/y 相对父节点。建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('TEXT', {
      name: 'jsd_create_text',
      title: '创建文本',
      description: `创建单个 TEXT 文本节点,入参只含文本字段:characters 必填内容、fontSize/fontName 字号字体、对齐/自适应/大小写/装饰/行高/字距与填充描边。本工具只建一个根文本;层级结构用 children 递归嵌套,子节点 x/y 相对父节点。字体需精确匹配,建议先 jsd_list_fonts 查可用字体(不可用时静默回退默认)。建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('ELLIPSE', {
      name: 'jsd_create_ellipse',
      title: '创建椭圆',
      description: `创建单个 ELLIPSE 椭圆节点,width/height 尺寸、arcData 环形参数(可画环)与填充描边等视觉字段。本工具只建一个根椭圆;建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('LINE', {
      name: 'jsd_create_line',
      title: '创建线段',
      description: `创建单个 LINE 线段节点,width/height 尺寸与描边等视觉字段。本工具只建一个根线段;短直线段建议 LINE+rotation 布局更稳定。横线/竖线可把一维传 0:引擎 resize 校验要求 >= 0.01,插件创建时把零轴抬到 0.01 过校验(视觉是直线,序列化回读该轴仍是 0);jsd_resize_node 改尺寸同样支持零轴。建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('POLYGON', {
      name: 'jsd_create_polygon',
      title: '创建多边形',
      description: `创建单个 POLYGON 多边形节点,pointCount 角点数必填(如 6=六边形)、cornerRadius 圆角与填充描边等视觉字段。本工具只建一个根多边形;建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('STAR', {
      name: 'jsd_create_star',
      title: '创建星形',
      description: `创建单个 STAR 星形节点,pointCount 角点数与 innerRadius 内半径比例必填(如 5 角、0.5)、cornerRadius 圆角与填充描边等视觉字段。本工具只建一个根星形;建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('VECTOR', {
      name: 'jsd_create_vector',
      title: '创建矢量',
      description: `创建单个 VECTOR 矢量节点,vectorPaths 必填(每项含 SVG path data,如 "M0 0 L100 100")与填充描边等视觉字段。本工具只建一个根矢量。⚠ 已知平台缺陷:创建后 vectorPaths 偶发丢失/形变,短直线段建议改用 LINE+rotation 更稳定。建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('GROUP', {
      name: 'jsd_create_group',
      title: '创建编组',
      description: `创建单个 GROUP 编组节点,children 必填且至少 2 个子节点(内部用 Frame 实现),可带 auto-layout 布局字段(layoutMode/itemSpacing/padding*)。本工具只建一个根编组;要固定坐标的根层级用 placement 控制。建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('BOOLEAN_OPERATION', {
      name: 'jsd_create_boolean_operation',
      title: '创建布尔运算节点',
      description: `创建单个 BOOLEAN_OPERATION 布尔运算节点,booleanOperation 运算方式(UNION/SUBTRACT/INTERSECT/EXCLUDE)与 children 必填且至少 2 个合并子节点。本工具只建一个根布尔节点;建多个根节点/复杂树用 jsd_batch 编排`,
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
  ];

  const createSvg = bridgeTool({
    name: 'jsd_create_svg',
    title: '导入 SVG',
    description:
      '将 SVG 字符串直接导入画布为可编辑图层(createNodeFromSvg 原生解析,保留路径/渐变/描边)。建多个根节点/复杂树用 jsd_batch 编排',
    method: 'create_svg',
    inputSchema: createSvgSchema,
    outputSchema: createdResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
    payload: ({ svg, name }) => ({
      svg,
      name: name ?? 'svg-design',
    }),
    followUp: CREATE_BATCH_FOLLOWUP,
  });

  const createIcon = bridgeTool({
    name: 'jsd_create_icon',
    title: '插入内置图标',
    description:
      '按名称/别名/语义模糊匹配并插入 Lucide 内置图标;查无时返回候选名。默认 24px 黑色描边 2px。建多个根节点/复杂树用 jsd_batch 编排',
    inputSchema: createIconSchema,
    outputSchema: createdResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: async (args, bridge_, signal) => {
      const { icon, size, color, strokeWidth, name } = args as {
        icon: string;
        size?: number;
        color?: string;
        strokeWidth?: number;
        name?: string;
      };
      const def = findIcon(icon);
      if (!def) {
        const suggests = suggestIcons(icon, 8);
        const hint = suggests.length
          ? `,可尝试:${suggests.map((s) => s.name).join(', ')}`
          : '';
        throw new Error(`未知图标:${icon}${hint}`);
      }
      const svg = iconToSvg(
        def,
        size ?? 24,
        color ?? '#000000',
        strokeWidth ?? 2,
      );
      return bridge_.request(
        'create_svg',
        { svg, name: name ?? `icon-${def.name}` },
        { signal },
      );
    },
    followUp: CREATE_BATCH_FOLLOWUP,
  });

  const htmlToDesign = bridgeTool({
    name: 'jsd_html_to_design',
    title: 'HTML 转设计节点',
    description: `将 HTML 片段转成矢量图层(SVG 保真,忽略复杂样式);需要逐节点可编辑的结构时改用 jsd_create_rectangle / jsd_create_text 等手工搭建后再 jsd_batch 编排`,
    inputSchema: htmlToDesignSchema,
    outputSchema: createdResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: async (args, bridge_, signal) => {
      const { html, name } = args as { html: string; name?: string };
      const svg = htmlToSvg(html);
      return bridge_.request(
        'create_svg',
        { svg, name: name ?? 'html-design' },
        { signal },
      );
    },
    followUp: CREATE_BATCH_FOLLOWUP,
  });

  return [
    ...createNodeTools.map((d) => bridgeTool(d)(server, bridge)),
    createSvg(server, bridge),
    createIcon(server, bridge),
    htmlToDesign(server, bridge),
  ];
}
