import { describe, expect, it } from 'vitest';
import {
  assertDesignToCodeSkill,
  CODE_ENTRY_IDS,
  CODE_REFERENCE_IDS,
  readCodeEntry,
} from '../skills/code-catalog';

describe('design-to-code 技能目录', () => {
  it('frontmatter、契约 v2 与附录引用完整', () => {
    expect(() => assertDesignToCodeSkill()).not.toThrow();
    expect(CODE_ENTRY_IDS).toContain('SKILL.md');
    expect(CODE_REFERENCE_IDS).toEqual([
      'data-contract',
      'frontend',
      'backend',
      'integration',
      'script-generation',
    ]);
  });

  it('入口保持轻量', () => {
    expect(Buffer.byteLength(readCodeEntry('SKILL.md'), 'utf8')).toBeLessThanOrEqual(8192);
  });

  it('受控 entry 拒绝路径穿越和任意文件', () => {
    for (const entry of [
      '../canvas/SKILL.md',
      '..\\canvas\\SKILL.md',
      'references/frontend.md',
      '/etc/passwd',
      'does-not-exist',
    ]) {
      expect(() => readCodeEntry(entry), entry).toThrow(/未知 code 资源/);
    }
  });
});
