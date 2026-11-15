import { describe, expect, it } from 'vitest';
import { resolveNodes, resolveOne } from '../core/access';
import type { DesignHost } from '../core/host';
import { runtimeContext } from '../core/runtime';
import { makeHost, makeRect } from './fixtures';

/**
 * dec e1e66f0a 遗留半项补完(2026-11-15):resolveOne 的 getNodeByIdAsync 选路
 * 不再靠 typeof 探测。真机取证 —— daemon 日志 2026-11-10 set_stroke 17 连
 * 25s forward_timeout、2026-11-15 find 5 次同症,同会话 ping 恒 4~12ms ⇒
 * 凡按 ids 解析节点的工具周期性挂死,唯一共同前置就是这里的 await(永不 settle,
 * catch 不到)。判据换成声明位 nodeResolveSync。
 *
 * 与 main-component-sync.test.ts 同构:断言**调了哪条入口**(called 记录),
 * 不是返回值 —— 只看返回值放过「先 await 再回退」,那照样挂 25s。
 */
function hostWithPhantomAsync(rect: ReturnType<typeof makeRect>, called: { async: boolean }): DesignHost {
  const base = makeHost([rect]);
  return {
    ...base,
    // 模拟即时设计的形状:Object.create(native) 把 typings 未声明的成员透出来;
    // 真机上它永不 settle,这里用 called 记录 + 正常 resolve 让用例能跑完
    getNodeByIdAsync: (id: string) => {
      called.async = true;
      return Promise.resolve(id === rect.id ? rect : null);
    },
  } as unknown as DesignHost;
}

const JSD = runtimeContext(
  ['styles', 'styleEnumeration', 'styleEnumerationSync', 'mainComponentSync', 'nodeResolveSync'],
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

describe('节点解析:选路靠声明,不靠 typeof 探测(e1e66f0a 遗留半项)', () => {
  it('声明 nodeResolveSync 时只读同步入口,不碰 getNodeByIdAsync', async () => {
    const rect = makeRect('1:1', 'r');
    const called = { async: false };
    const host = hostWithPhantomAsync(rect, called);
    const got = await resolveOne(host, rect.id, JSD);
    expect(called.async).toBe(false);
    expect(got?.id).toBe(rect.id);
  });

  it('resolveNodes 批量路径同样不碰(声明时)', async () => {
    const rect = makeRect('1:1', 'r');
    const called = { async: false };
    const host = hostWithPhantomAsync(rect, called);
    const got = await resolveNodes(host, [rect.id], JSD);
    expect(called.async).toBe(false);
    expect(got.map((n) => n.id)).toEqual([rect.id]);
  });

  it('未声明时仍走 getNodeByIdAsync(dynamic-page 下同步入口必抛)', async () => {
    const rect = makeRect('1:1', 'r');
    const called = { async: false };
    const host = hostWithPhantomAsync(rect, called);
    const got = await resolveOne(host, rect.id, FIGMA);
    expect(called.async).toBe(true);
    expect(got?.id).toBe(rect.id);
  });

  it('未注入能力表(fail-open)时沿用异步优先', async () => {
    const rect = makeRect('1:1', 'r');
    const called = { async: false };
    const host = hostWithPhantomAsync(rect, called);
    await resolveOne(host, rect.id, runtimeContext(null));
    expect(called.async).toBe(true);
  });

  it('ctx 缺省(fail-open,与旧签名调用方兼容)时沿用异步优先', async () => {
    const rect = makeRect('1:1', 'r');
    const called = { async: false };
    const host = hostWithPhantomAsync(rect, called);
    await resolveOne(host, rect.id);
    expect(called.async).toBe(true);
  });
});
