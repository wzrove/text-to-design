import type { z } from 'zod';
import type { BooleanOperation } from '../dicts/boolean-operation';
import type * as shared from '../schemas';

/**
 * 节点骨架:对应运行时 SceneNode 的窄化接口。
 * core 只声明它读写的字段,不声明运行时全部字段。
 * 平台 adapter 用 `as unknown as NodeSkeleton` 单点断言接入运行时节点。
 * Paint/Effect/BlendMode/LineHeight/VectorPath 等直接复用 shared 类型,不重造。
 */
export interface NodeSkeleton extends ContainerSkeleton {
  id: string;
  name: string;
  type: shared.NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  locked: boolean;
  rotation: number;
  parent: NodeSkeleton | null;

  /**
   * 绝对坐标(页面系,含旋转/父级变换换算),可读写。
   * Figma/jsDesign SceneNode 原生属性,窄接口此处显式声明供 core 使用。
   * reparent 后用它还原节点原绝对位置,避免坐标漂移。
   */
  absolutePosition?: { x: number; y: number };
  /**
   * 绝对包围盒(页面系,轴对齐,含旋转后的真实范围),只读。
   * 渲染节点才有;非渲染节点(如 Page)为 null。用于原地归组时计算组框边界。
   */
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;

  remove(): void;
  clone(): NodeSkeleton;
  resize(width: number, height: number): void;

  fills?: shared.Paint[] | null;
  strokes?: shared.Paint[] | null;
  strokeWeight?: number;
  strokeTopWeight?: number;
  strokeBottomWeight?: number;
  strokeLeftWeight?: number;
  strokeRightWeight?: number;
  strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
  strokeCap?: 'NONE' | 'ROUND' | 'SQUARE' | 'ARROW_LINES' | 'ARROW_EQUILATERAL';
  strokeJoin?: 'MITER' | 'BEVEL' | 'ROUND';
  dashPattern?: readonly number[];
  blendMode?: shared.BlendMode;
  constraints?: {
    horizontal: shared.ConstraintType;
    vertical: shared.ConstraintType;
  };
  clipsContent?: boolean;
  cornerSmoothing?: number;
  layoutGrids?: shared.LayoutGrid[];
  effects?: shared.Effect[];
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  pointCount?: number;
  innerRadius?: number;
  vectorPaths?: shared.VectorPath[];
  booleanOperation?: BooleanOperation;
  isMask?: boolean;
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number };

  characters?: string;
  fontSize?: number | typeof MIXED;
  fontName?: shared.FontName | typeof MIXED;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  lineHeight?: shared.LineHeight | typeof MIXED;
  letterSpacing?: shared.LetterSpacing | typeof MIXED;

  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number | typeof MIXED;
  paddingTop?: number | typeof MIXED;
  paddingRight?: number | typeof MIXED;
  paddingBottom?: number | typeof MIXED;
  paddingLeft?: number | typeof MIXED;
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  primaryAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER';
  layoutGrow?: number;
  layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT';

  children?: readonly NodeSkeleton[];
  mainComponent?: NodeSkeleton | null;
  /**
   * 主组件的**异步**入口。dynamic-page 下读 `mainComponent` 直接抛
   * (`Cannot call with documentAccess: dynamic-page`),必须走本方法(见 0011)。
   * jsDesign typings 无此符号(已登记为平台超集缺口),由 Access 层回退到同步字段。
   */
  getMainComponentAsync?(): Promise<NodeSkeleton | null>;
  variantProperties?: Record<string, string>;
  variantGroupProperties?: Record<string, { values: readonly string[] }>;

  exportAsync(settings: unknown): Promise<Uint8Array>;
  createInstance(): NodeSkeleton;
  detachInstance(): NodeSkeleton;
  swapComponent(component: NodeSkeleton): void;
  /**
   * 实例属性:变体值传字符串,布尔/文本/换绑属性传标量(布尔也是标量),
   * 需要显式类型或换绑候选时传 `ComponentPropertyValue` 对象。
   *
   * 为什么三种都收:两平台原生入口都收 `string | boolean`
   * (Figma `setProperties({[名]: string|boolean})`、MG `setProperties({[propertyId]: string|boolean})`,
   * 后者见 `@mastergo/plugin-typings` 3097 行),收窄成字符串会让布尔属性在两边都设不了。
   * 对象形态只有 Figma 收(MG 会把 boolean 之外的形态拒掉),故由 adapter/门面负责整形。
   */
  setProperties(
    properties: Record<
      string,
      string | boolean | shared.ComponentPropertyValue
    >,
  ): void;
  outlineStroke(): NodeSkeleton | null;
  /**
   * 节点级解组。⚠ typings 缺口:@figma/plugin-typings 的 GroupNode 只有 clone(),
   * 官方入口是 PluginAPI.ungroup(node);jsDesign typings 两者都没有。故此处为可选,
   * core 解组优先走 DesignHost.ungroup,再回退本方法,都无则报错(不静默 no-op)。
   */
  ungroup?(): void;

  /** ---- 平台特有超集(仅对应平台运行时存在,如 Figma;其他平台恒 undefined) ---- */
  textTruncation?: 'DISABLED' | 'ENDING';
  maxLines?: number;
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
  componentProperties?: Record<string, shared.ComponentPropertyValue>;
  /**
   * 变量绑定(仅 Figma 运行时存在,其余平台恒 undefined)。**同步只读值成员**,
   * 不是能力签名 —— 故 0010 的「新增成员一律异步」不适用(与上面几个 Figma 超集
   * 成员同档);且 Figma typings 只有同步变体。键 = 写侧 `boundProperty` 的同一套词汇,
   * 线格式与省略纪律见 `schemas/platform.ts` 的 `boundVariablesSchema`(决策 0024)。
   */
  boundVariables?: shared.BoundVariableAliases;
  resetOverrides?(): void;
  removeOverrides?(): void;
}

