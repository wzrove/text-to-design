import { describe, expect, it } from 'vitest';
import {
  FALLBACK_LOCALE,
  normalizeLocale,
  resolveLocale,
} from '../packages/website/src/i18n/locale';
import { en } from '../packages/website/src/i18n/messages/en';
import { zh } from '../packages/website/src/i18n/messages/zh-CN';

type Leaf = { path: string; value: string };

function leaves(node: unknown, path: string[], out: Leaf[]): void {
  if (typeof node === 'string') {
    out.push({ path: path.join('.'), value: node });
    return;
  }
  if (Array.isArray(node)) {
    // 纯字符串数组按一条比：`titleChars` 这类是给逐字动画用的，
    // 中文 3 字 / 英文 7 字母本就该不等长；对象数组仍逐条比,条数必须对齐。
    if (node.every((item) => typeof item === 'string')) {
      out.push({ path: path.join('.'), value: node.join('') });
      return;
    }
    node.forEach((item, i) => {
      leaves(item, [...path, String(i)], out);
    });
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      leaves(value, [...path, key], out);
    }
  }
}

const flatten = (dict: unknown) => {
  const out: Leaf[] = [];
  leaves(dict, [], out);
  return out;
};

describe('website i18n 字典', () => {
  it('两份字典的叶子键集合完全一致', () => {
    const zhKeys = flatten(zh)
      .map((l) => l.path)
      .sort();
    const enKeys = flatten(en)
      .map((l) => l.path)
      .sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('没有空文案', () => {
    for (const [name, dict] of [
      ['zh', zh],
      ['en', en],
    ] as const) {
      const empty = flatten(dict).filter((l) => l.value.trim() === '');
      expect(empty, `${name} 有空串`).toEqual([]);
    }
  });
});

describe('locale 解析', () => {
  it('归一化浏览器语种', () => {
    expect(normalizeLocale('zh')).toBe('zh-CN');
    expect(normalizeLocale('zh-TW')).toBe('zh-CN');
    expect(normalizeLocale('zh_Hans')).toBe('zh-CN');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('EN')).toBe('en');
    expect(normalizeLocale('fr')).toBeUndefined();
    expect(normalizeLocale(undefined)).toBeUndefined();
  });

  it('优先序:显式选择 > 浏览器语言 > 兜底', () => {
    expect(resolveLocale({ stored: 'en', navigatorLanguage: 'zh-CN' })).toBe(
      'en',
    );
    expect(resolveLocale({ stored: 'zh-CN', navigatorLanguage: 'en-US' })).toBe(
      'zh-CN',
    );
    expect(
      resolveLocale({ stored: 'garbage', navigatorLanguage: 'en-GB' }),
    ).toBe('en');
    expect(resolveLocale({ stored: null, navigatorLanguage: 'fr-FR' })).toBe(
      FALLBACK_LOCALE,
    );
  });
});
