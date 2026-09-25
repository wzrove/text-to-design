import type { HostCapabilityKey } from '../dicts/capability';
import type { PlatformKey } from '../dicts/platform';

/**
 * 一次运行的显式上下文。
 *
 * 取代此前 `core/capabilities.ts` 里的模块级可变单例 `let injected`。core 是平台
 * 无关层,拿不到 adapter 的 meta;而「某个字段在这个平台上到底会不会生效」又必须
 * 以同一份能力事实为依据 —— 这份事实由插件入口在装配时**组装成一个对象**,再沿着
 * 调用链显式传下去,不再藏进模块变量里。
 *
 * 为什么值得多一层:
 * - 单例时代每个用例都得先 `setHostCapabilities(null)` 复位(见 write-path.test.ts
 *   里那个 beforeEach),用例之间共享可变状态;
 * - 无法同时构造两个不同平台的实例做对比;
 * - 「谁在什么时候改了能力判定」不可追查。
 *
 * 约定:它是**构造期快照**,运行期只读。能力在运行中变化不在本模型的考虑范围内,
 * 真需要那是另一个话题(平台切换会重建整个插件实例)。
 */
export interface RuntimeContext {
  /** 当前平台声明的能力表;null = 未注入(fail-open,退回运行时属性探测) */
  readonly capabilities: readonly HostCapabilityKey[] | null;
  /**
   * 当前平台标识;null = 未注入。
   *
   * 为什么能力表不够、还要单独带平台:`capabilities` 是**能力位**(「这个平台有没有
   * 本地样式 / 变量」),而值域与适用性收窄问的是另一件事 ——「同一属性在这个平台
   * 接受的取值/字段面更窄」(如 MG 的 alignSelf 只有 STRETCH/INHERIT、jsDesign 的
   * BlendMode 没有 PASS_THROUGH)。这类事实由 `dicts/platform-value-domain.ts` 按
   * 平台声明,判定要按 id 反查,能力位表达不了。见决策 0022。
   *
   * 与 `capabilities` 同为**构造期快照**(仍是 0002 的口径):
   * 平台在运行中变化不在本模型的考虑范围内。
   */
  readonly platform: PlatformKey | null;
}

/** 未注入能力表时的基线上下文:纯开场也能跑,行为与"未绑定"时一致 */
export const NO_CAPABILITIES: RuntimeContext = {
  capabilities: null,
  platform: null,
};

/**
 * 按能力表与平台构造上下文;传 null 表示"未知"(fail-open,不误报不支持)。
 * `platform` 缺省为 null —— 未注入时平台值域/适用性收窄一律放行,只留存在性守卫。
 */
export function runtimeContext(
  capabilities: readonly HostCapabilityKey[] | null,
  platform: PlatformKey | null = null,
): RuntimeContext {
  return { capabilities, platform };
}
