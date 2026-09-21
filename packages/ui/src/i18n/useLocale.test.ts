import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * UI 侧 locale store 的行为不变式(0016):切换要即时生效、持久化消息要发出去、
 * 异步到达的存储值不能盖掉用户的选择。
 *
 * 这里不测渲染(那要 DOM 与 Solid 的编译期转换),只测**状态机** —— 它是面板上
 * 「切了没反应」这类问题的唯一现场(把 `t` 缓存成模块常量就是在这里被抓住的)。
 */

const postMessage = vi.fn();

async function loadStore(): Promise<typeof import('./useLocale')> {
  vi.resetModules();
  postMessage.mockClear();
  vi.stubGlobal('parent', { postMessage });
  return await import('./useLocale');
}

describe('locale store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('默认档是跟随系统,且 t 立刻可用', async () => {
    const store = await loadStore();
    expect(store.choice()).toBe('system');
    expect(['zh-CN', 'en']).toContain(store.locale());
    expect(store.t('log.trigger')).not.toBe('');
  });

  it('显式选择立即生效,并把选择发给 code 侧持久化', async () => {
    const store = await loadStore();
    store.selectLocale('zh-CN');
    expect(store.locale()).toBe('zh-CN');
    expect(store.t('log.trigger')).toBe('日志');

    store.selectLocale('en');
    expect(store.locale()).toBe('en');
    expect(store.t('log.trigger')).toBe('Log');

    expect(postMessage.mock.calls.map((c) => c[0])).toEqual([
      { pluginMessage: { type: 'locale_set', choice: 'zh-CN' } },
      { pluginMessage: { type: 'locale_set', choice: 'en' } },
    ]);
  });

  it('选回「跟随系统」也会写回(= 让 code 侧清掉存储值)', async () => {
    const store = await loadStore();
    store.selectLocale('en');
    store.selectLocale('system');
    expect(postMessage.mock.calls.at(-1)?.[0]).toEqual({
      pluginMessage: { type: 'locale_set', choice: 'system' },
    });
  });

  it('存储值只在用户没选过时生效(异步推送不得盖掉用户的选择)', async () => {
    const store = await loadStore();
    // 用户先动手,code 侧的持久化值后到
    store.selectLocale('en');
    store.applyStoredChoice('zh-CN');
    expect(store.locale()).toBe('en');
  });

  it('用户没选过时接受存储值;脏值当没选过', async () => {
    const store = await loadStore();
    store.applyStoredChoice('zh-CN');
    expect(store.choice()).toBe('zh-CN');
    expect(store.locale()).toBe('zh-CN');

    const dirty = await loadStore();
    dirty.applyStoredChoice('klingon');
    expect(dirty.choice()).toBe('system');
  });
});