/** 本地样式摘要:两平台 getter 的同构返回值(listStyles 只回这三个字段) */
export interface StyleSummary {
  id: string;
  name: string;
  type: string;
}

/** 可容纳子节点的对象:页面 + 容器型节点共享 */
export interface ContainerSkeleton {
  appendChild(child: NodeSkeleton): void;
  insertChild(index: number, child: NodeSkeleton): void;
}

/** 当前页:jsDesign.currentPage 的窄化 */
export interface PageSkeleton extends ContainerSkeleton {
  name: string;
  selection: readonly NodeSkeleton[];
  children: readonly NodeSkeleton[];
  findOne(fn: (node: NodeSkeleton) => boolean): NodeSkeleton | null;
  findAll(): NodeSkeleton[];
  /**
   * 按类型查节点(引擎原生过滤)。类型名取读路径全表:除本仓建模的 14 类外,
   * Figma 独有只读类型(SECTION/STICKY…)也能筛 —— 能查到不等于能建/能改。
   */
  findAllWithCriteria(options: {
    types: readonly shared.ObservedNodeType[];
  }): NodeSkeleton[];
}

/**
 * 平台全局(jsDesign.* / figma.* / mg)的窄化接口。
 *
 * 契约纪律(0010):**新增/变更成员一律异步优先** —— 签名声明 `Promise<...>`。
 * 同步只保留给「各平台 typings 都只有同步变体 + 纯内存」的成员(如 createFrame /
 * appendChild)。理由:底层 Plugin API 的异步面在扩张且三平台不对称
 * (figma 1.137 有 97 处 Promise,jsDesign 1.0.12 只有 20 处,mastergo 2.19 把
 * `createNodeFromSvg` / `createImage` 都做成了 Promise 版;
 * getMainComponentAsync / loadAllPagesAsync 等仅 figma 有),同步签名一旦落成,
 * 后面接异步能力就要改一遍全链路签名 —— 0017 就是这条纪律在第三平台上的兑现
 * (两处成员由同步改异步)。
 */
