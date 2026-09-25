import { describe, expect, it } from 'vitest';

import {
  applicabilityMissNotice,
  PROP_APPLICABILITY,
  propAppliesTo,
} from '../dicts/prop-applicability';

/**
 * 布局字段的适用范围基线(0021)。
 *
 * 此前 layout* 九个字段被 gate 成 `['FRAME']`,导致组件集(COMPONENT_SET)无法用
 * jsd_set_layout 排布 —— MG 上表现为变体集内 16 个变体重叠在 (20,20)、集合尺寸只
 * 显示单个变体。放开前逐平台核对过 typings:
 *   - Figma:`ComponentNode / ComponentSetNode extends (Base)FrameMixin`(plugin-api.d.ts:11043 / 11018)
 *   - jsDesign:`ComponentNode extends DefaultFrameMixin`、`ComponentSetNode extends BaseFrameMixin`(plugin-api.d.ts:1081 / 1074)
 *   - MasterGo:`ComponentNode / ComponentSetNode extends FrameContainerMixin extends AutoLayout`(
 *     index.d.ts:3048 / 3063,AutoLayout 含 flexMode/itemSpacing/padding* 与两个 sizingMode/align)
 * 三平台的 COMPONENT 与 COMPONENT_SET 都继承 frame 的自动布局 mixin,故一并放开。
 *
 * ⚠ 运行时若某平台写不进去,由 layoutWriter.settle 的回读点名兜住(0007),不在这里猜。
 */
const LAYOUT_KEYS = [
  'layoutMode',
  'itemSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
] as const;

describe('布局字段的节点类型适用性', () => {
  it('FRAME / COMPONENT / COMPONENT_SET 均适用', () => {
    for (const key of LAYOUT_KEYS) {
      expect(propAppliesTo(key, 'FRAME')).toBe(true);
      expect(propAppliesTo(key, 'COMPONENT')).toBe(true);
      expect(propAppliesTo(key, 'COMPONENT_SET')).toBe(true);
    }
  });

  it('仍不适用于非容器类型', () => {
    for (const key of LAYOUT_KEYS) {
      expect(propAppliesTo(key, 'TEXT')).toBe(false);
      expect(propAppliesTo(key, 'RECTANGLE')).toBe(false);
    }
  });

  it('文本字段没被误放开', () => {
    expect(propAppliesTo('characters', 'TEXT')).toBe(true);
    expect(propAppliesTo('characters', 'COMPONENT_SET')).toBe(false);
  });

  it('未收录的字段 fail-open', () => {
    expect(PROP_APPLICABILITY.someKeyNotListed).toBeUndefined();
    expect(propAppliesTo('someKeyNotListed', 'COMPONENT_SET')).toBe(true);
  });
});

/**
 * 布局网格 / 裁剪的适用范围(2026-09-24 真机踩到后补)。
 *
 * 三平台 typings 一致:两者只声明在 **frame 族 mixin** 上,`RectangleNode` 不含它
 * (`BaseFrameMixin` / `FrameContainerMixin`)—— 故是领域事实,不是平台收窄。
 * 此前这两条没进表,`paintWriter`(layoutGrids)/ `passthroughWriter`(clipsContent)
 * 直接写:给矩形写 layoutGrids 回包「已更新 1 个节点」,回读却没有该字段。
 */
describe('布局网格 / 裁剪的适用范围', () => {
  const FRAME_FAMILY = [
    'FRAME',
    'COMPONENT',
    'COMPONENT_SET',
    'INSTANCE',
  ] as const;

  it('frame 族(含组件与实例)适用', () => {
    for (const key of ['layoutGrids', 'clipsContent'] as const) {
      for (const type of FRAME_FAMILY) {
        expect(propAppliesTo(key, type), `${key} × ${type}`).toBe(true);
      }
    }
  });

  it('形状 / 文本 / 分组不适用(矩形没有该字段)', () => {
    for (const key of ['layoutGrids', 'clipsContent'] as const) {
      for (const type of ['RECTANGLE', 'ELLIPSE', 'TEXT', 'GROUP', 'LINE']) {
        expect(propAppliesTo(key, type), `${key} × ${type}`).toBe(false);
      }
    }
  });

  it('点名文案由本表派生(创建与修改两条路径共用一句)', () => {
    expect(applicabilityMissNotice(['layoutGrids'])).toBe(
      '以下属性与目标节点类型不匹配,已被忽略:layoutGrids(仅适用于 FRAME/COMPONENT/COMPONENT_SET/INSTANCE)',
    );
    // 未收录的字段不参与点名(否则会把「所有节点都能写」的字段误报成不匹配)
    expect(applicabilityMissNotice(['name', 'x'])).toBeNull();
  });
});
