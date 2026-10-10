import type { PlatformMeta } from 'text-to-design-shared';

/**
 * 即时设计能力面。
 *
 * 只 claim `styles`(**按 id 应用**样式),**不** claim `styleEnumeration`(列出有哪些
 * 样式)—— 0043 的整条结论就在这一行:四个 `getLocal*Styles` 同步 getter 全都存在,
 * 但引擎侧永不返回,而同步调用**不可中断**(插件线程冻死,`catch` 与超时都救不了)。
 * 实测空文档也照样 25s 超时 ⇒ 与文档内容无关,是平台缺陷。
 * 合成一条能力位会让「能列清单」被「能应用样式」隐含出来,那正是 `get_page` 全废的原因。
 *
 * `documentScopeRead` 不 claim(0039 修订):typings 没有 `loadAllPagesAsync`,
 * 但 host 是 `Object.create(native)` —— 运行时**有**该符号且永不返回;真机实测
 * 只要碰到非当前页就 25s `forward_timeout`(`find scope=document` 三次都是),
 * 当前页 find 只要 44ms。⇒ 跨页遍历、`get_page` 的资源清单与 pages 一律只覆盖当前页。
 *
 * `variables` 不 claim:typings 全文无 variable 声明,属**接不了**(0039)。
 */
export const meta: PlatformMeta = {
  capabilities: ['styles'],
  platformOps: [],
};
