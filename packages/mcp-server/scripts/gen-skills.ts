import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSkillGroupsCoverRecipes,
  SKILL_GROUPS,
} from '../src/skills/entries';
import { RECIPES } from '../src/tools/recipe-catalog';

/**
 * 把配方渲染成 Skills over MCP(SEP-2640)的目录结构:
 *
 * ```
 * dist/skills/
 *   design/SKILL.md + references/{design-strategy,auto-layout,html-to-design,icon-grid}.md
 *   charts/SKILL.md + references/chart-by-code.md
 *   components/SKILL.md + references/{component-property,variant-set,variant-sync,variable-binding}.md
 *   bulk-ops/SKILL.md + references/{script-ops,text-replace-strategy}.md
 * ```
 *
 * **入口少量手写、正文一条不复制**:`src/skills/entries.ts` 写入口(何时用 + 分流 +
 * 硬纪律),`references/<id>.md` 直接取该配方 `render()` 的正文 —— 与
 * `jsd://recipes/<id>` 是同一次渲染,不存在"两处正文"。
 *
 * 分组映射的完整性由 `assertSkillGroupsCoverRecipes()` 卡在写盘之前:漏覆盖、重复覆盖、
 * 引用不存在的配方都会让 build 直接失败,而不是产出一个坏目录等人发现。
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist', 'skills');

/** frontmatter 的 description 用 JSON.stringify:中文、反引号、`**` 一次转义到位 */
function frontmatter(name: string, description: string): string {
  const oneLine = description.replace(/\s+/g, ' ').trim();
  return [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(oneLine)}`,
    '---',
    '',
  ].join('\n');
}

function main(): void {
  assertSkillGroupsCoverRecipes();

  // 全量重建:配方改名后不许留下孤儿技能
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const byId = new Map(RECIPES.map((r) => [r.id, r]));
  let refs = 0;

  for (const group of SKILL_GROUPS) {
    const dir = join(OUT, group.name);
    mkdirSync(join(dir, 'references'), { recursive: true });
    writeFileSync(
      join(dir, 'SKILL.md'),
      frontmatter(group.name, group.description) + group.body,
      'utf8',
    );
    for (const id of group.references) {
      const recipe = byId.get(id);
      // 已被 assertSkillGroupsCoverRecipes 保证存在;这里的判空只为类型收窄
      if (recipe == null) throw new Error(`配方不存在:${id}`);
      const body = recipe.render();
      if (body.trim() === '')
        throw new Error(`配方 ${id} 渲染为空,拒绝写出空附录`);
      writeFileSync(
        join(dir, 'references', `${id}.md`),
        `<!-- 由 src/tools/prompts.ts 的 ${id} 配方生成,勿手改;改正文请改 render 函数 -->\n\n${body}`,
        'utf8',
      );
      refs += 1;
    }
  }

  console.log(
    `skills: ${SKILL_GROUPS.length} 个入口 / ${refs} 篇附录 → ${OUT}`,
  );
}

main();
