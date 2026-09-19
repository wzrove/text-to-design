import {
  PLUGIN_TIMEOUT_MS,
  UI_FORWARD_TIMEOUT_MS,
} from 'text-to-design-shared';
import { describe, expect, it } from 'vitest';
import { BATCH_TIMEOUT_MS } from '../config';

/**
 * 三层超时阶梯不变式。
 *
 * 注释保证不了顺序,测试可以:`UI 侧超时必须短于 server 侧`,否则请求会先在
 * server 侧超时并被清理,插件 UI 随后到达的超时响应变成孤儿帧 —— 表现为偶发的
 * 「导出图是空的 / 工具无响应」。这条阶梯目前在 pending.ts 里只是一句注释。
 *
 * 三个常量已集中在 shared/connection 与 config.ts,缺的从来不是位置而是断言。
 */
describe('超时阶梯', () => {
  it('UI 转发 < 插件 pedding 超时 < 整批编排', () => {
    expect(UI_FORWARD_TIMEOUT_MS).toBeLessThan(PLUGIN_TIMEOUT_MS);
    expect(PLUGIN_TIMEOUT_MS).toBeLessThan(BATCH_TIMEOUT_MS);
  });

  it('每一层都是正毫秒数,不是 undefined 兜底出来的 NaN', () => {
    for (const [name, v] of [
      ['UI_FORWARD_TIMEOUT_MS', UI_FORWARD_TIMEOUT_MS],
      ['PLUGIN_TIMEOUT_MS', PLUGIN_TIMEOUT_MS],
      ['BATCH_TIMEOUT_MS', BATCH_TIMEOUT_MS],
    ] as const) {
      expect(Number.isFinite(v), `${name} 必须是有限数`).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});
