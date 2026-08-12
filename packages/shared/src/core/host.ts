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
  booleanOperation?: 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';
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
  variantProperties?: Record<string, string>;
  variantGroupProperties?: Record<string, { values: readonly string[] }>;

  exportAsync(settings: unknown): Promise<Uint8Array>;
  createInstance(): NodeSkeleton;
  detachInstance(): NodeSkeleton;
  swapComponent(component: NodeSkeleton): void;
  setProperties(properties: Record<string, string>): void;
  outlineStroke(): NodeSkeleton | null;
  ungroup(): void;

  /** ---- 平台特有超集(仅对应平台运行时存在,如 Figma;其他平台恒 undefined) ---- */
  textTruncation?: 'DISABLED' | 'ENDING';
  maxLines?: number;
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
  componentProperties?: Record<string, shared.ComponentPropertyValue>;
  getMainComponentAsync?(): Promise<NodeSkeleton>;
  resetOverrides?(): void;
  removeOverrides?(): void;
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
  findAllWithCriteria(options: {
    types: readonly shared.NodeType[];
  }): NodeSkeleton[];
}

/** 平台全局(jsDesign.* / figma.*)的窄化接口 */
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
  createNodeFromSvg(svg: string): NodeSkeleton;
  createImage(bytes: Uint8Array): { hash: string };

  readonly currentPage: PageSkeleton;
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

  getNodeById(id: string): NodeSkeleton | null;
  loadFontAsync(font: shared.FontName): Promise<void>;
  listAvailableFontsAsync(): Promise<{ fontName: shared.FontName }[]>;

  /** 插件外壳:UI 生命周期 / 事件订阅 / 消息收发(两平台同构) */
  showUI(html: string, options: { width?: number; height?: number }): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  readonly ui: {
    postMessage(message: unknown): void;
    onmessage: ((message: unknown) => void) | null;
  };
}

/** 混合值:'figma.mixed' 两平台一致,抽为常量 */
export const MIXED = 'figma.mixed';

/** 流程级平台特有操作:由各平台模块实现,plugin.ts 分发,MCP 走 platform_op 通道 */
export interface PlatformOp {
  name: string;
  title: string;
  description: string;
  run(host: DesignHost, params: unknown): Promise<unknown> | unknown;
}

/** 平台元数据:adapter 所在平台声明的能力与特有操作(registerPlugin 第三参注入) */
export interface PlatformMeta {
  capabilities: readonly shared.HostCapability[];
  platformOps: readonly PlatformOp[];
}
