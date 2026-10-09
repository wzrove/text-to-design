import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import type { ToolHandle } from '../core/registry';
import {
  findRecipe,
  RECIPE_INDEX_URI,
  RECIPE_URI_TEMPLATE,
  RECIPES,
  renderRecipeIndex,
} from './recipe-catalog';

function markdownContents(
  uri: string | URL,
  text: string,
): { contents: { uri: string; mimeType: string; text: string }[] } {
  return {
    contents: [
      {
        uri: typeof uri === 'string' ? uri : uri.href,
        mimeType: 'text/markdown',
        text,
      },
    ],
  };
}

/**
 * 配方资源(纯本地,不依赖插件连接 —— 与画布状态资源不同,插件离线也应可读)。
 *
 * 与 prompt 的分工:prompt 是**用户**触发的斜杠命令,resource 是**模型**能自己摘的
 * 上下文。两者正文同源(见 `./recipe-catalog.ts` 的说明)。
 */
export function registerRecipeResources(server: McpServer): ToolHandle[] {
  const recipeIds = RECIPES.map((r) => r.id).join(' / ');

  const index = server.registerResource(
    'recipes',
    RECIPE_INDEX_URI,
    {
      title: 'resources.title7',
      // 这段会出现在 ListMcpResources 里 —— 它是路由表本身,不是目录摘要:
      // 宿主不注入 mcp.instructions 时,模型判断「该不该读配方」只能靠这里。
      description:
        '多步套路配方索引(**操作手册,不是画布状态**):画图表 / 数据可视化、从零设计整页、HTML 转设计稿、批量改文案、组件与变体、变量绑定。' +
        '动手做多步任务前先按任务读对应正文;只想概览通用纪律就先读 design-strategy。' +
        `可用条目:${recipeIds}`,
      mimeType: 'text/markdown',
    },
    async () => markdownContents(RECIPE_INDEX_URI, renderRecipeIndex()),
  );

  const body = server.registerResource(
    'recipe',
    new ResourceTemplate(RECIPE_URI_TEMPLATE, { list: undefined }),
    {
      title: 'resources.title8',
      description: `按 id 读取配方正文(markdown),如 ${RECIPE_URI_TEMPLATE.replace('{id}', 'chart-by-code')}。可用 id:${recipeIds};索引与「何时用」见 ${RECIPE_INDEX_URI}`,
      mimeType: 'text/markdown',
    },
    async (uri, vars) => {
      const raw = vars.id;
      const id = Array.isArray(raw) ? raw[0] : raw;
      const entry = id == null ? undefined : findRecipe(String(id));
      if (!entry) {
        // 报错里带上可用清单:模型打错 id 时一次就能自我纠正,不用再读一遍索引
        throw new Error(`未知配方:${uri.href}(可用 id:${recipeIds})`);
      }
      return markdownContents(uri, entry.render());
    },
  );

  return [index, body];
}
