import type { DesignHost, NodeSkeleton } from '../core/host';

/**
 * 测试用假节点与假宿主。
 *
 * 关键点:这里的字段集合决定了 core 里那批 `if (x != null && 'x' in node)` 走哪条分支,
 * 所以按**节点类型**给真实字段集合,而不是给一个全能对象 —— 否则会伪造出「给 TEXT
 * 写 strokeCap 也能生效」这种运行时不存在的行为。
 */

/** 所有节点都有的几何/结构/绘制基础字段 */
function visualBase() {
  return {
    width: 100,
    height: 100,
    visible: true,
    opacity: 1,
    locked: false,
    rotation: 0,
    parent: null as NodeSkeleton | null,
    fills: null as NodeSkeleton['fills'],
    strokes: null as NodeSkeleton['strokes'],
    strokeWeight: 1,
    strokeAlign: 'CENTER' as const,
    strokeCap: 'NONE' as const,
    strokeJoin: 'MITER' as const,
    dashPattern: [] as readonly number[],
    effects: [] as NodeSkeleton['effects'],
    constraints: { horizontal: 'MIN', vertical: 'MIN' } as const,
  };
}

function common(id: string, name: string) {
  return {
    id,
    name,
    x: 0,
    y: 0,
    ...visualBase(),
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    remove() {},
    clone() {
      return this as unknown as NodeSkeleton;
    },
    exportAsync: async () => new Uint8Array(0),
    createInstance: () => null as unknown as NodeSkeleton,
    detachInstance: () => null as unknown as NodeSkeleton,
    swapComponent() {},
    setProperties() {},
    outlineStroke: () => null,
    appendChild(child: NodeSkeleton) {
      const self = this as unknown as { children: NodeSkeleton[] };
      self.children = [...(self.children ?? []), child];
      child.parent = this as unknown as NodeSkeleton;
    },
    insertChild(index: number, child: NodeSkeleton) {
      const self = this as unknown as { children: NodeSkeleton[] };
      const kids = [...(self.children ?? [])];
      kids.splice(index, 0, child);
      self.children = kids;
      child.parent = this as unknown as NodeSkeleton;
    },
  };
}

export function makeRect(id = '1:1', name = 'rect'): NodeSkeleton {
  return {
    type: 'RECTANGLE',
    ...common(id, name),
    cornerRadius: 0,
    cornerSmoothing: 0,
    topLeftRadius: 0,
    topRightRadius: 0,
    bottomLeftRadius: 0,
    bottomRightRadius: 0,
  } as unknown as NodeSkeleton;
}

export function makeFrame(id = '2:1', name = 'frame'): NodeSkeleton {
  return {
    type: 'FRAME',
    ...common(id, name),
    children: [],
    clipsContent: false,
    layoutGrids: [],
    layoutMode: 'NONE',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    primaryAxisSizingMode: 'FIXED',
    counterAxisSizingMode: 'FIXED',
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    layoutGrow: 0,
    cornerRadius: 0,
    topLeftRadius: 0,
    topRightRadius: 0,
    bottomLeftRadius: 0,
    bottomRightRadius: 0,
  } as unknown as NodeSkeleton;
}

export function makeText(id = '3:1', name = 'text'): NodeSkeleton {
  return {
    type: 'TEXT',
    ...common(id, name),
    characters: '',
    fontSize: 16,
    fontName: { family: 'PingFang SC', style: 'Regular' },
    textAlignHorizontal: 'LEFT',
    textAlignVertical: 'TOP',
    textAutoResize: 'NONE',
    textCase: 'ORIGINAL',
    textDecoration: 'NONE',
  } as unknown as NodeSkeleton;
}

export function makeLine(id = '4:1', name = 'line'): NodeSkeleton {
  return { type: 'LINE', ...common(id, name) } as unknown as NodeSkeleton;
}

export function makeInstance(id = '5:1', name = 'instance'): NodeSkeleton {
  // type 必须放在展开之后:makeFrame 自带 type:'FRAME',放前面会被它覆盖
  return {
    ...makeFrame(id, name),
    type: 'INSTANCE',
    mainComponent: null,
  } as unknown as NodeSkeleton;
}

/** 按 id 挂到父节点下(建立 parent 链 + children) */
export function attach(
  parent: NodeSkeleton,
  ...children: NodeSkeleton[]
): NodeSkeleton {
  for (const c of children) {
    parent.appendChild?.(c);
  }
  return parent;
}

export interface FakeHost extends DesignHost {
  /** 字体加载调用序列:用于断言「加载必须先于逐属性赋值」 */
  fontCalls: { family: string; style: string }[];
  /** 已注册节点(按 id 索引) */
  registry: Map<string, NodeSkeleton>;
}

/** 构造一个够用的假宿主;selection 缺省为 registry 里的全部节点 */
export function makeHost(nodes: readonly NodeSkeleton[] = []): FakeHost {
  const registry = new Map(nodes.map((n) => [n.id, n]));
  const page = {
    name: 'page',
    selection: nodes,
    children: nodes,
    appendChild(child: NodeSkeleton) {
      this.children = [...this.children, child];
      registry.set(child.id, child);
    },
    insertChild(child: NodeSkeleton) {
      this.children = [child, ...this.children];
      registry.set(child.id, child);
    },
    findOne: (fn: (n: NodeSkeleton) => boolean) =>
      registry.size > 0 ? ([...registry.values()].find(fn) ?? null) : null,
    findAll: () => [...registry.values()],
    findAllWithCriteria: () => [...registry.values()],
  };
  const fontCalls: { family: string; style: string }[] = [];
  const host = {
    fontCalls,
    registry,
    createFrame: () => makeFrame(`${registry.size + 1}:frame`),
    createRectangle: () => makeRect(`${registry.size + 1}:rect`),
    createEllipse: () => makeRect(`${registry.size + 1}:ellipse`),
    createText: () => makeText(`${registry.size + 1}:text`),
    createLine: () => makeLine(`${registry.size + 1}:line`),
    createPolygon: () => makeRect(`${registry.size + 1}:polygon`),
    createStar: () => makeRect(`${registry.size + 1}:star`),
    createVector: () => makeRect(`${registry.size + 1}:vector`),
    createComponent: () => makeInstance(`${registry.size + 1}:component`),
    createNodeFromSvg: () => makeFrame(`${registry.size + 1}:svg`),
    createImage: () => ({ hash: 'h' }),
    currentPage: page as unknown as DesignHost['currentPage'],
    viewport: {
      center: { x: 500, y: 500 },
      scrollAndZoomIntoView() {},
    },
    union: () => makeFrame('9:union'),
    subtract: () => makeFrame('9:subtract'),
    intersect: () => makeFrame('9:intersect'),
    exclude: () => makeFrame('9:exclude'),
    flatten: () => makeFrame('9:flatten'),
    combineAsVariants: () => makeFrame('9:variants'),
    importComponentByKeyAsync: async () => makeFrame('9:imported'),
    getNodeById: (id: string) => registry.get(id) ?? null,
    loadFontAsync: async (font: { family: string; style: string }) => {
      fontCalls.push({ family: font.family, style: font.style });
    },
    listAvailableFontsAsync: async () => [],
    showUI() {},
    on() {},
    ui: { postMessage() {}, onmessage: null },
  };
  return host as unknown as FakeHost;
}
