import { describe, expect, it } from 'vitest';
import { resolveMainComponent } from '../core/access';
import type { NodeSkeleton } from '../core/host';
import { runtimeContext } from '../core/runtime';

/**
 * dec 0010 的异步优先在**主组件读**上被真机推翻(2026-10-19,即时设计):
 * 该平台 host 是 `Object.create(native)`,typings 未声明的 `getMainComponentAsync`
 * 运行时照样在、且**永不 settle** ⇒ `?.` 探测恒成立、`await` 撞满 25s。
 * 实测入口:`jsd_copy_overrides`(只读覆盖快照、**不写任何属性**)25109ms 超时;
 * `jsd_override` / `jsd_detach_instance` 同族。判据换成声明位 `mainComponentSync`。
 *
 * 这里断言的是**调了哪条入口**(用 `called` 记录),不是返回值 —— 只看返回值,
 * 「先 await 异步再回退同步」同样会挂死,而那种实现测不出来。
 */
function instance(mainId: string, called: { async: boolean }): NodeSkeleton {
  return {
    id: '5:20',
    type: 'INSTANCE',
    mainComponent: { id: mainId } as NodeSkeleton,
    // 模拟即时设计的形状:符号在,真机上它永不 settle;这里让它永不 resolve 更贴近,
    // 但用例要能跑完,故用 `called` 先记录 —— 只要被调用过就失败。
    getMainComponentAsync: () => {
      called.async = true;
      return Promise.resolve({ id: 'wrong' } as NodeSkeleton);
    },
  } as unknown as NodeSkeleton;
}

const JSD = runtimeContext(
  ['styles', 'styleEnumeration', 'styleEnumerationSync', 'mainComponentSync'],
  'jsdesign',
);
const FIGMA = runtimeContext([
  'styles',
  'styleEnumeration',
  'documentScopeRead',
  'textTruncation',
  'componentProperties',
  'variables',
  'inPlaceVariants',
]);

describe('主组件读:选路靠声明,不靠 ?. 探测(dec 0010 / e1e66f0a 修订)', () => {
  it('声明 mainComponentSync 时只读同步字段,不碰 getMainComponentAsync', async () => {
    const called = { async: false };
    const got = await resolveMainComponent(instance('5:21', called), JSD);
    expect(called.async).toBe(false);
    expect(got?.id).toBe('5:21');
  });

  it('未声明时仍走 getMainComponentAsync(dynamic-page 下同步字段必抛)', async () => {
    const called = { async: false };
    await resolveMainComponent(instance('5:21', called), FIGMA);
    expect(called.async).toBe(true);
  });

  it('未注入能力表(fail-open)时沿用异步优先', async () => {
    const called = { async: false };
    await resolveMainComponent(instance('5:21', called), runtimeContext(null));
    expect(called.async).toBe(true);
  });
});
