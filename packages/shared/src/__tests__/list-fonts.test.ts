import { describe, expect, it } from 'vitest';
import { listFonts } from '../core/export';
import type { DesignHost } from '../core/host';
import { FONT_PAGE_DEFAULT, FONT_PAGE_MAX } from '../dicts/font';
import { makeHost } from './fixtures';

/**
 * 字体清单分页/过滤的不变式(0017 真机联调后定下的口径)。
 *
 * 背景:MasterGo 的字体库实测约 1900 族、整表回包 322 KB —— 一次只读调用就能吃掉
 * 整个上下文预算。所以 `listFonts` 默认只回一页,并且**必须**如实给出 `total` 与
 * `truncated`:只给一页却不说还有多少,调用方会以为「字体就这些」。
 */
function hostWith(families: [string, string[]][]): DesignHost {
  const fonts: { fontName: { family: string; style: string } }[] = [];
  for (const [family, styles] of families) {
    for (const style of styles) fonts.push({ fontName: { family, style } });
  }
  return {
    ...makeHost(),
    listAvailableFontsAsync: async () => fonts,
  } as unknown as DesignHost;
}

/** 60 个族的字母序集合(A0…A59),用于验默认页与翻页 */
function manyFamilies(count: number): [string, string[]][] {
  return Array.from({ length: count }, (_, i) => [
    `A${String(i).padStart(2, '0')}`,
    ['Regular'],
  ]);
}

describe('listFonts 分页与过滤', () => {
  it('默认只回第一页,并给出 total / truncated', async () => {
    const result = await listFonts(hostWith(manyFamilies(60)));
    expect(result.count).toBe(FONT_PAGE_DEFAULT);
    expect(result.families).toHaveLength(FONT_PAGE_DEFAULT);
    expect(result.total).toBe(60);
    expect(result.offset).toBe(0);
    expect(result.truncated).toBe(true);
    // 第一页必须是排序后的前 N 个(而不是引擎返回的偶然顺序)
    expect(result.families[0]).toBe('A00');
    expect(result.families.at(-1)).toBe(
      `A${String(FONT_PAGE_DEFAULT - 1).padStart(2, '0')}`,
    );
  });

  it('offset 翻页:最后一页的 truncated 为 false', async () => {
    const host = hostWith(manyFamilies(60));
    const page2 = await listFonts(host, { offset: 55 });
    expect(page2.count).toBe(5);
    expect(page2.families[0]).toBe('A55');
    expect(page2.total).toBe(60);
    expect(page2.truncated).toBe(false);
  });

  it('family 过滤是不区分大小写的子串匹配,total 反映过滤后的数量', async () => {
    const host = hostWith([
      ['SourceHanSansCN', ['SourceHanSansCN-Bold', 'SourceHanSansCN-Regular']],
      ['Inter', ['Inter-Bold', 'Inter-Regular']],
      ['思源黑体', ['思源黑体-Bold']],
    ]);
    const byLatin = await listFonts(host, { family: 'inter' });
    expect(byLatin.families).toEqual(['Inter']);
    expect(byLatin.total).toBe(1);
    expect(byLatin.truncated).toBe(false);
    // styles 去重且排序:写 fontName 要的是全名,顺序稳定才好比对
    expect(byLatin.fonts?.[0].styles).toEqual(['Inter-Bold', 'Inter-Regular']);

    const byHan = await listFonts(host, { family: '思源' });
    // 中文子串只命中中文字面名:family 是拉丁名时不会被「思源」匹配到
    // (MasterGo 的家族名带 `_family` 后缀,那是平台列表里的原始名,见 platform-limits)
    expect(byHan.families).toEqual(['思源黑体']);
  });

  it('limit 超过上限按上限截断(不报错),且不会漏掉 total', async () => {
    const result = await listFonts(hostWith(manyFamilies(600)), {
      limit: 100000,
    });
    expect(result.count).toBe(FONT_PAGE_MAX);
    expect(result.total).toBe(600);
    expect(result.truncated).toBe(true);
  });

  it('同一族多个 style 只算一个 family', async () => {
    const host = hostWith([
      ['Inter', ['Inter-Bold']],
      ['Inter', ['Inter-Regular', 'Inter-Bold']],
    ]);
    const result = await listFonts(host);
    expect(result.total).toBe(1);
    expect(result.count).toBe(1);
    expect(result.fonts?.[0].styles).toEqual(['Inter-Bold', 'Inter-Regular']);
  });
});
