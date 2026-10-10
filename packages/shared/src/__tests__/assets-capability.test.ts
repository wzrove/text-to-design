import { describe, expect, it } from 'vitest';
import { listDocumentAssets } from '../core/assets';
import type { DesignHost } from '../core/host';
import { getPageStructure } from '../core/nodes';
import { runtimeContext } from '../core/runtime';
import { makeHost } from './fixtures';

/**
 * 0043:`get_page` 的资源清单按**平台声明的能力位**决定「问不问」。
 *
 * 关键不是返回值,是**有没有真的调用**:样式那一面的同步 getter 不可中断 ——
 * 即时设计上四个 getter 全都存在、也全都永不返回,调一次就把 `get_page` 冻死 25s。
 * 所以「未声明 ⇒ 恒空」必须在调用前生效,而不是取回来再丢掉。
 */

/** 假宿主:带 root(资源清单要逐页找组件)与四个会被记录的样式 getter */
function hostWithAssets(calls: string[]): DesignHost {
  const page = {
    name: 'p',
    children: [],
    findAllWithCriteria: () => [],
  };
  const getter = (kind: string) => () => {
    calls.push(kind);
    return [{ id: `${kind}:1`, name: kind, type: kind }];
  };
  return {
    ...makeHost([]),
    root: { children: [page] },
    getLocalPaintStyles: getter('PAINT'),
    getLocalTextStyles: getter('TEXT'),
    getLocalEffectStyles: getter('EFFECT'),
    getLocalGridStyles: getter('GRID'),
    getLocalVariablesAsync: async () => [{ id: 'v:1', name: 'v' }],
  } as unknown as DesignHost;
}

describe('get_page 资源清单按平台能力声明返空(0043)', () => {
  it('未声明 styleEnumeration / variables:两面恒空,且 getter 一次都不调', async () => {
    const calls: string[] = [];
    const { assets, unavailableSurfaces } = await listDocumentAssets(
      hostWithAssets(calls),
      runtimeContext(['styles']),
    );
    expect(calls).toEqual([]);
    expect(assets.styles).toEqual([]);
    expect(assets.variables).toEqual([]);
    expect(unavailableSurfaces).toEqual(['styles', 'variables']);
  });

  it('声明了就照常枚举:能力位是「能不能问」,不是「一定有内容」', async () => {
    const calls: string[] = [];
    const { assets, unavailableSurfaces } = await listDocumentAssets(
      hostWithAssets(calls),
      runtimeContext(['styleEnumeration', 'variables']),
    );
    expect(calls).toEqual(['PAINT', 'TEXT', 'EFFECT', 'GRID']);
    expect(assets.styles.map((s) => s.type)).toEqual([
      'PAINT',
      'TEXT',
      'EFFECT',
      'GRID',
    ]);
    expect(assets.variables).toHaveLength(1);
    expect(unavailableSurfaces).toEqual([]);
  });

  it('恒空的那一面在 note 里点名:空数组不等于「文档里没有」', async () => {
    const r = await getPageStructure(
      hostWithAssets([]),
      runtimeContext(['styles']),
    );
    expect(r.assets?.styles).toEqual([]);
    expect(r.note).toContain('assets.styles');
  });
});
