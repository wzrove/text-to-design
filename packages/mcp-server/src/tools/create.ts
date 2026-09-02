import type { McpServer } from '@modelcontextprotocol/server';
import {
  createdResultSchema,
  createIconSchema,
  createSvgSchema,
  executeSchema,
  htmlToDesignSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { bridgeTool, type ToolHandle } from '../core/registry';
import { htmlToSvg } from '../htmlToDesign';
import { findIcon, iconToSvg, suggestIcons } from '../icons';

/** 创建类:声明式节点 / SVG 导入 / 图标 / HTML 转设计 */
export function registerCreateTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const createNodes = bridgeTool({
    name: 'jsd_create_nodes',
    title: '创建设计节点',
    description: `在画布创建节点,可递归嵌套子节点。
必填 ops 为设计指令数组,如 {"ops":[{"type":"RECTANGLE","name":"矩形","width":100,"height":100}]};节点类型(FRAME/RECTANGLE/ELLIPSE/LINE/POLYGON/STAR/VECTOR/TEXT/GROUP/BOOLEAN_OPERATION)、填充描边、placement 放置方式等结构见 inputSchema 各字段说明。
放置规则:缺省整体居中且忽略 ops 内 x/y;要按坐标摆放传 placement.mode="manual"(保留 ops 内 x/y)或 "absolute"(顶层统一坐标)。建议一次调用只建一个根节点,层级用 children 表达,子节点 x/y 相对父节点。
整页/整屏等复杂结构:先取 design-strategy prompt 的「一层只建一层 + 归组后再布局」纪律再动手,别边建边改`,
    method: 'execute',
    inputSchema: executeSchema,
    outputSchema: createdResultSchema,
    // 纯新增节点,不破坏既有内容
    annotations: { readOnlyHint: false, destructiveHint: false },
  });

  const createSvg = bridgeTool({
    name: 'jsd_create_svg',
    title: '导入 SVG',
    description:
      '将 SVG 字符串直接导入画布为可编辑图层(createNodeFromSvg 原生解析,保留路径/渐变/描边)',
    method: 'create_svg',
    inputSchema: createSvgSchema,
    outputSchema: createdResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
    payload: ({ svg, name }) => ({
      svg,
      name: name ?? 'svg-design',
    }),
  });

  const createIcon = bridgeTool({
    name: 'jsd_create_icon',
    title: '插入内置图标',
    description:
      '按名称/别名/语义模糊匹配并插入 Lucide 内置图标;查无时返回候选名。默认 24px 黑色描边 2px',
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
  });

  const htmlToDesign = bridgeTool({
    name: 'jsd_html_to_design',
    title: 'HTML 转设计节点',
    description: `将 HTML 片段转成矢量图层(SVG 保真,忽略复杂样式);需要逐节点可编辑的结构时改用 jsd_create_nodes 手工搭建`,
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
  });

  return [
    createNodes(server, bridge),
    createSvg(server, bridge),
    createIcon(server, bridge),
    htmlToDesign(server, bridge),
  ];
}