export interface DesignHost {
  createFrame(): NodeSkeleton;
  createRectangle(): NodeSkeleton;
  createEllipse(): NodeSkeleton;
  createText(): NodeSkeleton;
  createLine(): NodeSkeleton;
  createPolygon(): NodeSkeleton;
  createStar(): NodeSkeleton;
  createVector(): NodeSkeleton;
  createComponent(): NodeSkeleton;
  /**
   * 由 SVG 字符串建节点(一律异步)。
   *
   * 为什么必须异步(0017):MasterGo 只有 `mg.createNodeFromSvgAsync(svg): Promise<FrameNode>`,
   * 没有同步变体 —— `@mastergo/plugin-typings@2.19.2` 全文件无 `createNodeFromSvg`。
   * 同步签名一旦保留,第三平台的 adapter 只能返回 Promise,调用方拿到的是 Promise
   * 而不是节点(`node.id` 全 undefined、`appendChild` 抛 "child is not a node"),
   * 报错点会漂到组装/序列化深处。故按 0010 的异步优先统一成 Promise;
   * figma / jsDesign 侧由各自 adapter 把同步原生方法包成 async。
   */
  createNodeFromSvgAsync(svg: string): Promise<NodeSkeleton>;
  /**
   * 上传图片字节,拿回**宿主本地**的图片引用(一律异步)。
   *
   * 为什么不叫 `createImageAsync`:这个确切名字在 Figma 与 jsDesign 的 typings 里
   * **已被占用且语义不同** —— 两家都是 `createImageAsync(src: string): Promise<Image>`,
   * 收的是**图片来源字符串**(URL / base64 src),不是字节。沿用同名会让「读名字猜行为」
   * 的人(以及后来写 adapter 的人)把两者当同一个东西,而它是静默错用:
   * 传进去的 `Uint8Array` 会被当 src 解析。故按语义命名(`FromBytes`)避开撞车。
   *
   * 为什么返回 `{ hash }` 而不是更中性的名字:`hash` 是本仓线格式里 IMAGE paint 的
   * 字段(Figma `imageHash`),core 直接把它写进 `fills`/`strokes`。第三平台
   * (MasterGo)的原生字段是 `imageRef`、且 `createImage` 返回的是 `Image{href}` ——
   * 该平台 adapter 负责把 href 当 `hash` 交出、并在节点侧把 paint 的
   * `imageHash` 翻译回 `imageRef`(见 0017);core 与线格式保持平台无关。
   */
  createImageFromBytesAsync(bytes: Uint8Array): Promise<{ hash: string }>;

  readonly currentPage: PageSkeleton;
  /**
   * 文档根:页面枚举的唯一入口(0011 批次 5)。dynamic-page 下读各页 children
   * 前必须先 `loadAllPagesAsync`(见 ensurePagesLoaded 的门控);枚举本身
   * (root.children)两平台都是同步的轻量元数据。jsDesign 无 dynamic-page,
   * 文档常驻,直接遍历即可。
   */
  readonly root: { readonly children: readonly PageSkeleton[] };
  readonly viewport: {
    center: { x: number; y: number };
    scrollAndZoomIntoView(nodes: readonly NodeSkeleton[]): void;
  };

  union(
    nodes: readonly NodeSkeleton[],
    parent: ContainerSkeleton,
  ): NodeSkeleton;
  subtract(
    nodes: readonly NodeSkeleton[],
    parent: ContainerSkeleton,
  ): NodeSkeleton;
  intersect(
    nodes: readonly NodeSkeleton[],
    parent: ContainerSkeleton,
  ): NodeSkeleton;
  exclude(
    nodes: readonly NodeSkeleton[],
    parent: ContainerSkeleton,
  ): NodeSkeleton;
  flatten(
    nodes: readonly NodeSkeleton[],
    parent: ContainerSkeleton,
  ): NodeSkeleton;

  combineAsVariants(
    nodes: readonly NodeSkeleton[],
    parent: ContainerSkeleton,
  ): NodeSkeleton;
  importComponentByKeyAsync(key: string): Promise<NodeSkeleton>;

  /**
   * 解组:把 GROUP/FRAME 拆掉、子节点回到原父级(对应 Figma 的
   * `figma.ungroup(node)`;jsDesign typings 未声明,运行时缺失时由 core 报错)。
   * 返回解组后回到原父级的子节点,供 core 统计。
   */
  ungroup?(node: NodeSkeleton): readonly NodeSkeleton[];

