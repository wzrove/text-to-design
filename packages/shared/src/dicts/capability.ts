import type { MessageKey } from './i18n';

/**
 * 平台能力字典(唯一真源):每条能力一条记录 —— 它是什么(kind)、门控谁、文案在哪。
 *
 * 三处消费方共用这一份,不再各写各的:
 *   ① adapter 的 meta.capabilities 经 ping 上报给调用方(MCP / 面板);
 *   ② core 的「字段会不会生效」判定(经 RuntimeContext 注入);
 *   ③ 插件 UI 面板的能力表(文案经 labelKey 取,中/英各一份 catalog)。
 * 此前 ①② 是两套并行事实(core/update 手写一份 PLATFORM_SUPERSET_PROPS),②③ 之外
 * 还各有属性表与 label 表;加一个能力要改四处,漏一处不报错。
 *
 * kind 是**必填**的:它替掉了「用空数组表达语义」的老写法 —— 老表里 `[]` 同时表示
 * 三种含义(真的没有门控字段 / 走 op 通道不落属性 / 行为型只决定策略顺序),
 * 加能力时该填哪一种只能读注释猜。现在选 kind 就是回答「它是什么」,编译期逼问。
 */
export type HostCapabilitySpec =
  /** 门控节点属性:平台不具备该能力时,这些字段判为不生效,并在 warnings 里点名 */
  | {
      readonly kind: 'propGate';
      readonly props: readonly string[];
      readonly labelKey: MessageKey;
    }
  /** 只上报:该平台有没有这条能力面。core 不据此判定任何字段 */
  | {
      readonly kind: 'channel';
      readonly labelKey: MessageKey;
    }
  /** 行为型:不改节点属性,由 core 决定策略顺序 */
  | {
      readonly kind: 'flow';
      readonly labelKey: MessageKey;
    };

export const HOST_CAPABILITY_SPEC = {
  // 本地样式的枚举与引用(样式 id 字段)
  styles: {
    kind: 'propGate',
    props: ['fillStyleId', 'strokeStyleId', 'textStyleId', 'effectStyleId'],
    labelKey: 'capability.host.styles',
  },
  // 文本截断与最大行数(仅 TEXT;类型不匹配的判定见 core/capabilities.ts)
  textTruncation: {
    kind: 'propGate',
    props: ['textTruncation', 'maxLines'],
    labelKey: 'capability.host.textTruncation',
  },
  // 组件属性(实例上的 componentProperties)
  componentProperties: {
    kind: 'propGate',
    props: ['componentProperties'],
    labelKey: 'capability.host.componentProperties',
  },
  // 变量:走平台 op 通道,不落在节点属性上。
  // 为什么不删:它没有重复物 —— 「这个平台有变量能力面」是独立声明;core 不据此判定
  // 字段,属展示位。
  //
  // ⚠ 三平台**缺的形态不同**,别一句话糊过去(逐个核对 typings,2026-09-29):
  //   - Figma:读写都通(读 boundVariables,写两个 platformOp)⇒ 声明;
  //   - MG:typings 里有整套 `mg.variables`(集合 / Mode),但本仓一个 op 都没接
  //     ⇒ 不 claim(claim 等于空口)—— 属「**可以接、还没接**」;
  //   - jsDesign:`@jsdesigndeveloper/plugin-typings@1.0.12` 全文**没有任何** variable
  //     声明(grep -in variable 零命中)⇒ 属「**接不了**」,与 MG 那种缺席不是一回事。
  // 三域的完整事实(读路径 / 写入口 / 替代路径 / 证据行号)在
  // `dicts/platform-knowledge.ts`,那是唯一真源;本文件只回答「这条能力位叫什么、门控谁」。
  variables: {
    kind: 'channel',
    labelKey: 'capability.host.variables',
  },
  // 行为型:原生 combineAsVariants 即**原位合并** —— 并入组件集的就是实例所指的
  // COMPONENT 本身,已有实例链接不断。Figma / MasterGo 声明。
  //
  // jsDesign **未**声明,但理由不是「没有这个语义」—— 它的 typings 里
  // `combineAsVariants` 与 Figma 同形。真因是**运行时必崩**(2026-09-24 真机:
  // 三种姿势全部报 `in get_booleanOperation: Value is not a string`,与组件结构
  // 无关)。语义差异是猜的,平台缺陷是验过的 —— 别把后者写成前者。
  inPlaceVariants: {
    kind: 'flow',
    labelKey: 'capability.host.inPlaceVariants',
  },
} as const satisfies Record<string, HostCapabilitySpec>;

export type HostCapabilityKey = keyof typeof HOST_CAPABILITY_SPEC;

/**
 * 表 → 非空元组(保留书写顺序)。
 *
 * 断言只因 `Object.keys` 返回 `string[]`,而 `z.enum` 收的是非空 tuple —— 两者不重叠,
 * 故须先过 `unknown`(不是「顺手消红」:运行期给的就是这张表的键)。
 * 顺序无需额外保证:非数字键按插入顺序返回是 ECMAScript 规定,故展示顺序恒等于
 * 本文件的书写顺序。
 */
function keysOf<T extends Record<string, unknown>>(
  table: T,
): readonly [keyof T & string, ...(keyof T & string)[]] {
  return Object.keys(table) as unknown as readonly [
    keyof T & string,
    ...(keyof T & string)[],
  ];
}

/** 平台超集能力取值(两平台差异项;顺序 = 展示顺序) */
export const HOST_CAPABILITIES = keysOf(HOST_CAPABILITY_SPEC);

/**
 * 能力 → 该能力门控的节点属性。
 * 非 propGate 的能力恒为空数组;能力表里没有的能力,其门控属性一律判为
 * 「不生效」,并在结果 warnings 里点名。
 */
export const CAPABILITY_GATED_PROPS = Object.fromEntries(
  Object.entries(HOST_CAPABILITY_SPEC).map(
    ([cap, spec]): [string, readonly string[]] => [
      cap,
      spec.kind === 'propGate' ? spec.props : [],
    ],
  ),
) as Readonly<Record<HostCapabilityKey, readonly string[]>>;

/** 属性 → 门控它的能力(反查表,由规格表派生,不手写第二份) */
export const CAPABILITY_OF_GATED_PROP: Readonly<
  Record<string, HostCapabilityKey>
> = Object.fromEntries(
  Object.entries(HOST_CAPABILITY_SPEC).flatMap(([cap, spec]) =>
    spec.kind === 'propGate'
      ? spec.props.map((prop) => [prop, cap as HostCapabilityKey])
      : [],
  ),
);

/**
 * 核心能力取值:两平台一致、不随平台变化(ping 直接回传全集)。
 *
 * 没有 kind:它没有门控面、也不参与 core 判定,只有文案 —— 所以不需要像
 * 平台能力那样回答「它门控谁」。
 */
export const CORE_CAPABILITY_SPEC = {
  create: { labelKey: 'capability.core.create' },
  modify: { labelKey: 'capability.core.modify' },
  structure: { labelKey: 'capability.core.structure' },
  component: { labelKey: 'capability.core.component' },
  export: { labelKey: 'capability.core.export' },
  image: { labelKey: 'capability.core.image' },
} as const satisfies Record<string, { readonly labelKey: MessageKey }>;

export type CoreCapabilityKey = keyof typeof CORE_CAPABILITY_SPEC;

/** 核心能力取值(= 规格表的键,顺序即展示顺序) */
export const CORE_CAPABILITIES = keysOf(CORE_CAPABILITY_SPEC);
