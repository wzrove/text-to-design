import { describe, expect, it } from 'vitest';

import {
  PLATFORM_STYLE_KINDS,
  platformStyleKindAllowed,
  platformStyleKindRejectionHint,
} from '../dicts/platform-value-domain';
import {
  COMMON_STYLE_KINDS,
  MG_ONLY_STYLE_KINDS,
  STYLE_KINDS,
} from '../dicts/style-kind';

/**
 * 样式类别的按平台适用性基线(dec 25827d0c)。
 *
 * 契约的 `STYLE_KINDS` 是三家 `StyleType` 的**并集**(八项),所以「枚举里有」不等于
 * 「本平台建得出」:后四类(STROKE_WIDTH / CORNER_RADIUS / PADDING / SPACING)只有
 * MasterGo 有工厂(`@mastergo/plugin-typings` `dist/index.d.ts:1459-1468`),
 * Figma(`plugin-api.d.ts:12372`)与即时设计(`:1137`)各自只有四项。
 *
 * 这条判据守的是 0007 的形态:没有守卫时,不支持的平台会把这四种 kind 静默走进
 * TEXT 分支(建出一条内容不对的空样式),或抛一句没有上下文的引擎错。
 * 类型层的反向守护在各侧 `sync-guarantee.ts`(登记的适用项必须真在宿主 `StyleType` 里、
 * 别家独有的必须真不在),这里只守运行期的判定与文案出口。
 */
describe('样式类别的按平台适用性', () => {
  it('MasterGo 八类全通(它是这份并集的来源)', () => {
    for (const kind of STYLE_KINDS) {
      expect(platformStyleKindAllowed('mastergo', kind)).toBe(true);
    }
  });

  it('Figma / 即时设计只通四类,另四类写前点名拒', () => {
    for (const platform of ['figma', 'jsdesign'] as const) {
      for (const kind of COMMON_STYLE_KINDS) {
        expect(
          platformStyleKindAllowed(platform, kind),
          `${platform} ${kind}`,
        ).toBe(true);
      }
      for (const kind of MG_ONLY_STYLE_KINDS) {
        expect(
          platformStyleKindAllowed(platform, kind),
          `${platform} ${kind}`,
        ).toBe(false);
      }
    }
  });

  it('并集确实 = 四类共有 + MG 独有(两份名单不重叠、不漏项)', () => {
    expect([...COMMON_STYLE_KINDS, ...MG_ONLY_STYLE_KINDS].sort()).toEqual(
      [...STYLE_KINDS].sort(),
    );
  });

  it('被拒时的出口点名本平台可建的类别(不是只说不支持)', () => {
    const hint = platformStyleKindRejectionHint('figma');
    expect(hint).toContain('PAINT / TEXT / EFFECT / GRID');
    expect(hint).not.toContain('SPACING');
  });

  it('平台未知或未登记一律 fail-open(沿 0022 的口径)', () => {
    expect(platformStyleKindAllowed(null, 'SPACING')).toBe(true);
    expect(platformStyleKindRejectionHint(null)).toBeNull();
    // 三家都登记了 ⇒ 表里没有第四家可退的路径;名单本身要覆盖三平台
    expect(Object.keys(PLATFORM_STYLE_KINDS).sort()).toEqual([
      'figma',
      'jsdesign',
      'mastergo',
    ]);
  });
});
