import type {
  CoreCapability,
  HostCapability,
  MessageKey,
} from 'text-to-design-shared';

/**
 * 能力键 → 文案键(显式表,不拼模板串)。
 *
 * 拼 `${'capability.host.' + cap}` 更短,但它把「能力键的小写段恰好等于文案键的
 * 尾段」变成了隐式约定 —— 将来某个能力改名(如 `textTruncation` → `truncation`)
 * 时,拼串会静默取到 `undefined` 而不是编译报错。写成表 + `satisfies`,加能力时
 * 漏一行就当场红。
 */
export const HOST_CAPABILITY_KEY = {
  styles: 'capability.host.styles',
  textTruncation: 'capability.host.textTruncation',
  componentProperties: 'capability.host.componentProperties',
  variables: 'capability.host.variables',
  platformOps: 'capability.host.platformOps',
  inPlaceVariants: 'capability.host.inPlaceVariants',
} as const satisfies Record<HostCapability, MessageKey>;

export const CORE_CAPABILITY_KEY = {
  create: 'capability.core.create',
  modify: 'capability.core.modify',
  structure: 'capability.core.structure',
  component: 'capability.core.component',
  export: 'capability.core.export',
  image: 'capability.core.image',
} as const satisfies Record<CoreCapability, MessageKey>;
