import { describe, expect, it } from 'vitest';
import {
  CONTAINER_SELF_VISIBLE_PROPS,
  INSTANCE_STYLE_RISK_PROPS,
  instanceStyleRiskNotice,
  SHARED_STYLE_PROPS,
} from '../core/props/risk';

/**
 * 「样式类字段」这一件事曾经有三份事实:core 里两个各写一遍的 Set(27 项 / 20 项,
 * 其中 16 项重复),外加 MCP 工具描述里一段手写文案第三次描述同一集合。
 * 现在集合与文案都从 props/risk.ts 生成,这里守两件事:
 *   ① 两份集合的重叠必须是**显式共享子集**,不是两处巧合重复;
 *   ② 工具描述文案由集合生成 —— 集合里加字段,文案跟着变。
 */
describe('样式风险集合', () => {
  it('重叠部分是显式登记的共享子集', () => {
    const overlap = [...CONTAINER_SELF_VISIBLE_PROPS].filter((k) =>
      INSTANCE_STYLE_RISK_PROPS.has(k),
    );
    expect(overlap.length).toBeGreaterThan(0);
    expect([...SHARED_STYLE_PROPS].sort()).toEqual(overlap.sort());
  });

  it('共享子集里全是样式字段,不含几何/结构/命名类', () => {
    // 几何/可见性/命名在实例上与容器自身上都属于正常改动,报风险会刷屏
    for (const key of [
      'x',
      'y',
      'width',
      'height',
      'name',
      'visible',
      'locked',
    ]) {
      expect(SHARED_STYLE_PROPS.has(key), `${key} 不该算样式风险`).toBe(false);
    }
  });

  it('clipsContent / layoutGrids 只属于容器自身可见,不算实例风险', () => {
    expect(CONTAINER_SELF_VISIBLE_PROPS.has('clipsContent')).toBe(true);
    expect(CONTAINER_SELF_VISIBLE_PROPS.has('layoutGrids')).toBe(true);
    expect(INSTANCE_STYLE_RISK_PROPS.has('clipsContent')).toBe(false);
    expect(INSTANCE_STYLE_RISK_PROPS.has('layoutGrids')).toBe(false);
  });

  it('文本字段只属于实例风险(容器自身没有文本)', () => {
    for (const key of ['fontName', 'fontSize', 'textCase']) {
      expect(INSTANCE_STYLE_RISK_PROPS.has(key)).toBe(true);
      expect(CONTAINER_SELF_VISIBLE_PROPS.has(key)).toBe(false);
    }
  });

  it('MCP 描述文案由集合生成:点名的字段必须真在集合里', () => {
    const notice = instanceStyleRiskNotice();
    const mentioned = [...INSTANCE_STYLE_RISK_PROPS].filter((k) =>
      notice.includes(k),
    );
    expect(mentioned.length).toBeGreaterThan(0);
    for (const key of mentioned) {
      expect(INSTANCE_STYLE_RISK_PROPS.has(key)).toBe(true);
    }
  });
});
