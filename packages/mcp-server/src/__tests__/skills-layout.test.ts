import { describe, expect, it } from 'vitest';
import {
  assertSkillGroupsCoverRecipes,
  frontmatterName,
  listSkillReferences,
  readSkillEntry,
  referencedInBody,
  SKILL_NAME,
} from '../skills/entries';

/**
 * 画布技能目录的回归(方案与理由见 src/skills/entries.ts)。
 *
 * 技能现在是**手写的静态目录**(src/skills/canvas/),不再由脚本生成正文 ——
 * 所以测试直接校验磁盘上的文件自洽性,而不是校验一份 TS 里的字符串常量。
 *
 * 守五条:
 * ① 目录自洽:frontmatter name 对、指向的附录都在、没有孤儿附录;
 * ② 只有一个入口 —— 多入口会把「该选哪个」的成本推给模型(2026-11:4 个入口时,
 *    「照这页配色画张图」同时像 design/charts/bulk-ops,结果一条都没读);
 * ③ 正文里提到的每个 references/<id>.md 都真在磁盘上 —— 失效的指针比没有指针更坏;
 * ④ 入口正文保持轻量 —— 渐进披露的意义是「选中只付几 KB」;
 * ⑤ frontmatter 的 description 非空且单行 —— 客户端靠它决定是否加载本技能。
 */
describe('画布技能目录', () => {
  it('目录自洽(不重不漏、frontmatter 对得上)', () => {
    expect(() => assertSkillGroupsCoverRecipes()).not.toThrow();
  });

  it('只有一个入口 —— 多入口会把「该选哪个」的成本推给模型', () => {
    expect(SKILL_NAME).toBe('canvas');
    expect(frontmatterName(readSkillEntry())).toBe('canvas');
  });

  it('正文里提到的每个 references/<id>.md 都真在磁盘上', () => {
    const body = readSkillEntry();
    const onDisk = listSkillReferences();
    const mentioned = referencedInBody(body);
    expect(mentioned.length).toBeGreaterThan(0);
    for (const id of mentioned) {
      expect(onDisk, `${id} 被指到但文件不存在`).toContain(id);
    }
    // 反过来:磁盘上的每篇都该在正文里被指到
    for (const id of onDisk) {
      expect(mentioned, `${id}.md 没有任何地方指到`).toContain(id);
    }
  });

  it('入口正文保持轻量(≤8KB,否则「按需加载」名存实亡)', () => {
    const bytes = Buffer.byteLength(readSkillEntry(), 'utf8');
    expect(bytes, `SKILL.md 正文 ${bytes} 字节`).toBeLessThanOrEqual(8192);
  });

  it('frontmatter 的 description 非空且单行(客户端靠它选技能)', () => {
    const body = readSkillEntry();
    const end = body.indexOf('\n---', 3);
    const fm = body.slice(3, end);
    const m = /^description:\s*(.+)$/m.exec(fm);
    expect(m, 'frontmatter 缺 description').toBeTruthy();
    const desc = m?.[1] ?? '';
    expect(desc.replace(/^["']|["']$/g, '').length).toBeGreaterThan(10);
  });
});