  /**
   * 同步按 id 解析。**dynamic-page 下无条件抛异常**(与页面是否已加载无关),
   * 仅 jsDesign / legacy 模式可用;存在 `getNodeByIdAsync` 时 Access 层一律走异步。
   */
  getNodeById(id: string): NodeSkeleton | null;
  /** dynamic-page 下唯一的按 id 解析入口(0011);jsDesign 无此符号,登记为缺口 */
  getNodeByIdAsync?(id: string): Promise<NodeSkeleton | null>;
  /** 全量加载文档页(dynamic-page 下跨页遍历 / documentchange 的前置) */
  loadAllPagesAsync?(): Promise<void>;
  /** dynamic-page 下 `currentPage` 变为只读,切页只能走异步 */
  setCurrentPageAsync?(page: PageSkeleton): Promise<void>;
  loadFontAsync(font: shared.FontName): Promise<void>;
  listAvailableFontsAsync(): Promise<{ fontName: shared.FontName }[]>;

  /** 插件外壳:UI 生命周期 / 事件订阅 / 消息收发(两平台同构) */
  showUI(html: string, options: { width?: number; height?: number }): void;
  /**
   * 本地样式枚举:同步 getter 为两平台 PluginAPI 原生符号,`*Async` 为
   * dynamic-page 下的替代入口(Figma 有、jsDesign 无,登记为缺口)。
   */
  getLocalPaintStyles?(): readonly StyleSummary[];
  getLocalTextStyles?(): readonly StyleSummary[];
  getLocalEffectStyles?(): readonly StyleSummary[];
  getLocalGridStyles?(): readonly StyleSummary[];
  getLocalPaintStylesAsync?(): Promise<readonly StyleSummary[]>;
  getLocalTextStylesAsync?(): Promise<readonly StyleSummary[]>;
  getLocalEffectStylesAsync?(): Promise<readonly StyleSummary[]>;
  getLocalGridStylesAsync?(): Promise<readonly StyleSummary[]>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  /**
   * 宿主键值存储(0016 的语言选择持久化)。两平台符号同名同签名:
   * `figma.clientStorage` / `jsDesign.clientStorage`,方法都是 `*Async`。
   *
   * 声明为**可选**、且各方法都可能是**声明存在而运行时未实现** —— jsDesign 的这份
   * typings 是从 Figma API fork 来的(文件头写着 "Figma Plugin API version 1, update 40"),
   * 所以判据必须是 `typeof host.clientStorage?.getAsync === 'function'`,
   * 且调用点要 `try/catch`。拿不到就退化为「本次会话内有效」,不允许因此让面板起不来。
   *
   * 按 0010 一律异步:即使某个平台内部同步也标 Promise,调用点已 await。
   */
  readonly clientStorage?: {
    getAsync(key: string): Promise<unknown>;
    setAsync(key: string, value: unknown): Promise<void>;
    deleteAsync(key: string): Promise<void>;
  };
  readonly ui: {
    postMessage(message: unknown): void;
    onmessage: ((message: unknown) => void) | null;
    /**
     * 面板自改尺寸(docs/design-decisions/0014)。两平台符号同名:
     * Figma `figma.ui.resize(width, height)`、jsDesign `UIAPI.resize`。
     *
     * 声明为**可选**:宿主未提供时插件外壳照常工作,只是面板停在
     * `PANEL_HEIGHT_DEFAULT` —— UI 侧据此降级为「选中节点吃满剩余高度」的
     * 填充布局(见 UiEnvMessage)。缺符号不报错,所以判据必须是
     * `typeof host.ui.resize === 'function'`,不能只看属性是否存在。
     */
    resize?(width: number, height: number): void;
  };
}

/** 混合值:'figma.mixed' 两平台一致,抽为常量 */
export const MIXED = 'figma.mixed';

/** 流程级平台特有操作:由各平台模块实现,plugin.ts 分发,MCP 走 platform_op 通道 */
export interface PlatformOp {
  name: string;
  title: string;
  description: string;
  /**
   * 可选参数 schema(zod):插件分发前做边界校验,失败直接回结构化错误,
   * 避免 LLM 传错形状时在实现深层炸出难懂的错。
   */
  inputSchema?: z.ZodType;
  /**
   * 一律异步(0010):声明为 `Promise<unknown>`,实现方即使内部全同步也标 `async`。
   * 分发的唯一调用点已 `await`(plugin.ts),收紧类型不改变行为,只把契约钉死。
   */
  run(host: DesignHost, params: unknown): Promise<unknown>;
}

/** 平台元数据:adapter 所在平台声明的能力与特有操作(registerPlugin 第三参注入) */
export interface PlatformMeta {
  capabilities: readonly shared.HostCapability[];
  platformOps: readonly PlatformOp[];
}
