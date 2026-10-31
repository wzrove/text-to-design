import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '../src/tools/recipe-catalog';

/**
 * 把 11 条配方渲染成 Skills over MCP(SEP-2640)要求的 `dist/skills/<id>/SKILL.md`。
 *
 * ## 为什么是构建期生成,而不是运行期现写
 *
 * 配方正文的单一真源在 `tools/prompts.ts` 的 render 函数(resource 路由与 prompts
 * 都调同一批函数)。运行期从 render 再写一遍文件会引入「磁盘上一份、内存里一份」
 * 的分裂;构建期生成则只多一个产物目录,正文仍然只有一处。
 *
 * ## 为什么 frontmatter 的 description 用 JSON.stringify
 *
 * `whenToUse` 里有中文顿号、反引号与 `**`;YAML 的双引号标量接受 JSON 转义,
 * 用 JSON.stringify 一次搞定引号与转义,不必自己拼 `"` 或转义 `\`。
 *
 * 用法:build 末尾自动执行;`tsx scripts/gen-skills.ts` 可单独重跑。
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist', 'skills');

function main(): void {
  // 全量重建:删掉上一次的产物,避免配方改名后残留孤儿技能
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  let written = 0;
  for (const recipe of RECIPES) {
    const body = recipe.render();
    if (body.trim() === '') {
      throw new Error(`配方 ${recipe.id} 渲染为空,拒绝写出空技能`);
    }
    const description = recipe.whenToUse.replace(/\s+/g, ' ').trim();
    const frontmatter = [
      '---',
      `name: ${recipe.id}`,
      `description: ${JSON.stringify(description)}`,
      '---',
      '',
    ].join('\n');
    const dir = join(OUT, recipe.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), frontmatter + body, 'utf8');
    written += 1;
  }
  console.log(`skills: ${written} 条 → ${OUT}`);
}

main();
