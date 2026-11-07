import type { McpServer } from '@modelcontextprotocol/server';
import type { PlatformKey } from 'text-to-design-shared';
import { z } from 'zod';
import {
  NODE_TYPE_CANDIDATES,
  optionalCompletableArg,
} from '../core/completions';
import type { ToolHandle } from '../core/registry';
import { promptIcon } from '../core/tool-icons';
import type { McpI18n } from '../i18n';
import { getPlatformState } from '../platform-state';
import { createPromptRegistrar } from './prompt-tools';
import { findRecipe, recipeIds, renderRecipeBody } from './recipe-catalog';

/**
 * 配方 prompt:注册斜杠命令,正文与元数据都来自技能目录。
 *
 * ## 2026-11:渲染函数已删除,注册表也改为扫描
 *
 * 此前每条配方有一个 `*Recipe()` 渲染函数(在调用期拼平台分支与参数),
 * 现在正文的唯一来源是 `src/skills/canvas/references/<id>.md`。
 * 本文件只剩**参数 schema**(客户端靠它弹输入框)—— 那是类型契约,不适合塞进 markdown。
 *
 * 标题、何时用、消息角色都读 markdown 的 frontmatter(见 `recipe-catalog.ts`);
 * 新增一篇 `references/foo.md` 就会自动多出一条 prompt,**除非**它也带参数 ——
 * 带参数的配方要在这里补一条 `PROMPT_SCHEMAS` 条目,否则用空 schema 注册。
 *
 * 想要在正文里指定插入位置,就在 md 里写 `{{参数名}}`;没写占位符的参数
 * 由 `renderRecipeBody` 追加到文末「本次参数」小节。
 */

/**
 * 每条配方的参数 schema。**只有带参数的配方需要在这里出现**;
 * 没列举的按「无参数」注册(空对象 schema)。
 *
 * schema 留在 TS 而不是写进 markdown:客户端要靠它生成输入框的类型与补全,
 * 那是有约束的结构化契约,markdown 承担不了。
 */
const PROMPT_SCHEMAS: Record<
  string,
  Parameters<typeof z.object>[0] | undefined
> = {
  'html-to-design': {
    html: z.string().describe('要转换的 HTML 片段'),
    name: z.string().optional().describe('生成节点的名称,默认 html-design'),
  },
  'icon-grid': {
    icons: z.string().describe('图标名列表,逗号分隔,如 house,search,settings'),
    size: z.string().optional().describe('单个图标边长 px,默认 "24"'),
    gap: z.string().optional().describe('图标间距 px,默认 "16"'),
  },
  'script-ops': {
    task: z.string().optional().describe('要完成的任务描述(可省略)'),
  },
  'design-strategy': {
    screen: z.string().optional().describe('要设计的界面名称,如「登录页」'),
  },
  'text-replace-strategy': {
    rootId: z.string().optional().describe('根节点 id;留空取当前选中'),
  },
  'variant-sync': {
    sourceId: z.string().optional().describe('源实例 id;留空取当前选中'),
    targetType: optionalCompletableArg(
      z.string().describe('目标实例的类型过滤,如 INSTANCE;留空按名称匹配'),
      () => NODE_TYPE_CANDIDATES,
    ),
  },
  'variable-binding': {
    target: z.string().optional().describe('要绑定的节点或区域描述'),
  },
  'variant-set': {
    family: z.string().optional().describe('组件族名,如 Nav'),
  },
  'component-property': {
    target: z.string().optional().describe('组件或实例 id'),
  },
  'auto-layout': {
    target: z
      .string()
      .optional()
      .describe('要上布局的容器 / 分区描述,如「标签栏」'),
  },
  'chart-by-code': {
    chart: z
      .string()
      .describe(
        '要画什么图 / 数据可视化(种类 + 数据 + 口径),如「按月的毛利率与净利率双轴折线」',
      ),
    svgPath: z
      .string()
      .optional()
      .describe('生成的 .svg 落盘路径,缺省 /tmp/chart.svg'),
  },
};

export function registerPrompts(
  server: McpServer,
  _i18n: McpI18n,
): ToolHandle[] {
  const { registerPrompt, registerTools } = createPromptRegistrar(server);

  /** 按 recipe id 注册一条 prompt:元数据读 frontmatter,正文读 md */
  const recipePrompt = (id: string) => {
    const recipe = findRecipe(id);
    if (recipe == null) throw new Error(`未知配方:${id}`);
    const shape = PROMPT_SCHEMAS[id] ?? {};
    return registerPrompt(
      id,
      {
        title: recipe.title,
        icons: promptIcon(),
        // description 用 when —— 它就是「何时该点开我」,与资源清单里的措辞一致,
        // 不再另抄一份 i18n 文案(过去两者各自演化)
        description: recipe.whenToUse,
        argsSchema: z.object(shape),
      },
      (args) => {
        const params: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
          if (v == null) continue;
          params[k] = String(v);
        }
        return {
          messages: [
            {
              role: recipe.role,
              content: {
                type: 'text' as const,
                text: renderRecipeBody(id, params),
              },
            },
          ],
        };
      },
    );
  };

  // 顺序即客户端斜杠命令里的展示顺序:先通用纪律,再具体动作
  const ORDER = [
    'design-strategy',
    'auto-layout',
    'chart-by-code',
    'html-to-design',
    'icon-grid',
    'script-ops',
    'text-replace-strategy',
    'variant-sync',
    'variable-binding',
    'variant-set',
    'component-property',
  ];

  return [
    ...recipeIds()
      .sort((a, b) => {
        const rank = (id: string) =>
          ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length;
        return rank(a) - rank(b) || a.localeCompare(b);
      })
      .map(recipePrompt),
    ...registerTools(),
  ].map((handle) => Object.assign(handle, { alwaysEnabled: true }));
}

/**
 * 当前平台,**调用期**读 daemon 的进程级缓存(`ping` 时写入,插件断开即清空)。
 *
 * 为什么不能提到装配期:`buildServer` 在插件连接之前就跑完了(0030),那时缓存必然
 * 是空的 —— 提前读等于把「不区分平台」变成「永远没有平台」。
 */
export function currentPlatform(): PlatformKey | null {
  return getPlatformState()?.platform ?? null;
}
