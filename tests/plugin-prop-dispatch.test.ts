import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROP_METHOD_FIELDS } from '../packages/shared/src/schemas';

/**
 * 插件分发不许再手抄属性方法名单。
 *
 * `ui/src/code/plugin.ts` 的 msg switch 曾把 11 个 prop-method 逐个写成 `case`,
 * 这是同一份名单的第 4 份手抄。加一个新的属性方法要记得改四处,忘改 plugin.ts 的
 * 症状是:工具注册成功、参数校验通过、调下去被插件回一句「未知方法」。
 *
 * 已经有一条更省事的路子存在 —— 方法名判定收敛到 `PROP_METHOD_FIELDS` 一处
 * (见 `ui/src/code/plugin.ts` 的 `isPropMethod`)。这里直接读源码文本做断言,
 * 是因为 plugin.ts 跑在设计宿主沙箱里,没法作为模块引入;判定用到的 API 还要受
 * `tests/engine-api-compat.test.ts` 约束(沙箱运行时缺 ES2020+ 的 API)。
 */
const PLUGIN_TS = new URL('../packages/ui/src/code/plugin.ts', import.meta.url)
  .pathname;

describe('plugin.ts 属性方法分发', () => {
  const source = readFileSync(PLUGIN_TS, 'utf8');

  it('不为任何 PropMethod 手写 case 分支', () => {
    const handWritten = Object.keys(PROP_METHOD_FIELDS).filter((method) =>
      new RegExp(`case\\s+'${method}'\\s*:`).test(source),
    );
    expect(
      handWritten,
      `以下方法仍在 plugin.ts 里逐个枚举:${handWritten.join(', ')};` +
        `改用<｜hy_place▁holder▁no▁813｜> PROP_METHOD_FIELDS 判定(表驱动),加方法时就不用改这里`,
    ).toEqual([]);
  });

  it('走表驱动判定,而不是把名单复制成一份新常量', () => {
    expect(source).toContain('PROP_METHOD_FIELDS');
  });
});
