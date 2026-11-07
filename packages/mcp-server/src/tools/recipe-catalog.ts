import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_DIR } from '../skills/entries';

/**
 * MCP 的 prompt / resource 索引:**由技能目录扫描生成**,不再手写。
 *
 * ## 2026-11:配方目录改为扫描
 *
 * 此前 `RECIPES` 是一个手写的 11 元素数组,每条把 `whenToUse` / `argsHint` /
 * `titleKey` 抄在 TS 里。真正决定「有哪些配方」的是 `src/skills/canvas/references/`
 * 下有哪些文件 —— 两处都得改,漏一处就是「有文件没注册」或「注册了没有文件」。
 *
 * 现在**文件名即 id**,元数据写在 markdown 的 frontmatter 里:
 *
 * ```yaml
 * ---
 * title: "自动布局"          # prompt 的展示标题
 * when: "**屏内分区排布一律先读这一条**……"   # 出现在 listResources 的 description
 * args: "参数 target(……)"   # 参数提示,同样进 description
 * role: assistant            # prompt 消息角色(user / assistant)
 * ---
 * ```
 *
 * 新增一篇 `references/foo.md` 就自动多一条配方;删文件就自动消失。
 * 参数 schema(zod)仍在 `tools/prompts.ts` —— 那是给客户端弹输入框用的类型契约,
 * 不适合塞进 markdown。
 *
 * ## 校验
 *
 * frontmatter 缺 `when` 或 `title` 直接抛:一条没有「何时用」的配方在索引里等于噪音,
 * 模型读不出该不该点开它。`assertSkillGroupsCoverRecipes()`(skills/entries.ts)
 * 另外保证每篇都被 SKILL.md 指到。
 */

/** 配方索引资源 URI */
export const RECIPE_INDEX_URI = 'jsd://recipes';

/** 配方正文资源模板 */
export const RECIPE_URI_TEMPLATE = 'jsd://recipes/{id}';

const REFERENCES_DIR = join(SKILL_DIR, 'references');

export type RecipeEntry = {
  /** 与技能目录 `references/<id>.md` 同名 —— prompt 与 resource 的对齐键 */
  id: string;
  /** 资源 URI, `jsd://recipes/<id>` */
  uri: string;
  /** frontmatter 的 `title`(prompt 展示名) */
  title: string;
  /** frontmatter 的 `when`:什么任务触发它 */
  whenToUse: string;
  /** frontmatter 的 `args`:参数提示 */
  argsHint?: string;
  /** frontmatter 的 `role`:prompt 消息角色,缺省 user */
  role: 'user' | 'assistant';
};

type Frontmatter = Record<string, string>;

/**
 * 解析 frontmatter。只支持本目录用到的形态:顶层 `key: value`,
 * value 是 JSON 双引号字符串、单引号字符串或裸标量。不引入 YAML 库 ——
 * 为一个 5 键的头部加依赖不划算,而支持的形态由本仓自己的写入方保证。
 */
export function parseFrontmatter(source: string): {
  meta: Frontmatter;
  body: string;
} {
  if (!source.startsWith('---')) return { meta: {}, body: source };
  const end = source.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: source };
  const raw = source.slice(3, end);
  const body = source.slice(source.indexOf('\n', end + 1) + 1);
  const meta: Frontmatter = {};
  for (const line of raw.split('\n')) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (m == null) continue;
    const [, key, value] = m;
    const trimmed = value.trim();
    let parsed = trimmed;
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = trimmed.slice(1, -1);
      }
    } else if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      parsed = trimmed.slice(1, -1).replace(/''/g, "'");
    }
    meta[key] = parsed;
  }
  return { meta, body };
}

/** 读一条配方的 markdown 正文(去掉 frontmatter;插件离线也可读 —— 纯文件操作) */
export function readRecipeBody(id: string): string {
  const source = readFileSync(join(REFERENCES_DIR, `${id}.md`), 'utf8');
  return parseFrontmatter(source).body;
}

/**
 * 把参数填进正文:有 `{{key}}` 占位符就替换,没有就把参数追加到末尾一节。
 *
 * 不用「一律替换」:纪律类配方没有参数,强行插值会留下空占位符;
 * 也不用「一律追加」:HTML 片段那种长参数插在末尾会离使用处很远。
 */
export function renderRecipeBody(
  id: string,
  params: Record<string, string | undefined> = {},
): string {
  let body = readRecipeBody(id);
  const unused: [string, string][] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw == null) continue;
    const token = `{{${key}}}`;
    if (body.includes(token)) {
      body = body.split(token).join(raw);
    } else {
      unused.push([key, raw]);
    }
  }
  if (unused.length === 0) return body;
  const section = unused.map(([k, v]) => `- ${k}: ${v}`).join('\n');
  return `${body.trimEnd()}\n\n## 本次参数\n\n${section}\n`;
}

function loadRecipe(id: string): RecipeEntry {
  const source = readFileSync(join(REFERENCES_DIR, `${id}.md`), 'utf8');
  const { meta } = parseFrontmatter(source);
  const whenToUse = meta.when?.trim();
  const title = meta.title?.trim();
  if (whenToUse == null || whenToUse === '') {
    throw new Error(
      `references/${id}.md 的 frontmatter 缺 when —— 索引里没有「何时用」的条目等于噪音`,
    );
  }
  if (title == null || title === '') {
    throw new Error(`references/${id}.md 的 frontmatter 缺 title`);
  }
  const role = meta.role === 'assistant' ? 'assistant' : 'user';
  return {
    id,
    uri: `jsd://recipes/${id}`,
    title,
    whenToUse,
    ...(meta.args?.trim() ? { argsHint: meta.args.trim() } : {}),
    role,
  };
}

/** 扫描目录得到的全部配方(按 id 排序,保证索引稳定) */
export const RECIPES: RecipeEntry[] = readdirSync(REFERENCES_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort()
  .map(loadRecipe);

export function findRecipe(id: string): RecipeEntry | undefined {
  return RECIPES.find((r) => r.id === id);
}

/** 全部配方 id。补全(completion)与 `jsd://recipes/{id}` 模板变量共用这一份 */
export function recipeIds(): string[] {
  return RECIPES.map((r) => r.id);
}

/**
 * 索引正文。写成 markdown 而不是 JSON:这份是给模型读的**路由表**,
 * 不是给程序解析的数据(要结构化的话每条的 uri 已由 ListMcpResources 给出)。
 */
export function renderRecipeIndex(): string {
  const lines = RECIPES.map(
    (r) =>
      `- \`${r.uri}\` — ${r.whenToUse}${r.argsHint == null ? '' : `\n  - ${r.argsHint}`}`,
  );
  return [
    '# text-to-design 配方索引',
    '',
    '多步套路不要临场拼工具 —— 先照配方走。用 `ReadMcpResource` 读下面任意一条的正文(按需读取,不占常驻上下文)。',
    '',
    '正文的唯一来源是技能目录 `skill://canvas/references/<id>.md`;这里的每条与它是一个文件。',
    '',
    ...lines,
    '',
    '只想概览纪律、没有具体任务时,先读 `jsd://recipes/design-strategy`(与 `skill://canvas/references/design-strategy.md` 同一个文件)。',
  ].join('\n');
}
