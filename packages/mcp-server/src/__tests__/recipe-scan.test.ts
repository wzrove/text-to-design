import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SKILL_DIR } from '../skills/entries';
import { parseFrontmatter, RECIPES } from '../tools/recipe-catalog';

/**
 * 配方目录**扫描**的回归(方案见 src/tools/recipe-catalog.ts)。
 *
 * 2026-11 之前 `RECIPES` 是手写数组,与 `references/` 下的文件是两份清单 ——
 * 加文件忘记注册、或注册了没有文件,都只在运行时才暴露。现在文件名即 id、
 * 元数据在 frontmatter 里,这份测试守的就是这条:磁盘上有几篇,索引里就该有几条。
 */

describe('配方目录由磁盘扫描生成', () => {
  it('索引条数 == references 下的 .md 数(不多不少)', () => {
    const onDisk = readdirSync(join(SKILL_DIR, 'references'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
    expect(RECIPES.map((r) => r.id)).toEqual(onDisk);
  });

  it('每条都有 title 与 when(缺了在索引里等于噪音)', () => {
    for (const r of RECIPES) {
      expect(r.title.length, `${r.id} 缺 title`).toBeGreaterThan(0);
      expect(r.whenToUse.length, `${r.id} 缺 when`).toBeGreaterThan(10);
    }
  });

  it('uri 与 id 一一对应', () => {
    for (const r of RECIPES) {
      expect(r.uri).toBe(`jsd://recipes/${r.id}`);
    }
  });

  it('role 只会是 user / assistant', () => {
    for (const r of RECIPES) {
      expect(['user', 'assistant']).toContain(r.role);
    }
  });

  it('frontmatter 解析支持双引号、单引号与裸标量', () => {
    const src = [
      '---',
      'title: "含 \\"引号\\" 的标题"',
      "role: 'assistant'",
      'args: 裸标量',
      '---',
      '',
      '# 正文',
    ].join('\n');
    const { meta, body } = parseFrontmatter(src);
    expect(meta.title).toBe('含 "引号" 的标题');
    expect(meta.role).toBe('assistant');
    expect(meta.args).toBe('裸标量');
    expect(body.trim()).toBe('# 正文');
  });
});
