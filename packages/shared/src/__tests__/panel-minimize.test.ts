import { describe, expect, it } from 'vitest';
import {
  isUiMinimizeMessage,
  PANEL_HEIGHT_MIN,
  PANEL_MINIMIZED_SIZE,
} from '../panel';

/**
 * 最小化旁路消息的不变量(dec 28008c70)。
 *
 * 为什么守:`minimized` 是**模式**不是尺寸。脏值被当成真时窗口缩到 50px,而 UI 侧
 * 仍渲染整棵面板树(两侧对模式的判断分叉)—— 症状是面板变成一条、还点不到恢复;
 * 反向漏判则是双击恢复后窗口不回来。故只认布尔,别的写法一律不认。
 */
describe('ui_minimize 守卫', () => {
  it('只认布尔 minimized', () => {
    expect(isUiMinimizeMessage({ type: 'ui_minimize', minimized: true })).toBe(
      true,
    );
    expect(isUiMinimizeMessage({ type: 'ui_minimize', minimized: false })).toBe(
      true,
    );
    expect(
      isUiMinimizeMessage({ type: 'ui_minimize', minimized: 'true' }),
    ).toBe(false);
    expect(isUiMinimizeMessage({ type: 'ui_minimize', minimized: 1 })).toBe(
      false,
    );
    expect(isUiMinimizeMessage({ type: 'ui_minimize' })).toBe(false);
  });

  it('不误吞同族的其它旁路消息与脏值', () => {
    expect(isUiMinimizeMessage({ type: 'ui_resize', height: 300 })).toBe(false);
    expect(isUiMinimizeMessage({ type: 'locale_set', choice: 'en' })).toBe(
      false,
    );
    expect(isUiMinimizeMessage(null)).toBe(false);
    expect(isUiMinimizeMessage(undefined)).toBe(false);
    expect(isUiMinimizeMessage('ui_minimize')).toBe(false);
  });

  it('最小化尺寸是内容区口径,且低于内容高度下限', () => {
    // 低于 PANEL_HEIGHT_MIN 正是它不能走 clampPanelHeight 的原因:那条下限会把
    // 50 抬成 300 的细条(见 plugin.ts 里 ui_resize 的早退)
    expect(PANEL_MINIMIZED_SIZE).toBe(50);
    expect(PANEL_MINIMIZED_SIZE).toBeLessThan(PANEL_HEIGHT_MIN);
  });
});
