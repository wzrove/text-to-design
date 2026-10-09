import { describe, expect, it } from 'vitest';
import {
  isVersionPushFrame,
  NPM_PACKAGES,
  registryLatestUrl,
} from '../version-channel';

describe('isVersionPushFrame', () => {
  it('认下两项齐全的推送(null 也算齐全 —— 那是「没查到」的事实)', () => {
    expect(
      isVersionPushFrame({
        type: 'version',
        latest: { ui: '0.9.0', mcp: '0.11.0' },
      }),
    ).toBe(true);
    expect(
      isVersionPushFrame({ type: 'version', latest: { ui: null, mcp: null } }),
    ).toBe(true);
  });

  it('认下多余字段(对端更新的帧不该被判成坏帧)', () => {
    expect(
      isVersionPushFrame({
        type: 'version',
        latest: { ui: '1.0.0', mcp: '1.0.0' },
        extra: 1,
      }),
    ).toBe(true);
  });

  it('拒掉别的帧类型、缺 latest、缺键与非对象', () => {
    expect(
      isVersionPushFrame({ type: 'status', state: 'ready', version: '1' }),
    ).toBe(false);
    expect(isVersionPushFrame({ type: 'version' })).toBe(false);
    // 缺键 = 对端更老,按「无事实」处理(宁可不提示,也不猜)
    expect(
      isVersionPushFrame({ type: 'version', latest: { ui: '1.0.0' } }),
    ).toBe(false);
    expect(isVersionPushFrame(null)).toBe(false);
    expect(isVersionPushFrame('version')).toBe(false);
  });
});

describe('registry 端点', () => {
  it('两个包名与 latest 端点一一对应', () => {
    expect(NPM_PACKAGES.ui).toBe('text-to-design-ui');
    expect(NPM_PACKAGES.mcp).toBe('text-to-design-mcp');
    expect(registryLatestUrl(NPM_PACKAGES.ui)).toBe(
      'https://registry.npmjs.org/text-to-design-ui/latest',
    );
  });
});
