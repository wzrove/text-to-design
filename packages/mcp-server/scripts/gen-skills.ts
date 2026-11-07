import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSkillGroupsCoverRecipes,
  SKILL_DIR,
} from '../src/skills/entries';
import { readRecipeBody, recipeIds } from '../src/tools/recipe-catalog';

// 发布前同时校验 skill 引用与配方元数据，避免生成无法启动的包。
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist', 'skills');

function main(): void {
  assertSkillGroupsCoverRecipes();
  for (const id of recipeIds()) {
    if (readRecipeBody(id).trim() === '')
      throw new Error(`Empty recipe: ${id}`);
  }

  // 全量重建:技能改名后不许留下孤儿目录
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(SKILL_DIR, join(OUT, 'canvas'), { recursive: true });

  console.log(`skills: 已复制 ${SKILL_DIR} → ${OUT}`);
}

main();
