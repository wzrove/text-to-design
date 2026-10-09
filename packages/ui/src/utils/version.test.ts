import { describe, expect, it } from 'vitest';
import { APP_VERSION, isOutdated } from './version';

describe('isOutdated', () => {
  it('按数字段比较:0.9.0 落后于 0.10.0(字符串比较会得出相反结论)', () => {
    expect(isOutdated('0.9.0', '0.10.0')).toBe(true);
    expect(isOutdated('0.10.0', '0.9.0')).toBe(false);
  });

  it('相等与领先都不算落后', () => {
    expect(isOutdated('0.8.0', '0.8.0')).toBe(false);
    expect(isOutdated('1.0.1', '1.0.0')).toBe(false);
  });

  it('段数不等时按 0 补齐:1.2 与 1.2.0 同档,1.2.1 才算新', () => {
    expect(isOutdated('1.2', '1.2.0')).toBe(false);
    expect(isOutdated('1.2', '1.2.1')).toBe(true);
  });

  it('latest 为 null(没查到)一律不提示', () => {
    expect(isOutdated('0.1.0', null)).toBe(false);
  });

  it('任一侧不可解析时闭嘴:不拿错的结论去提示升级', () => {
    expect(isOutdated('', '1.0.0')).toBe(false);
    expect(isOutdated('0.1.0', '')).toBe(false);
    expect(isOutdated('abc', '1.0.0')).toBe(false);
  });

  it('带预发布后缀时只比数字前缀', () => {
    expect(isOutdated('1.0.0', '1.0.1-beta.1')).toBe(true);
    expect(isOutdated('1.0.1', '1.0.1-beta.1')).toBe(false);
  });
});

describe('APP_VERSION', () => {
  it('非构建环境(单测直引)拿到占位串而不是抛错', () => {
    expect(typeof APP_VERSION).toBe('string');
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });
});
