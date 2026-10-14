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
  // 本地样式**清单**的枚举(get_page 的 assets.styles 与 jsd://styles)。
  //
  // 与上面的 `styles` 是**两件事**:那条管「能不能按 id 应用样式」,这条管「能不能列出
  // 有哪些样式」。拆开是 0043 的结论 —— 即时设计 claim 了 `styles`(按 id 应用正常),
  // 但四个 `getLocal*Styles` 一个都不返回(同步 getter 不可中断,调用即冻死线程)。
  // 合成一条,「有样式能力」就会把「能列清单」一起假定下来,而这一假定正是让
  // `get_page` 在即时设计上全废的原因。
  styleEnumeration: {
    kind: 'flow',
    labelKey: 'capability.host.styleEnumeration',
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
  // ⚠ 三平台**缺的形态不同**,别一句话糊过去(逐个核对 typings,2026-09-29;MG 侧 2026-10-10 接上读写):
  //   - Figma:读写都通 ⇒ 声明。读**三条**通道(节点 `boundVariables` / 库存
  //     `figma_variables_list` / 样式档 `figma_style_variables_list`),写四个 op
  //     (建 / 绑节点 / 删 / 绑样式)—— 「变量 → 样式 → 节点」这条三层链两端都接上了,
  //     中间那环的证据出口是样式档那条读面;
  //   - MG:typings 里有整套 `mg.variables`(集合 / Mode / 变量),0040 起本仓接了
  //     只读枚举 + 建变量 + 绑定图层属性 + 删变量四个 op ⇒ 声明(claim 的含义是「有变量能力面」,
  //     而写入口真接上了,不再是空口);模式/分组/别名等旁支未接,登记在 nativeUnwired;
  //     ⚠ 本平台是「变量**含**样式」(八项复合样式类型 :1832,与 :1810 StyleType 逐字重名、
  //     与样式共用 id 空间),与 Figma 的「变量喂样式」是两条相反的链路 —— 完整关系见
  //     `platform-knowledge.ts` 的 mastergo.variables;
  //   - jsDesign:`@jsdesigndeveloper/plugin-typings@1.0.12` 全文**没有任何** variable
  //     声明(grep -in variable 零命中)⇒ 属「**接不了**」,与 MG 那种「可以接」不是一回事。
  // 三域的完整事实(读路径 / 写入口 / 替代路径 / 证据行号)在
  // `dicts/platform-knowledge.ts`,那是唯一真源;本文件只回答「这条能力位叫什么、门控谁」。
  variables: {
    kind: 'channel',
    labelKey: 'capability.host.variables',
  },
  // 文档范围读:能不能读**非当前页**(跨页遍历、`get_page` 的资源清单与 pages 元数据)。
  //
  // 与 0011 的 `loadAllPagesAsync` 是**两件事**,别再拿符号存在性当判据:
  // 即时设计的 typings 是 Figma API v1 update 40 的 fork(没有该声明),但运行时
  // `Object.create(native)` 会把原生成员整个透出来 —— 实测该符号**存在且永不返回**:
  // 2026-10-10 真机 `find scope=document` 25008ms `forward_timeout`,而当前页 find
  // 只要 44ms。同步调用不可中断 ⇒ 判据只能是声明,这是 0042 那个坑的第二次出现。
  //
  // 三平台:Figma 声明(真有 dynamic-page 且能加载);即时设计不声明(实测挂死);
  // MasterGo 同样不声明 —— 它也没有该入口,且**未真机验过能否跨页**,按保守默认收口,
  // 验过能跨页再单独放开这一位。
  documentScopeRead: {
    kind: 'flow',
    labelKey: 'capability.host.documentScopeRead',
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
