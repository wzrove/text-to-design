import { describe, expect, it } from 'vitest';
import { listDocumentAssets } from '../core/assets';
import type { DesignHost } from '../core/host';
import { findNodes, getPageStructure } from '../core/nodes';
import { runtimeContext } from '../core/runtime';
import { makeHost } from './fixtures';

/**
 * 0039 修订:跨页读的前提是**平台声明**了 `documentScopeRead`。
 *
 * 判据不能用 `loadAllPagesAsync` 的符号存在性 —— 即时设计的 host 是
 * `Object.create(native)`,原生成员整个透出来:该符号**在运行时存在且永不返回**
 * (按符号判据收口一版后,`find scope=document` 照样 25008ms `forward_timeout`)。
 * 这与 dec 0042 / dec 0043 的样式枚举是同一个模式:typings 没声明的成员运行时照样在,
 * 符号在,不代表能问(dec 0043 于 2026-10-15 更正:那次永挂的是 `*Async`,不是同步 getter)。
 *
 * 这里断言的是**遍历了哪些页**(用页名记录),不是返回值 —— 只看返回值,
 * 「遍历全部再丢掉」同样会挂死,而那种实现测不出来。
 */
function hostWithPages(visited: string[]): DesignHost {
  const page = (name: string) => ({
    name,
    children: [],
    findAll: () => {
      visited.push(name);
      return [];
    },
    findAllWithCriteria: () => {
      visited.push(name);
      return [];
    },
  });
  const current = page('当前页');
  return {
    ...makeHost([]),
    currentPage: current,
    root: { children: [current, page('第二页')] },
    // 模拟即时设计的形状:符号**在**(真机上它永不返回,故不能拿它当判据);
    // 这里让它正常 resolve,好让「声明了」那条用例能跑完 —— 用例验的是闸门,不是挂死
    loadAllPagesAsync: async () => {},
  } as unknown as DesignHost;
}

const NO_DOC_SCOPE = runtimeContext(['styles']);
const WITH_DOC_SCOPE = runtimeContext(['styles', 'documentScopeRead']);

describe('跨页读按平台声明收口(0039 修订)', () => {
  it('未声明 documentScopeRead:资源清单只扫当前页', async () => {
    const visited: string[] = [];
    const { scopedToCurrentPage } = await listDocumentAssets(
      hostWithPages(visited),
      NO_DOC_SCOPE,
    );
    expect(visited).toEqual(['当前页']);
    expect(scopedToCurrentPage).toBe(true);
  });

  it('声明了就照常遍历全部页', async () => {
    const visited: string[] = [];
    const { scopedToCurrentPage } = await listDocumentAssets(
      hostWithPages(visited),
      WITH_DOC_SCOPE,
    );
    expect(visited).toEqual(['当前页', '第二页']);
    expect(scopedToCurrentPage).toBe(false);
  });

  it('find scope=document 在未声明时退回当前页,并在 note 点名', async () => {
    const visited: string[] = [];
    const r = await findNodes(hostWithPages(visited), NO_DOC_SCOPE, {
      scope: 'document',
    });
    expect(visited).toEqual(['当前页']);
    expect(r.note).toContain('退回当前页');
  });

  it('pages 元数据跟着收口:读不到跨页时只给当前页(否则 get_page 会挂在这一段)', async () => {
    const visited: string[] = [];
    const r = await getPageStructure(hostWithPages(visited), NO_DOC_SCOPE);
    expect(r.pages?.map((p) => p.name)).toEqual(['当前页']);
    expect(r.note).toContain('只覆盖当前页');
  });
});
