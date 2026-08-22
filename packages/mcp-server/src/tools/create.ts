import type { McpServer } from '@modelcontextprotocol/server';
import {
  createdResultSchema,
  createIconSchema,
  createSvgSchema,
  executeSchema,
  htmlToDesignSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { CLIENT } from '../config';
import { bridgeTool, type ToolHandle } from '../core/registry';
import { htmlToSvg } from '../htmlToDesign';
import { findIcon, iconToSvg, suggestIcons } from '../icons';

/** 创建类:声明式节点 / SVG 导入 / 图标 / HTML 转设计 */
export function registerCreateTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const execute = bridgeTool({
    name: 'jsd_execute',
    title: '创建设计节点',
    description: `在画布创建节点(可递归嵌套子节点)。

节点类型 type:
- FRAME=容器(可 auto-layout)
- RECTANGLE=矩形
- ELLIPSE=椭圆(配合 arcData 可画环)
- LINE=线段
- POLYGON=多边形(配合 pointCount)
- STAR=星形(配合 pointCount + innerRadius)
- VECTOR=矢量(配合 vectorPaths 传 SVG path data)
- TEXT=文本(配合 characters/fontSize/fontName 等)
- GROUP=分组(内部用 Frame 实现)
- BOOLEAN_OPERATION=布尔运算(配合 booleanOperation:UNION|SUBTRACT|INTERSECT|EXCLUDE)

填充 fills/描边 strokes:每项为 {type:"SOLID", color:{r,g,b}} 或 {type:"GRADIENT_LINEAR",...},color 的 r/g/b 范围 0-1。
放置 placement:mode=center 居中画布,manual=保持原始坐标,absolute=使用 x/y 坐标。`,
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
      '将 SVG 字符串直接导入画布(原生 createNodeFromSvg,完整保留 path/矢量/渐变/描边,不经 htmlToSvg 降级)',
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
      '插入内置图标(Lucide 1764 个,服务端本地生成 SVG,不占模型上下文)。icon 填图标名/别名/语义(如 home、arrow-right、search、magnifier),支持模糊匹配与别名联想;找不到时错误信息会列候选名,可按提示重试。color 填描边色、size 填边长、strokeWidth 填描边宽,默认 24px 纯黑 2px。',
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
      const svg = iconToSvg(def, size ?? 24, color ?? '#000000', strokeWidth ?? 2);
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
    description: `将 HTML 字符串转换为 ${CLIENT.runtime} 设计节点(SVG 保真路线,忽略复杂样式),插入画布中心`,
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
    execute(server, bridge),
    createSvg(server, bridge),
    createIcon(server, bridge),
    htmlToDesign(server, bridge),
  ];
}
