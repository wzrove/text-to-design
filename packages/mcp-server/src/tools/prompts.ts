import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ToolHandle } from '../core/registry';

/** 高频配方 prompt:可复用的操作引导词(只收工具 description 覆盖不到的流程级内容) */
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
            text: `请把下面的 HTML 转成设计稿。默认走 jsd_html_to_design(SVG 保真,忽略复杂样式);需要可编辑图层时才改用 jsd_create_nodes 手工映射(容器→FRAME、文本→TEXT、图形→VECTOR)后 reparent 归组。\n\nHTML:\n\`\`\`\n${String(html)}\n\`\`\`${name == null ? '' : `\n节点名:${String(name)}`}`,
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
            text: `请插入图标网格:1) jsd_create_nodes 建一个 FRAME 容器;2) 每个图标各调一次 jsd_create_icon(size=${Number(size) || 24});3) jsd_manage_nodes op=reparent 把全部图标移入容器;4) jsd_update_node 给容器设 auto-layout(layoutMode=HORIZONTAL,itemSpacing=${Number(gap) || 16},counterAxisAlignItems=CENTER)。\n图标列表: ${String(icons)}`,
          },
        },
      ],
    }),
  );

  const scriptOps = server.registerPrompt(
    'script-ops',
    {
      title: '脚本化批量调用',
      description:
        '把多步画布操作合并为一次 ops 数组或一段宿主脚本执行,减少工具往返与上下文占用',
      argsSchema: z.object({
        task: z
          .string()
          .optional()
          .describe('要完成的任务描述(可选,留空只返回脚本化调用纪律)'),
      }),
    },
    ({ task }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: scriptRecipe(task == null ? undefined : String(task)),
          },
        },
      ],
    }),
  );

  // 配方是静态引导词,不依赖插件连接 → 恒可用
  return [designCard, htmlToDesign, iconGrid, scriptOps].map((handle) =>
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
  return `请在画布中心创建一张 ${width}x${height} 的卡片:
1) jsd_create_nodes 一次平铺创建 FRAME 底板(圆角 12、浅色填充)与${texts};
2) jsd_manage_nodes op=reparent 把文本移入 Frame;
3) jsd_update_node 给 Frame 设 auto-layout(VERTICAL,itemSpacing=8,padding=24,counterAxisAlignItems=CENTER),主标题 fontSize 加大。`;
}

/** 脚本化调用配方:压缩工具往返次数与上下文占用 */
function scriptRecipe(task?: string): string {
  const head =
    task == null
      ? '请按以下「脚本化」纪律调用 text-to-design 工具:'
      : `请用「脚本化」方式完成下面的任务:\n${task}\n\n执行要求:`;
  return `${head}
1) 多步流程一次成型:优先 jsd_batch 编排(create→reparent→update、find→批量修改、图标×N 等);宿主有代码执行工具时也可写一段脚本连续 await 多个 tools.jsd_*。
2) 中间值只在管道内流动:上游结果用 {{步骤id_字段路径}} 注入下游参数(脚本内用变量传递);每步只提取后续需要的字段,不回传完整序列化结果。
3) 收敛:最后只做一次 jsd_get_selection(depth=1) 总复核,不要每步都复核。`;
}
