import {
  CAPABILITY_OF_GATED_PROP,
  type HostCapabilityKey,
} from '../dicts/capability';
import type { RuntimeContext } from './runtime';

/**
 * 平台能力判定。
 *
 * core 是平台无关层,只拿到 host(运行时全局),拿不到 adapter 的 meta;而「字段会
 * 不会生效」的判定又必须以同一份能力事实为依据。事实来源现在是入口传入的
 * {@link RuntimeContext} —— 显式、只读、可并行构造不同平台的实例,
 * 不再是模块级可变变量(那東西谁都能改,而且改了之后无从追查)。
 *
 * 未注入时返回 null(fail-open):退回运行时属性存在性探测,不误报。
 */

/**
 * 当前平台是否声明支持某能力。
 * - true:声明支持(仍需用属性存在性兜底:能力支持 ≠ 每个节点类型都有该属性)
 * - false:声明不支持(权威判定,直接算不生效)
 * - null:未注入,未知
 */
export function hostCapabilityState(
  ctx: RuntimeContext,
  cap: HostCapabilityKey,
): boolean | null {
  if (ctx.capabilities == null) return null;
  return ctx.capabilities.includes(cap);
}

/** 仅 TEXT 适用的门控字段:其他类型传了属于「类型不匹配」,不该报成「平台不支持」 */
const TEXT_ONLY_GATED_PROPS = new Set(['textTruncation', 'maxLines']);

/**
 * 该属性是否因平台不具备而不会生效。**两条写路径(创建 buildNode / 修改 updateSelection)
 * 共用这一份判定**,避免各写一套:
 * ① 属性 → 门控能力的反查来自 dicts/capability.ts,未登记的属性直接放行;
 * ② 注入的能力表明确说不支持该能力 → 判定不生效,连运行时都不用看;
 * ③ 否则退回运行时属性存在性(`'in'`):能力支持 ≠ 每个节点类型都长着这个属性。
 * 未注入能力表时只走 ③(fail-open,行为与绑定前一致)。
 */
export function isGatedPropUnsupported(
  ctx: RuntimeContext,
  key: string,
  node: { type: string },
): boolean {
  const capability = CAPABILITY_OF_GATED_PROP[key];
  if (capability == null) return false;
  if (TEXT_ONLY_GATED_PROPS.has(key) && node.type !== 'TEXT') return false;
  if (hostCapabilityState(ctx, capability) === false) return true;
  return !(key in node);
}
