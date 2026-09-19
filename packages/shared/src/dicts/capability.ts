/**
 * 平台能力字典(唯一真源):能力取值 + 中文标签 + 能力门控的节点属性。
 *
 * 三处消费方共用这一份数据,不再各写各的:
 *   ① adapter 的 meta.capabilities 经 ping 上报给调用方;
 *   ② core 的「字段会不会生效」判定(由插件入口 setHostCapabilities 注入);
 *   ③ 插件 UI 面板的能力表(中文标签就在这里)。
 * 此前 ①② 是两套并行事实(core/update 手写一份 PLATFORM_SUPERSET_PROPS),可各自漂移。
 */

/** 平台超集能力取值(两平台差异项) */
export const HOST_CAPABILITIES = [
  'styles',
  'textTruncation',
  'componentProperties',
  'variables',
  'platformOps',
  'inPlaceVariants',
] as const;

export type HostCapabilityKey = (typeof HOST_CAPABILITIES)[number];

/** 核心能力取值:两平台一致、不随平台变化(ping 直接回传全集) */
export const CORE_CAPABILITIES = [
  'create',
  'modify',
  'structure',
  'component',
  'export',
  'image',
] as const;

export type CoreCapabilityKey = (typeof CORE_CAPABILITIES)[number];

/** 能力 → 中文名(工具/错误文案与面板显示共用) */
export const HOST_CAPABILITY_LABEL: Record<HostCapabilityKey, string> = {
  styles: '本地样式',
  textTruncation: '文本截断',
  componentProperties: '组件属性',
  variables: '变量',
  platformOps: '平台特有操作',
  inPlaceVariants: '原位合并变体',
};

/** 核心能力 → 中文名 */
export const CORE_CAPABILITY_LABEL: Record<CoreCapabilityKey, string> = {
  create: '创建',
  modify: '修改',
  structure: '结构操作',
  component: '组件',
  export: '导出',
  image: '图片填充',
};

/**
 * 能力 → 该能力门控的节点属性。
 * 能力表里没有的能力,其门控属性一律判为「不生效」,并在结果 warnings 里点名。
 */
export const CAPABILITY_GATED_PROPS: Record<
  HostCapabilityKey,
  readonly string[]
> = {
  // 本地样式的枚举与引用(样式 id 字段)
  styles: ['fillStyleId', 'strokeStyleId', 'textStyleId', 'effectStyleId'],
  // 文本截断与最大行数
  textTruncation: ['textTruncation', 'maxLines'],
  // 组件属性(实例上的 componentProperties)
  componentProperties: ['componentProperties'],
  // 以下两个走 jsd_platform_op 通道,不落在节点属性上,故无门控字段
  variables: [],
  platformOps: [],
  // 行为型能力(不改节点属性,只决定 core 的策略顺序):
  // 原生 combineAsVariants 即原位合并 —— 并入组件集的就是实例所指的 COMPONENT
  // 本身,已有实例链接不断。Figma 声明;jsDesign 无此语义。
  inPlaceVariants: [],
};

/** 属性 → 门控它的能力(反查表,由 CAPABILITY_GATED_PROPS 派生,不手写第二份) */
export const CAPABILITY_OF_GATED_PROP: Readonly<
  Record<string, HostCapabilityKey>
> = Object.fromEntries(
  Object.entries(CAPABILITY_GATED_PROPS).flatMap(([cap, props]) =>
    props.map((prop) => [prop, cap as HostCapabilityKey]),
  ),
);
