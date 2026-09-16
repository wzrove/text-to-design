import {
  CAPABILITY_OF_GATED_PROP,
  type HostCapabilityKey,
} from '../dicts/capability';

/**
 * 当前平台能力表的进程内注入点。
 *
 * core 是平台无关层,只拿到 host(运行时全局),拿不到 adapter 的 meta;
 * 而「字段会不会生效」的判定又必须以同一份能力事实为依据。故由插件入口
 * (ui/code/plugin.ts 的 registerPlugin)在装配时注入一次 —— 与 logger.setLogSink
 * 同模式:core 保持零 adapter 依赖,事实由入口组装。
 *
 * 未注入时返回 null(fail-open):退回运行时属性存在性探测,不误报。
 */
let injected: readonly HostCapabilityKey[] | null = null;

/** 注入当前平台能力表(插件入口调用;传 null 可清空,便于单测) */
export function setHostCapabilities(
  caps: readonly HostCapabilityKey[] | null,
): void {
  injected = caps;
}

/**
 * 当前平台是否声明支持某能力。
 * - true:声明支持(仍需用属性存在性兜底:能力支持 ≠ 每个节点类型都有该属性)
 * - false:声明不支持(权威判定,直接算不生效)
 * - null:未注入,未知
 */
export function hostCapabilityState(cap: HostCapabilityKey): boolean | null {
  if (injected == null) return null;
  return injected.includes(cap);
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
  key: string,
  node: { type: string },
): boolean {
  const capability = CAPABILITY_OF_GATED_PROP[key];
  if (capability == null) return false;
  if (TEXT_ONLY_GATED_PROPS.has(key) && node.type !== 'TEXT') return false;
  if (hostCapabilityState(capability) === false) return true;
  return !(key in node);
}
