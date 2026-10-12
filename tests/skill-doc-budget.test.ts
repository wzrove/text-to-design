import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 文档体积与索引行宽的不变式(决策见 docs/design-decisions/89d02d1b)。
 *
 * 守的是两件进 llm 上下文的事:
 * - `.agents/skills/**`:SKILL.md 触发即全量加载;
 * - `docs/design-decisions/INDEX.md`:设计模式工作流第 1 步「先查日志」必读,每条决策都先付一次。
 *
 * 体积超了正确的动作是**把内容移进按需加载的 references**、把索引行瘦回定位信息,
 * 不是删规则、也不是调高这里的阈值。
 *
 * 行宽上限是这次新增的那条:索引膨胀从来不是条数造成的(18 行 << 40 条阈值),
 * 而是每行抄了记录正文的真机叙事与逐文件清单。只有总上限会放着行宽继续涨,故单独设线。
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SKILL_BUDGET: Record<string, number> = {
  '.agents/skills/software-design-patterns/SKILL.md': 10 * 1024,
};

const INDEX_REL = 'docs/design-decisions/INDEX.md';
const INDEX_BUDGET = 15 * 1024;
const INDEX_MAX_ROWS = 40;
const INDEX_ROW_MAX_BYTES = 400;
const DEP_LINE_MAX_BYTES = 160;

const SKILL_DIRS = ['.agents/skills/software-design-patterns'];

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const bytesOf = (text: string) => Buffer.byteLength(text, 'utf8');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** 表体行 = 行首是 `[编号](文件名.md)` 的那几行(表头与分隔行自然被排除) */
function indexRows(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => /^\|\s*\[[^\]]+\]\([^)]+\.md\)\s*\|/.test(line));
}

/** 「依赖关系」代码块内的行 */
function graphLines(text: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('```'));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && l.startsWith('```'));
  return end < 0 ? [] : lines.slice(start + 1, end);
}

describe('技能与决策索引的文档预算', () => {
  it('受管的文件都还在(防路径写错后阈值形同虚设)', () => {
    const missing = [...Object.keys(SKILL_BUDGET), INDEX_REL].filter(
      (rel) => !existsSync(join(ROOT, rel)),
    );
    expect(
      missing,
      `这些文件不存在,阈值形同虚设:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('SKILL.md 不超过上限(触发即全量进上下文)', () => {
    const over: string[] = [];
    for (const [rel, limit] of Object.entries(SKILL_BUDGET)) {
      const size = statSync(join(ROOT, rel)).size;
      if (size > limit) over.push(`${rel} ${kb(size)} > ${kb(limit)}`);
    }
    expect(
      over,
      `超限时把稳定的表格/清单移进 references,SKILL.md 只留主流程 + 指针:\n${over.join('\n')}`,
    ).toEqual([]);
  });

  it('INDEX.md 不超过上限', () => {
    const size = statSync(join(ROOT, INDEX_REL)).size;
    expect(
      size,
      `索引每次设计决策都整份读,${kb(size)} 已超 ${kb(INDEX_BUDGET)}。` +
        `动作:①行宽瘦回定位信息(叙事回记录正文);②条数到了就按年拆档。见 89d02d1b`,
    ).toBeLessThanOrEqual(INDEX_BUDGET);
  });

  it('INDEX.md 表行数不超过上限', () => {
    const rows = indexRows(read(INDEX_REL));
    expect(
      rows.length,
      `超过 ${INDEX_MAX_ROWS} 条就该按年拆档(全量行移入 INDEX-<年>.md,本表留现行有效 + 最近 10 条)`,
    ).toBeLessThanOrEqual(INDEX_MAX_ROWS);
  });

  it('INDEX.md 每一行只存定位信息(单行宽度有上限)', () => {
    const fat = indexRows(read(INDEX_REL))
      .map((l) => [bytesOf(l), l] as const)
      .filter(([size]) => size > INDEX_ROW_MAX_BYTES)
      .map(([size, l]) => `${kb(size)} | ${l.slice(0, 40)}…`);
    expect(
      fat,
      `单行 > ${INDEX_ROW_MAX_BYTES} B 就是在往索引抄记录正文。状态列只留词表值 + ≤12 字标注,` +
        `影响范围列只到层/包粒度(逐文件清单进记录的「实施方案」段):\n${fat.join('\n')}`,
    ).toEqual([]);
  });

  it('依赖关系图每一行只写关系', () => {
    const fat = graphLines(read(INDEX_REL))
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => [bytesOf(l), l] as const)
      .filter(([size]) => size > DEP_LINE_MAX_BYTES)
      .map(([size, l]) => `${kb(size)} | ${l.slice(0, 40)}…`);
    expect(
      fat,
      `图里写论证摘要是第二份真相 —— 「沿 00xx / 撞 00xx」的理由归记录的「相关记录」行:\n${fat.join('\n')}`,
    ).toEqual([]);
  });

  it('每个技能的 references 顶层文件都被 SKILL.md 引到', () => {
    const orphans: string[] = [];
    for (const dir of SKILL_DIRS) {
      const skill = read(join(dir, 'SKILL.md'));
      const refsDir = join(ROOT, dir, 'references');
      if (!existsSync(refsDir)) continue;
      for (const name of readdirSync(refsDir)) {
        const abs = join(refsDir, name);
        // 子目录里的模式文件由 pattern-index.md 代管,只查顶层
        if (statSync(abs).isDirectory() || !name.endsWith('.md')) continue;
        if (!skill.includes(`references/${name}`))
          orphans.push(`${dir}/references/${name}`);
      }
    }
    expect(
      orphans,
      `这些文件没写进 SKILL.md 的加载路径 —— 等于写了没人读,或该删:\n${orphans.join('\n')}`,
    ).toEqual([]);
  });
});
