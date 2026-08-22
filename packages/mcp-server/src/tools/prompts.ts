import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ToolHandle } from '../core/registry';

/** 高频配方 prompt:把 AGENTS.md 的操作纪律沉淀成可复用的引导词 */
export function registerPrompts(server: McpServer): ToolHandle[] {
  const designCard = server.registerPrompt(
    'design-card',
    {
      title: '设计卡片',
      description:
        '在画布生成一张带标题的卡片,严格遵循「平铺创建 + reparent 归组 + 事后设布局」纪律',
      argsSchema: z.object({
        title: z.string().describe('卡片主标题文案'),
        subtitle: z.string().optional().describe('副标题文案(可选)'),
        width: z
          .string()
          .optional()
          .describe(
            '卡宽 px 的数字字符串,默认 "320"(MCP prompt 参数均为字符串)',
          ),
        height: z
          .string()
          .optional()
          .describe('卡高 px 的数字字符串,默认 "200"'),
      }),
    },
    ({ title, subtitle, width, height }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: cardRecipe(
              String(title),
              subtitle == null ? undefined : String(subtitle),
              Number(width) || 320,
              Number(height) || 200,
            ),
          },
        },
      ],
    }),
  );

  const htmlToDesign = server.registerPrompt(
    'html-to-design',
    {
      title: 'HTML 转设计稿',
      description: '把一段 HTML 转为画布节点,含保真度取舍说明',
      argsSchema: z.object({
        html: z.string().describe('要转换的 HTML 片段'),
        name: z.string().optional().describe('生成节点的名称,默认 html-design'),
      }),
    },
    ({ html, name }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `请把下面的 HTML 转成设计稿。优先调用 jsd_html_to_design(SVG 保真路线,忽略复杂样式);若用户要求可编辑的结构化图层,则改用 jsd_create_nodes 手工映射(容器→FRAME、文本→TEXT、图标/图形→VECTOR),再用 jsd_manage_nodes reparent 组织层级。\n\nHTML:\n\`\`\`\n${String(html)}\n\`\`\`${name == null ? '' : `\n节点名:${String(name)}`}`,
          },
        },
      ],
    }),
  );

  const iconGrid = server.registerPrompt(
    'icon-grid',
    {
      title: '图标网格',
      description: '批量插入 Lucide 图标并排成自动布局网格',
      argsSchema: z.object({
        icons: z
          .string()
          .describe('图标名列表,逗号分隔,如 house,search,settings'),
        size: z
          .string()
          .optional()
          .describe('单个图标边长 px 数字字符串,默认 "24"'),
        gap: z.string().optional().describe('图标间距 px 数字字符串,默认 "16"'),
      }),
    },
    ({ icons, size, gap }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `请插入图标网格:1) 用 jsd_create_nodes 创建一个 FRAME 容器;2) 对每个图标依次调用 jsd_create_icon(size=${Number(size) || 24});3) 用 jsd_manage_nodes op=reparent 把全部图标移入容器;4) 用 jsd_update_node 给容器设 auto-layout(layoutMode=HORIZONTAL,itemSpacing=${Number(gap) || 16},counterAxisAlignItems=CENTER)并 scrollAndZoomIntoView 居中。\n图标列表: ${String(icons)}`,
          },
        },
      ],
    }),
  );

  // 配方是静态引导词,不依赖插件连接 → 恒可用
  return [designCard, htmlToDesign, iconGrid].map((handle) =>
    Object.assign(handle, { alwaysEnabled: true }),
  );
}

function cardRecipe(
  title: string,
  subtitle: string | undefined,
  width: number,
  height: number,
): string {
  const texts =
    subtitle == null
      ? `1 个 TEXT 主标题「${title}」`
      : `1 个 TEXT 主标题「${title}」和 1 个 TEXT 副标题「${subtitle}」`;
  return `请用 text-to-design 工具在画布中心创建一张 ${width}x${height} 的卡片,严格按以下步骤:
1) jsd_create_nodes 平铺创建(不嵌套 children):1 个 FRAME 卡片底板(圆角 12、浅色填充)、${texts};
2) jsd_manage_nodes op=reparent 把文本移入 Frame;
3) jsd_update_node 给 Frame 设 auto-layout(layoutMode=VERTICAL,itemSpacing=8,padding=24,counterAxisAlignItems=CENTER),主标题 fontSize 加大;
4) jsd_get_selection 复核结果结构。`;
}
