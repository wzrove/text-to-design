import { describe, expect, it } from 'vitest';
import { parseGuidanceAlias } from '../skills/guidance-alias';

describe('技能路径别名', () => {
  it('技能入口的几种写法都归一到 skill', () => {
    for (const name of [
      'canvas/SKILL',
      'canvas/SKILL.md',
      'skill://canvas/SKILL.md',
      '/canvas/SKILL/',
      'SKILL.md',
    ])
      expect(parseGuidanceAlias(name), name).toEqual({ kind: 'skill' });
  });

  it('附录路径归一到配方 id(带不带前缀/.md 都行)', () => {
    for (const name of [
      'canvas/references/auto-layout.md',
      'canvas/references/auto-layout',
      'references/auto-layout.md',
      'skill://canvas/references/auto-layout.md',
    ])
      expect(parseGuidanceAlias(name), name).toEqual({
        kind: 'recipe',
        id: 'auto-layout',
      });
  });

  it('不是路径形态的原样放过(由注册表判未知)', () => {
    for (const name of [
      'design-strategy',
      'canvas/nope',
      'canvas/references/../secret',
      '',
    ])
      expect(parseGuidanceAlias(name), name).toBeNull();
  });
});
