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
import { err, structured } from '../core/response';
import { htmlToSvg } from '../htmlToDesign';
import { findIcon, iconToSvg, suggestIcons } from '../icons';

/** 创建类:声明式节点 / SVG 导入 / HTML 转设计 */
export function registerCreateTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'jsd_create_nodes',
    {
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
      inputSchema: executeSchema,
      outputSchema: createdResultSchema,
    },
    async ({ ops, placement }) => {
      try {
        const data = await bridge.request('execute', { ops, placement });
        return structured(data, createdResultSchema);
      } catch (e) {
        return err(e, createdResultSchema);
      }
    },
  );

  server.registerTool(
    'jsd_create_svg',
    {
      description:
        '将 SVG 字符串直接导入画布(原生 createNodeFromSvg,完整保留 path/矢量/渐变/描边,不经 htmlToSvg 降级)',
      inputSchema: createSvgSchema,
      outputSchema: createdResultSchema,
    },
    async ({ svg, name }) => {
      try {
        const data = await bridge.request('create_svg', {
          svg,
          name: name ?? 'svg-design',
        });
        return structured(data, createdResultSchema);
      } catch (e) {
        return err(e, createdResultSchema);
      }
    },
  );

  server.registerTool(
    'jsd_create_icon',
    {
      description:
        '插入内置图标(Lucide 1764 个,服务端本地生成 SVG,不占模型上下文)。icon 填图标名/别名/语义(如 home、arrow-right、search、magnifier),支持模糊匹配与别名联想;找不到时错误信息会列候选名,可按提示重试。color 填描边色、size 填边长、strokeWidth 填描边宽,默认 24px 纯黑 2px。',
      inputSchema: createIconSchema,
      outputSchema: createdResultSchema,
    },
    async ({ icon, size, color, strokeWidth, name }) => {
      try {
        const def = findIcon(icon);
        if (!def) {
          const suggests = suggestIcons(icon, 8);
          const hint = suggests.length
            ? `,可尝试:${suggests.map((s) => s.name).join(', ')}`
            : '';
          return err(new Error(`未知图标:${icon}${hint}`), createdResultSchema);
        }
        const svg = iconToSvg(
          def,
          size ?? 24,
          color ?? '#000000',
          strokeWidth ?? 2,
        );
        const data = await bridge.request('create_svg', {
          svg,
          name: name ?? `icon-${def.name}`,
        });
        return structured(data, createdResultSchema);
      } catch (e) {
        return err(e, createdResultSchema);
      }
    },
  );

  server.registerTool(
    'jsd_html_to_design',
    {
      description: `将 HTML 字符串转换为 ${CLIENT.runtime} 设计节点(SVG 保真路线,忽略复杂样式),插入画布中心`,
      inputSchema: htmlToDesignSchema,
      outputSchema: createdResultSchema,
    },
    async ({ html, name }) => {
      try {
        const svg = htmlToSvg(html);
        const data = await bridge.request('create_svg', {
          svg,
          name: name ?? 'html-design',
        });
        return structured(data, createdResultSchema);
      } catch (e) {
        return err(e, createdResultSchema);
      }
    },
  );
}
