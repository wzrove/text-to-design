import { describe, expect, it } from 'vitest';
import { assertSkillGroupsCoverRecipes, SKILL_GROUPS } from '../skills/entries';
import { RECIPES } from '../tools/recipe-catalog';

/**
 * 技能分组的回归(方案与理由见 src/skills/entries.ts)。
 *
 * 守三条:
 * ① 每条配方被且只被一个入口覆盖 —— 漏了等于某类任务没有入口,重了等于两份正文分叉;
 * ② 入口里写到的每个 `references/<id>.md` 都能由真实配方生成 —— 失效的指针比没有指针更坏;
 * ③ 入口正文不许膨胀 —— 收合并入口的全部意义是"选中只付几 KB",写长了就退回合并正文了。
 */

describe('技能分组', () => {
  it('每条配方恰好被一个入口覆盖(不重不漏)', () => {
    expect(() => assertSkillGroupsCoverRecipes()).not.toThrow();
  });

  it('入口里提到的每个 references/<id>.md 都是真实配方', () => {
    const ids = new Set(RECIPES.map((r) => r.id));
    for (const group of SKILL_GROUPS) {
      const mentioned = [
        ...group.body.matchAll(/references\/([\w-]+)\.md/g),
      ].map((m) => m[1]);
      // 正文提到的每篇,都必须在该入口自己的 references 里(否则读不到)
      for (const id of mentioned) {
        expect(group.references).toContain(id);
        expect(ids.has(id)).toBe(true);
      }
      // 反过来:挂上的每篇也都该在正文里被指到,否则没人会读它
      for (const id of group.references) {
        expect(mentioned).toContain(id);
      }
    }
  });

  it('入口正文保持轻量(≤4KB,否则"按需加载"名存实亡)', () => {
    for (const group of SKILL_GROUPS) {
      const bytes = Buffer.byteLength(group.body, 'utf8');
      expect(bytes, `${group.name} 入口正文 ${bytes} 字节`).toBeLessThanOrEqual(
        4096,
      );
    }
  });

  it('入口名唯一且是稳定的目录名', () => {
    const names = SKILL_GROUPS.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('每个入口都写了描述(客户端靠它选技能)', () => {
    for (const group of SKILL_GROUPS) {
      expect(group.description.length).toBeGreaterThan(10);
      expect(group.description).not.toContain('\n');
    }
  });
});
