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
    'jsd_execute',
    {
      description:
        '在画布执行声明式设计指令:ops 为节点数组(每项含 op 与尺寸/位置/填充/文本/布局等属性,字段与枚举以 inputSchema 为准,枚举大小写不敏感);placement 控制放置,缺省 center 居中。op 支持 frame|rect|ellipse|line|polygon|star|vector|boolean|text,缺省 frame;op=vector 用 paths 传 SVG path data;op=ellipse 可用 arcData 画环形。',
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
