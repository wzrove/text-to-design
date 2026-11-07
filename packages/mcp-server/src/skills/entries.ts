import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 配方与 skill 共用发布目录，源码和单文件 bundle 的相对路径不同。
const HERE = dirname(fileURLToPath(import.meta.url));
const CANVAS_DIR = join(
  HERE,
  ...(basename(HERE) === 'dist' ? ['skills', 'canvas'] : ['canvas']),
);

/** 唯一入口的目录与文件名(构建期复制与测试都读这里) */
export const SKILL_DIR = CANVAS_DIR;
export const SKILL_ENTRY = join(CANVAS_DIR, 'SKILL.md');
export const SKILL_NAME = 'canvas';

export function readSkillEntry(): string {
  return readFileSync(SKILL_ENTRY, 'utf8');
}

export function listSkillReferences(): string[] {
  return readdirSync(join(CANVAS_DIR, 'references'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

/** 正文里提到过哪些 references/<id>.md */
export function referencedInBody(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(/references\/([\w-]+)\.md/g)) {
    ids.add(m[1]);
  }
  return [...ids].sort();
}

/** frontmatter 里的 name 字段(取不到返回 null) */
export function frontmatterName(body: string): string | null {
  if (!body.startsWith('---')) return null;
  const end = body.indexOf('\n---', 3);
  if (end < 0) return null;
  const fm = body.slice(3, end);
  const m = /^name:\s*(.+)$/m.exec(fm);
  return m == null ? null : m[1].trim();
}

/**
 * 校验技能目录自洽。任何一条不成立都抛 —— 坏目录比没有目录更坏:
 * 模型会读到「指向不存在附录」的指令,然后按不存在的路径去找。
 */
export function assertSkillGroupsCoverRecipes(): void {
  const body = readSkillEntry();

  const name = frontmatterName(body);
  if (name !== SKILL_NAME) {
    throw new Error(
      `SKILL.md 的 frontmatter name 应为 "${SKILL_NAME}",实际是 "${name}"`,
    );
  }

  const onDisk = listSkillReferences();
  const referenced = referencedInBody(body);

  const missing = referenced.filter((id) => !onDisk.includes(id));
  if (missing.length > 0) {
    throw new Error(
      `SKILL.md 指向了不存在的附录:${missing.join(', ')}(实际存在:${onDisk.join(', ')})`,
    );
  }

  const orphan = onDisk.filter((id) => !referenced.includes(id));
  if (orphan.length > 0) {
    throw new Error(
      `有附录没有任何地方指到,没人会读它:${orphan.join(', ')}(删掉,或在 SKILL.md 的任务表里加一行)`,
    );
  }
}
