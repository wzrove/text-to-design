/**
 * 节点类型字典(唯一真源):类型全表 + 中文名 + 可创建子集。
 *
 * 背景:同一张类型表原先分散在四处——shared 的 zod 枚举与 describe 文本、
 * core/execute 的可执行类型白名单、mcp-server per-type 工具的类型联合、
 * 插件 UI 的类型色点表,新增类型要改四处且容易漂移。此处收敛为一份数据,
 * 各侧只做投影(schema / 错误提示 / 色点)。
 */

/** 全部节点类型(对齐 runtime NodeType;顺序即枚举与提示顺序,新增类型只改这里) */
export const NODE_TYPES = [
  'SLICE',
  'FRAME',
  'GROUP',
  'COMPONENT_SET',
  'COMPONENT',
  'INSTANCE',
  'BOOLEAN_OPERATION',
  'VECTOR',
  'STAR',
  'LINE',
  'ELLIPSE',
  'POLYGON',
  'RECTANGLE',
  'TEXT',
] as const;

export type NodeTypeKey = (typeof NODE_TYPES)[number];

/** 类型 → 中文名:zod describe 与错误提示拼装共用,避免手写长串漂移 */
export const NODE_TYPE_LABEL: Record<NodeTypeKey, string> = {
  SLICE: '切片',
  FRAME: '容器',
  GROUP: '分组',
  COMPONENT_SET: '组件集',
  COMPONENT: '组件',
  INSTANCE: '实例',
  BOOLEAN_OPERATION: '布尔运算',
  VECTOR: '矢量',
  STAR: '星形',
  LINE: '线段',
  ELLIPSE: '椭圆',
  POLYGON: '多边形',
  RECTANGLE: '矩形',
  TEXT: '文本',
};

/** zod 枚举的 describe 文案:`节点类型:SLICE=切片 | FRAME=容器 | …` */
export const NODE_TYPE_DESCRIBE = `节点类型:${NODE_TYPES.map(
  (t) => `${t}=${NODE_TYPE_LABEL[t]}`,
).join(' | ')}`;

/**
 * 可由工具/execute 创建的类型(SCHEMA/COMPONENT/INSTANCE 等走组件通道,不在此列)。
 * 顺序即 core/execute 报错里 `支持 A|B|C` 的展示顺序。
 */
export const CREATABLE_NODE_TYPES = [
  'FRAME',
  'RECTANGLE',
  'ELLIPSE',
  'LINE',
  'POLYGON',
  'STAR',
  'VECTOR',
  'BOOLEAN_OPERATION',
  'TEXT',
  'GROUP',
] as const satisfies readonly NodeTypeKey[];

export type CreatableNodeType = (typeof CREATABLE_NODE_TYPES)[number];

/**
 * Figma 运行时独有、本仓**写路径未建模**的节点类型(20 类)。
 *
 * 背景:@figma/plugin-typings 的 SceneNode 是 34 类,而我们的 NODE_TYPES 只覆盖
 * jsDesign 的 14 类。读路径(Figma 画布上本来就存在的 SECTION/STICKY/TABLE…)若按
 * nodeTypeSchema 校验会整条结果判非法 —— MCP 侧 structured() 会退化成空结构 +
 * isError,调用方看不到任何节点。故读路径单独放宽到 observedNodeTypeSchema:
 * 这 20 类**只读透传**(能看到、能读属性),创建/修改仍只支持 CREATABLE_NODE_TYPES,
 * 传进来会在写路径被拒。
 *
 * 与 typings 的一致性由两平台各自的 sync-guarantee.ts 编译期断言维护:
 * 这份名单必须恰好等于 Exclude<SceneNode['type'], NodeType>。
 */
export const FIGMA_ONLY_NODE_TYPES = [
  'TEXT_PATH',
  'TRANSFORM_GROUP',
  'STICKY',
  'CONNECTOR',
  'SHAPE_WITH_TEXT',
  'CODE_BLOCK',
  'STAMP',
  'WIDGET',
  'EMBED',
  'LINK_UNFURL',
  'MEDIA',
  'SECTION',
  'HIGHLIGHT',
  'WASHI_TAPE',
  'TABLE',
  'SLIDE',
  'SLIDE_ROW',
  'SLIDE_GRID',
  'SLOT',
  'INTERACTIVE_SLIDE_ELEMENT',
] as const satisfies readonly string[];

export type FigmaOnlyNodeType = (typeof FIGMA_ONLY_NODE_TYPES)[number];

/** 读路径可观察到的全类型集(含平台独有只读类型) */
export const OBSERVED_NODE_TYPES = [
  ...NODE_TYPES,
  ...FIGMA_ONLY_NODE_TYPES,
] as const;
