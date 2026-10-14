import type { PlatformMeta } from 'text-to-design-shared';

/**
 * 即时设计能力面。
 *
 * `styles`(**按 id 应用**样式)+ `styleEnumeration`(**能列清单**)+
 * `styleEnumerationSync`(**枚举走同步入口**)—— 前两位是 dec 0043 拆开的,第三位是
 * 2026-10-15 真机复验后补的、也是把枚举**救活**的那一把钥匙:
 *
 * 复验链(全为真机实测):
 * 1. 四类 `getLocal*Styles`(同步)**直接调全部 0~1ms 返回**,数据正确(PAINT 6 条)——
 *    与 dec 0043 记的「永不返回」相反;
 * 2. 但 `jsd://styles` 连续两次 25s 超时 ⇒ 卡点不在 getter 本身;
 * 3. 逐层探针定位到 core 的 `listStylesAsync`:它**优先用 `*Async` 成员**,而运行时对象
 *    把这四个 typings 未声明的成员**透出来了**(四个 `typeof === 'function'`),
 *    那个 async 版本 **永不 resolve** ⇒ `await` 一直挂到转发上限,同步 getter 从未被调用。
 *    (线程并不冻死 —— 挂着的是 Promise,所以两次超时之间别的调用仍正常。)
 * 4. ⇒ 选路必须靠**声明**:本平台声明 `styleEnumerationSync`,core 只问同步入口
 *    (见 `shared/src/core/access.ts` 的 preferSync);Figma 不声明(dynamic-page 下
 *    同步入口必抛,只能走 async)。决策记录:dec e1e66f0a。
 *
 * 端到端已验(2026-10-15,重载后):`jsd_ping` 的 capabilities 含这三位;
 * `jsd://styles` 毫秒级列出 7 条(6 PAINT + 1 TEXT),`get_page` 的 `assets.styles`
 * 同为 7 条 —— 样式这一面从「恒空」回到可用,定位用的探针已随之删掉。
 *
 * 教训与 `documentScopeRead` 同一族:**符号存在性 ≠ 可用性**(dec 0042 / dec 0043 都是栽在这里)。
 *
 * `documentScopeRead` 不 claim(0039 修订):typings 没有 `loadAllPagesAsync`,
 * 但 host 是 `Object.create(native)` —— 运行时**有**该符号且永不返回;真机实测
 * 只要碰到非当前页就 25s `forward_timeout`(`find scope=document` 三次都是),
 * 当前页 find 只要 44ms。⇒ 跨页遍历、`get_page` 的资源清单与 pages 一律只覆盖当前页。
 *
 * `variables` 不 claim:typings 全文无 variable 声明,属**接不了**(0039)。
 */
export const meta: PlatformMeta = {
  capabilities: ['styles', 'styleEnumeration', 'styleEnumerationSync'],
  // 本平台无 platformOps(dynamic-page 系与变量面都接不了,见上)。
  platformOps: [],
};
