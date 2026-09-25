import type { McpServer } from '@modelcontextprotocol/server';
import {
  BOOLEAN_OPERATION_LIST,
  booleanOperationNodeSchema,
  type CreatableNodeType,
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
import type { McpI18n } from '../i18n';
import { findIcon, iconToSvg, suggestIcons } from '../icons';

/** 各节点类型的 per-type 子 schema(取 shape 去掉 type 字面量,再挂 placement)。
 *  类型只用到 .shape 重建同形 object,故只声明 shape 这一必需成员,避免 any 逃逸类型检查;
 *  子 schema 带 refine/strict 包装,不能收窄成 z.ZodObject。
 */
type PerTypeNodeSchema = { shape: Record<string, z.ZodType> };

const PER_TYPE_NODE_SCHEMA: Record<CreatableNodeType, PerTypeNodeSchema> = {
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
function nodeCreateInputSchema(type: CreatableNodeType): z.ZodType {
  const shape: Record<string, unknown> = {
    ...PER_TYPE_NODE_SCHEMA[type].shape,
  };
  delete shape.type;
  return z.object({ ...shape, placement: placementSchema.optional() }).strict();
}

type CreateNodeDef = Pick<
  BridgeToolDef,
  | 'name'
  | 'title'
  | 'description'
  | 'annotations'
  | 'followUp'
  | 'platforms'
  | 'platformNote'
>;

/**
 * 构造 per-type create 工具:method='execute'、payload 注入单节点 op 负载
 * `{ops:[{type,...args}]}`,placement 保留顶层;插件协议不变,只是把 op 的
 * type 字面量与字段子集固化到工具定义里。共享 createdResultSchema 输出。
 */
function createNodeTool(
  type: CreatableNodeType,
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
  i18n: McpI18n,
): ToolHandle[] {
  const createNodeTools: BridgeToolDef[] = [
    createNodeTool('FRAME', {
      name: 'jsd_create_frame',
      title: 'createFrame.title',
      description: 'createFrame.description',
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('RECTANGLE', {
      name: 'jsd_create_rectangle',
      title: 'createRectangle.title',
      description: 'createRectangle.description',
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('TEXT', {
      name: 'jsd_create_text',
      title: 'createText.title',
      description: 'createText.description',
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('ELLIPSE', {
      name: 'jsd_create_ellipse',
      title: 'createEllipse.title',
      description: 'createEllipse.description',
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('LINE', {
      name: 'jsd_create_line',
      title: 'createLine.title',
      description: 'createLine.description',
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('POLYGON', {
      name: 'jsd_create_polygon',
      title: 'createPolygon.title',
      description: 'createPolygon.description',
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('STAR', {
      name: 'jsd_create_star',
      title: 'createStar.title',
      description: 'createStar.description',
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('VECTOR', {
      name: 'jsd_create_vector',
      title: 'createVector.title',
      description: 'createVector.description',
      // MasterGo 的矢量是 PenNode(顶点/区域模型 penNetwork),线格式的
      // vectorPaths(SVG path data)在那边没有对应字段 —— 建出来会是空矢量。
      // 已知且无替代路径,故按平台拒绝,不让调用方拿到「成功但空」的结果(0017)。
      platforms: ['jsdesign', 'figma'],
      platformNote:
        '(MasterGo 的矢量节点是 PenNode,路径为 penNetwork 顶点模型,与本工具的 vectorPaths(SVG path data)不同形;该平台暂不支持建矢量)',
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('GROUP', {
      name: 'jsd_create_group',
      title: 'createGroup.title',
      description: 'createGroup.description',
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
    createNodeTool('BOOLEAN_OPERATION', {
      name: 'jsd_create_boolean_operation',
      title: 'createBooleanOperation.title',
      description: i18n.t('createBooleanOperation.description', {
        ops: BOOLEAN_OPERATION_LIST,
      }),
      followUp: CREATE_BATCH_FOLLOWUP,
    }),
  ];

  const createSvg = bridgeTool({
    name: 'jsd_create_svg',
    title: 'createSvg.title',
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
    title: 'createIcon.title',
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
    title: 'htmlToDesign.title',
    description: 'htmlToDesign.description',
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
    ...createNodeTools.map((d) => bridgeTool(d)(server, bridge, i18n)),
    createSvg(server, bridge, i18n),
    createIcon(server, bridge, i18n),
    htmlToDesign(server, bridge, i18n),
  ];
}
