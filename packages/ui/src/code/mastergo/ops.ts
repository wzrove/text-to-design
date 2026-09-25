import {
  type DesignHost,
  type PlatformOp,
  resolveNodes,
} from 'text-to-design-shared';
import { z } from 'zod';

/**
 * MasterGo 特有流程级操作:走 MCP 的 `platform_op` 通用通道(与 figma/ops.ts 同一套契约)。
 *
 * 为什么只有 MasterGo 需要这几个 op:MG **不会**把组件的子文本自动暴露成 `TEXT` 属性
 * (真机实测,见 0019),而 Figma 侧早有 `figma_component_properties_set` 这一档 ——
 * 没有「建属性」的入口,`jsd_set_instance_properties` 的布尔/文本/换绑路径就永远是空的。
 *
 * 依据(均为 `@mastergo/plugin-typings` 的 `ComponentPropertiesMixin`):
 * - `addComponentProperty(propertyName, type: Exclude<ComponentPropertyType,'VARIANT'>, defaultValue, options?)`
 *   → 返回新属性 id(typings 3003 行);
 * - `editComponentProperty(propertyId, { name?, defaultValue?, preferredValues?, alias? })`(3011 行);
 * - `deleteComponentProperty(propertyId): void`(3028 行);
 * - `componentPropertyValues`(2997 行)是读回的唯一入口,已在门面投影成契约的
 *   `componentProperties`(见 node-facade 的 readValue)。
 *
 * 每个 op 都**写完回读**(本平台有「回包成功、值没变」的前科:变体值那两条入口,见 0018),
 * 对不上就抛错 —— 不把静默失效漏给调用方。
 */

/** 可建/可改的组件属性类型(`VARIANT` 由变体集自己产生,不在本组 op 范围) */
const PROPERTY_TYPES = ['BOOLEAN', 'TEXT', 'INSTANCE_SWAP'] as const;

const preferredValuesSchema = z
  .array(
    z.object({
      type: z.enum(['COMPONENT', 'COMPONENT_SET']),
      key: z.string(),
    }),
  )
  .optional()
  .describe(
    'INSTANCE_SWAP 的候选组件({type: COMPONENT|COMPONENT_SET, key}),可省',
  );

const addPropertySchema = z.object({
  nodeIds: z
    .array(z.string())
    .min(1)
    .describe('要加属性的组件(COMPONENT / COMPONENT_SET)节点 id'),
  name: z.string().min(1).describe('属性名(实例侧就用这个名字写值)'),
  type: z.enum(PROPERTY_TYPES),
  defaultValue: z
    .union([z.string(), z.boolean()])
    .describe('BOOLEAN 用布尔,TEXT/INSTANCE_SWAP 用字符串'),
  preferredValues: preferredValuesSchema,
});

const editPropertySchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  propertyId: z
    .string()
    .min(1)
    .describe(
      '属性 id;MG 运行时通常**不给 id**(见 0018),此时传属性名即可 —— 读回的 componentProperties 里的键',
    ),
  name: z.string().min(1).optional(),
  defaultValue: z.union([z.string(), z.boolean()]).optional(),
  preferredValues: preferredValuesSchema,
});

const listSublayersSchema = z.object({
  nodeId: z.string().min(1).describe('组件 / 实例(或任意容器)节点 id'),
  type: z.string().optional().describe('只列某类子层,如 TEXT / FRAME'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('最多返回几个,默认 50'),
});

const bindPropertySchema = z
  .object({
    nodeIds: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        '要绑定的**图层** id(组件内部的子图层)。与 `target` 二选一 —— 内部图层 id 通常拿不到(见 mg_list_sublayers),优先用 `target`',
      ),
    target: z
      .object({
        type: z.string().optional().describe('子层类型,如 TEXT / FRAME'),
        name: z.string().optional().describe('子层名字(包含匹配)'),
        index: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('命中多个时取第几个,默认 0'),
      })
      .optional()
      .describe('按条件在组件内部找目标图层(走 findChildren,不需要 id)'),
    componentId: z
      .string()
      .min(1)
      .describe('属性所属的组件 id(用于把属性名解析成 propertyId)'),
    propertyId: z.string().min(1).describe('属性名或 propertyId'),
    slot: z
      .enum(['characters', 'isVisible', 'mainComponent'])
      .describe(
        '绑定位置(对应 typings `componentPropertyReferences` 的三个槽):characters=文本内容随属性变;isVisible=显隐随属性变;mainComponent=**实例的主组件随属性换绑**(配 INSTANCE_SWAP 属性用)',
      ),
    unbind: z
      .boolean()
      .optional()
      .describe('true=解绑(移除该位置的引用),默认 false'),
  })
  .refine((v) => v.nodeIds != null || v.target != null, {
    message: 'nodeIds 与 target 至少要给一个',
  });

const deletePropertySchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  propertyId: z.string().min(1).describe('属性 id(或属性名,见上)'),
});

/** 组件侧属性(宿主对象)上的 op 能力,只声明用到的部分 */
interface PropertyHostNode {
  id: string;
  type?: string;
  name?: string;
  componentPropertyValues?: unknown;
  addComponentProperty?: (
    name: string,
    type: string,
    defaultValue: string | boolean,
    options?: { preferredValues?: Array<{ type: string; key: string }> },
  ) => string;
  editComponentProperty?: (
    propertyId: string,
    next: {
      name?: string;
      defaultValue?: string | boolean;
      preferredValues?: Array<{ type: string; key: string }>;
    },
  ) => string;
  deleteComponentProperty?: (propertyId: string) => void;
  componentPropertyReferences?: {
    isVisible?: string;
    characters?: string;
    mainComponent?: string;
  } | null;
  /** 逐节点遍历(typings 的 `ChildrenMixin`,2419–2425):绕开读不到的 `children` */
  /**
   * 逐节点遍历(typings 的 `ChildrenMixin`,2419–2425):绕开读不到的 `children`。
   * `findAll` 是**深度**遍历(与 Figma 同语义),`findChildren`/`findChild` 只看**直接子层**
   * —— 这条差别是实测出来的:一层套一层时 `findChildren` 找不到里面的 TEXT。
   */
  findAll?: (cb?: (n: RawLayer) => boolean) => RawLayer[];
  findOne?: (cb?: (n: RawLayer) => boolean) => RawLayer | null;
  findChildren?: (cb?: (n: RawLayer) => boolean) => RawLayer[];
  findChild?: (cb: (n: RawLayer) => boolean) => RawLayer | null;
  children?: RawLayer[];
}

/** 子层的最小读面(用于筛选与回读) */
interface RawLayer {
  id: string;
  type?: string;
  name?: string;
  characters?: string;
  isVisible?: boolean;
  /** 组件/组件集的发布 key(typings `PublishableMixin.ukey`,1805)——INSTANCE_SWAP 取值候选 */
  ukey?: string;
  /**
   * 实例的主组件 id(运行时字段 `mainComponentId`,见 0017)。
   * ⚠️ 实测:**实例内部的实例子层**读不到它(外层实例可以),所以内层换绑的判据用 `width`。
   */
  mainComponentId?: string;
  width?: number;
  height?: number;
  children?: RawLayer[];
  findAll?: (cb?: (n: RawLayer) => boolean) => RawLayer[];
  findChildren?: (cb?: (n: RawLayer) => boolean) => RawLayer[];
}

interface PropertyEntry {
  name: string;
  id: string;
  type: string;
  value: unknown;
  /** 换绑候选(读回原样,用来核实 `preferredValues` 是否真落库) */
  preferredValues?: Array<{ type: string; key: string }>;
}

/**
 * 读回组件侧属性表(原始形状,不经门面投影)。
 *
 * 键用**属性名**:调用方与 op 参数都用名字,id 只在调宿主方法时要(真机实测:项里
 * `name` 与 `id` 都有 —— `显示图标` / `20:395`,见 0019 复验)。id 同时留在条目里,
 * `resolveProperty` 两种都能收。
 */
function readTable(node: PropertyHostNode): Map<string, PropertyEntry> {
  const raw = node.componentPropertyValues;
  const out = new Map<string, PropertyEntry>();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const it = item as {
      name?: unknown;
      id?: unknown;
      type?: unknown;
      defaultValue?: unknown;
    };
    if (typeof it.name !== 'string' || it.name === '') continue;
    const entry: PropertyEntry = {
      name: it.name,
      id: typeof it.id === 'string' ? it.id : it.name,
      type: String(it.type),
      value: it.defaultValue,
    };
    const preferred = (item as { preferredValues?: unknown }).preferredValues;
    if (Array.isArray(preferred)) {
      const list = preferred.flatMap((pv) => {
        if (pv == null || typeof pv !== 'object') return [];
        const v = pv as { type?: unknown; key?: unknown };
        return typeof v.type === 'string' && typeof v.key === 'string'
          ? [{ type: v.type, key: v.key }]
          : [];
      });
      if (list.length > 0) entry.preferredValues = list;
    }
    out.set(it.name, entry);
  }
  return out;
}

/** 把 op 入参的 `propertyId` 解析成条目:先按 id 精确匹配,再按名字 */
function resolveProperty(
  table: Map<string, PropertyEntry>,
  key: string,
): PropertyEntry | null {
  for (const entry of table.values()) {
    if (entry.id === key) return entry;
  }
  return table.get(key) ?? null;
}

/** 属性表键清单(报错用):`显示图标(id 20:395)、文案(id 20:396)` */
const listKeys = (table: Map<string, PropertyEntry>): string =>
  [...table.values()].map((e) => `${e.name}(id ${e.id})`).join('、') || '无';

/**
 * 枚举一个节点的**内部子层**。
 *
 * 为什么不能读 `children`:真机实测组件/实例的 `children` 读不到(MG 不透出 symbol 内部结构),
 * 而 typings 的 `ChildrenMixin`(2419–2425)提供了**逐节点遍历**入口 `findChildren()`,
 * 走这条才拿得到内部图层。三条路依次尝试,并把**用的哪条**回给调用方(诊断用)。
 */
function listSublayers(node: RawLayer): { layers: RawLayer[]; source: string } {
  // ① 深度遍历优先:`findAll`(typings 2424,与 Figma 的 findAll 同语义,含所有后代)
  if (typeof node.findAll === 'function') {
    const all = node.findAll();
    if (Array.isArray(all) && all.length > 0) {
      return { layers: all, source: 'findAll(含后代)' };
    }
  }
  // ② 直接子层 + 自己往后展开(`findChildren` 只看一层,实测会漏掉嵌套的子层)
  if (typeof node.findChildren === 'function') {
    const direct = node.findChildren();
    if (Array.isArray(direct) && direct.length > 0) {
      const out: RawLayer[] = [];
      const walk = (n: RawLayer) => {
        const kids = n.findChildren?.() ?? n.children ?? [];
        for (const c of kids) {
          out.push(c);
          walk(c);
        }
      };
      for (const d of direct) {
        out.push(d);
        walk(d);
      }
      return { layers: out, source: 'findChildren(递归展开)' };
    }
    return { layers: [], source: 'findChildren(空)' };
  }
  // ③ 兜底:children 能读的平台(另两平台)走这条
  if (Array.isArray(node.children) && node.children.length > 0) {
    const out: RawLayer[] = [];
    const walk = (n: RawLayer) => {
      for (const c of n.children ?? []) {
        out.push(c);
        walk(c);
      }
    };
    walk(node);
    return { layers: out, source: 'children(递归)' };
  }
  return { layers: [], source: '无可用遍历入口' };
}

/** 子层匹配描述(调用方不必先知道图层 id) */
interface LayerQuery {
  type?: string;
  name?: string;
  index?: number;
}

const matchesQuery = (layer: RawLayer, q: LayerQuery): boolean => {
  if (q.type != null && layer.type !== q.type) return false;
  if (q.name != null && !(layer.name ?? '').includes(q.name)) return false;
  return true;
};

/** 取要操作的组件节点(必须带组件属性 mixin 的能力,否则直接报错) */
async function resolvePropertyHosts(
  host: DesignHost,
  nodeIds: string[],
  need: 'add' | 'edit' | 'delete',
): Promise<PropertyHostNode[]> {
  const nodes = (await resolveNodes(
    host,
    nodeIds,
  )) as unknown as PropertyHostNode[];
  if (nodes.length === 0) throw new Error('没有找到要操作的节点');
  const field =
    need === 'add'
      ? 'addComponentProperty'
      : need === 'edit'
        ? 'editComponentProperty'
        : 'deleteComponentProperty';
  const usable = nodes.filter((n) => typeof n[field] === 'function');
  if (usable.length === 0) {
    throw new Error(
      `这些节点没有组件属性能力(${field} 不存在):只有 COMPONENT / COMPONENT_SET 有。请传组件节点 id`,
    );
  }
  return usable;
}

async function addComponentProperty(
  host: DesignHost,
  params: unknown,
): Promise<{ created: Array<{ nodeId: string; propertyId: string }> }> {
  const p = params as {
    nodeIds: string[];
    name: string;
    type: string;
    defaultValue: string | boolean;
    preferredValues?: Array<{ type: string; key: string }>;
  };
  const nodes = await resolvePropertyHosts(host, p.nodeIds, 'add');
  const created: Array<{ nodeId: string; name: string; propertyId: string }> =
    [];
  for (const node of nodes) {
    const before = readTable(node);
    if (before.has(p.name)) {
      throw new Error(
        `组件已存在同名属性「${p.name}」(现有:${listKeys(before)})。改名或先删`,
      );
    }
    const options = p.preferredValues
      ? { preferredValues: p.preferredValues }
      : undefined;
    const propertyId = node.addComponentProperty?.(
      p.name,
      p.type,
      p.defaultValue,
      options,
    );
    // 回读校验:新增的属性必须真的出现在属性表里,且类型对得上(不静默)
    const after = readTable(node);
    const got = after.get(p.name);
    if (got == null) {
      throw new Error(
        `新增属性「${p.name}」后回读不到(期望出现在 componentPropertyValues,实际:${listKeys(after)})。宿主可能静默忽略`,
      );
    }
    if (got.type !== p.type) {
      throw new Error(
        `新增属性「${p.name}」类型不符:期望 ${p.type},回读 ${got.type}`,
      );
    }
    created.push({
      nodeId: node.id,
      name: got.name,
      propertyId: propertyId ?? got.id,
      ...(got.preferredValues != null
        ? { preferredValues: got.preferredValues }
        : {}),
    });
  }
  return { created };
}

async function editComponentProperty(
  host: DesignHost,
  params: unknown,
): Promise<{ updated: Array<{ nodeId: string; propertyId: string }> }> {
  const p = params as {
    nodeIds: string[];
    propertyId: string;
    name?: string;
    defaultValue?: string | boolean;
    preferredValues?: Array<{ type: string; key: string }>;
  };
  const nodes = await resolvePropertyHosts(host, p.nodeIds, 'edit');
  const updated: Array<{ nodeId: string; name: string; propertyId: string }> =
    [];
  for (const node of nodes) {
    const before = readTable(node);
    const target = resolveProperty(before, p.propertyId);
    if (target == null) {
      throw new Error(
        `组件没有属性「${p.propertyId}」(现有:${listKeys(before)})。用 jsd_find 读 componentProperties 的键(名字或 id 都收)`,
      );
    }
    const next: {
      name?: string;
      defaultValue?: string | boolean;
      preferredValues?: Array<{ type: string; key: string }>;
    } = {};
    if (p.name != null) next.name = p.name;
    if (p.defaultValue != null) next.defaultValue = p.defaultValue;
    if (p.preferredValues != null) next.preferredValues = p.preferredValues;
    if (Object.keys(next).length === 0) {
      throw new Error(
        '没有要改的内容(name / defaultValue / preferredValues 至少给一个)',
      );
    }
    // 宿主收的是 propertyId(真机:名字传进去匹配不上),所以这里换成 id
    const propertyId = node.editComponentProperty?.(target.id, next);
    const after = readTable(node);
    const expectedName = p.name ?? target.name;
    const got = after.get(expectedName);
    if (got == null) {
      throw new Error(
        `改属性「${p.propertyId}」后回读不到(期望名字「${expectedName}」,实际:${listKeys(after)})`,
      );
    }
    if (p.defaultValue != null && got.value !== p.defaultValue) {
      throw new Error(
        `改属性默认值后回读不一致:期望 ${JSON.stringify(p.defaultValue)},回读 ${JSON.stringify(got.value)}`,
      );
    }
    updated.push({
      nodeId: node.id,
      name: got.name,
      propertyId: propertyId ?? got.id,
      ...(got.preferredValues != null
        ? { preferredValues: got.preferredValues }
        : {}),
    });
  }
  return { updated };
}

async function deleteComponentProperty(
  host: DesignHost,
  params: unknown,
): Promise<{ removed: string[] }> {
  const p = params as { nodeIds: string[]; propertyId: string };
  const nodes = await resolvePropertyHosts(host, p.nodeIds, 'delete');
  const removed: string[] = [];
  for (const node of nodes) {
    const before = readTable(node);
    const target = resolveProperty(before, p.propertyId);
    if (target == null) {
      throw new Error(
        `组件没有属性「${p.propertyId}」(现有:${listKeys(before)})`,
      );
    }
    node.deleteComponentProperty?.(target.id);
    const after = readTable(node);
    if (after.has(target.name)) {
      throw new Error(`删属性「${target.name}」后回读仍在 —— 宿主可能静默忽略`);
    }
    removed.push(node.id);
  }
  return { removed };
}

/**
 * 绑定/解绑:把组件内部的图层挂到某个属性上。
 *
 * 为什么非要有这条(typings 2402–2410 的 `SceneNodeMixin`):
 * 只是 `addComponentProperty` 建出来的属性**不驱动任何东西** —— 要让「文本内容」或「显隐」
 * 真的跟着实例属性变,必须在**组件内的那个图层**上写 `componentPropertyReferences`
 * (`characters` / `isVisible` 指向 propertyId)。这也解释了为什么实例侧属性表读不到值:
 * MG 的实例 `componentProperties` 是空表,值要么体现在绑定的图层上,要么根本读不出来。
 * 所以绑完要**回读 `componentPropertyReferences` 校验**,再用图层自身的变化做最终判据。
 */
async function bindComponentProperty(
  host: DesignHost,
  params: unknown,
): Promise<{
  bound: Array<{ nodeId: string; slot: string; propertyId: string }>;
}> {
  const p = params as {
    nodeIds?: string[];
    target?: LayerQuery;
    componentId: string;
    propertyId: string;
    slot: 'characters' | 'isVisible' | 'mainComponent';
    unbind?: boolean;
  };
  const component = (await resolveNodes(host, [p.componentId])) as unknown as
    | PropertyHostNode[]
    | undefined;
  const comp = component?.[0];
  if (comp == null) throw new Error(`找不到组件 ${p.componentId}`);
  const table = readTable(comp);
  const entry = resolveProperty(table, p.propertyId);
  if (entry == null) {
    throw new Error(`组件没有属性「${p.propertyId}」(现有:${listKeys(table)})`);
  }
  // 目标图层:给了 id 就用 id;给了描述就用组件上的 findChildren 找(调用方拿不到内部 id 时用这条)
  let layers: Array<PropertyHostNode & { id: string }>;
  if (p.nodeIds != null && p.nodeIds.length > 0) {
    layers = (await resolveNodes(host, p.nodeIds)) as unknown as Array<
      PropertyHostNode & { id: string }
    >;
  } else {
    const { layers: inner, source } = listSublayers(comp as RawLayer);
    const hits = inner.filter((l) => matchesQuery(l, p.target ?? {})) as Array<
      PropertyHostNode & { id: string }
    >;
    const index = p.target?.index ?? 0;
    const picked = hits[index];
    if (picked == null) {
      throw new Error(
        `组件内部找不到匹配 ${JSON.stringify(p.target ?? {})} 的子层(遍历入口:${source},共 ${inner.length} 个:${
          inner.map((l) => `${l.name}(${l.type})`).join('、') || '无'
        })。先用 mg_list_sublayers 看有哪些子层`,
      );
    }
    layers = [picked];
  }
  if (layers.length === 0) throw new Error('没有找到要绑定的图层');
  const bound: Array<{ nodeId: string; slot: string; propertyId: string }> = [];
  for (const layer of layers) {
    const current = layer.componentPropertyReferences ?? {};
    const next = { ...current };
    if (p.unbind === true) delete next[p.slot];
    else next[p.slot] = entry.id;
    layer.componentPropertyReferences = next;
    // 回读校验:绑定写没写进去(本平台有「回包成功、值没变」的前科)
    const after = layer.componentPropertyReferences ?? {};
    if (p.unbind === true) {
      if (after[p.slot] != null) {
        throw new Error(`解绑后回读仍有引用(${p.slot}=${after[p.slot]})`);
      }
    } else if (after[p.slot] !== entry.id) {
      throw new Error(
        `绑定后回读不一致:期望 ${p.slot}=${entry.id},实际 ${after[p.slot] ?? '(空)'}`,
      );
    }
    bound.push({ nodeId: layer.id, slot: p.slot, propertyId: entry.id });
  }
  return { bound };
}

/**
 * 列出节点的**内部子层**(含 `characters` / `isVisible` 回读)。
 *
 * 存在的理由:MG 的组件/实例读不到 `children`,`jsd_find` 也就列不出内部图层 —— 调用方
 * 既拿不到「属性该绑到哪个层」,也没法看「实例属性写下去后那个层变了没有」。
 * 本 op 走 `findChildren`(typings 2419)把这条补齐,顺带回读这两个关键字段。
 */
async function listSublayersOp(
  host: DesignHost,
  params: unknown,
): Promise<{
  source: string;
  total: number;
  /** 容器自身(组件/实例)的关键字段:判 INSTANCE_SWAP 取值格式要它 */
  node: {
    id: string;
    type?: string;
    name?: string;
    ukey?: string;
    mainComponentId?: string;
  };
  sublayers: Array<{
    id: string;
    type?: string;
    name?: string;
    characters?: string;
    isVisible?: boolean;
    ukey?: string;
    mainComponentId?: string;
    width?: number;
    height?: number;
  }>;
}> {
  const p = params as { nodeId: string; type?: string; limit?: number };
  const nodes = (await resolveNodes(host, [p.nodeId])) as unknown as RawLayer[];
  const node = nodes[0];
  if (node == null) throw new Error(`找不到节点 ${p.nodeId}`);
  const { layers, source } = listSublayers(node);
  const filtered =
    p.type != null ? layers.filter((l) => l.type === p.type) : layers;
  const limit = p.limit ?? 50;
  return {
    source,
    node: {
      id: node.id,
      type: node.type,
      name: node.name,
      ...(node.ukey !== undefined ? { ukey: node.ukey } : {}),
      ...(node.mainComponentId !== undefined
        ? { mainComponentId: node.mainComponentId }
        : {}),
    },
    total: filtered.length,
    sublayers: filtered.slice(0, limit).map((l) => ({
      id: l.id,
      type: l.type,
      name: l.name,
      ...(l.characters !== undefined ? { characters: l.characters } : {}),
      ...(l.isVisible !== undefined ? { isVisible: l.isVisible } : {}),
      ...(l.ukey !== undefined ? { ukey: l.ukey } : {}),
      // 实例子层带上主组件 id:这是「INSTANCE_SWAP 属性换了绑没有」的唯一读法(实测)
      ...(l.mainComponentId !== undefined
        ? { mainComponentId: l.mainComponentId }
        : {}),
      // 尺寸也带上:内层实例子层读不到 mainComponentId 时,「换绑成功没有」靠尺寸差判(实测)
      ...(l.width !== undefined ? { width: l.width } : {}),
      ...(l.height !== undefined ? { height: l.height } : {}),
    })),
  };
}

export const mastergoOps: PlatformOp[] = [
  {
    name: 'mg_list_sublayers',
    title: '列出内部子层',
    description:
      'MasterGo 特有:列出组件 / 实例(或任意容器)的**内部子层**,含 `characters` / `isVisible` 回读,实例子层另带 `mainComponentId` 与尺寸。params: { nodeId, type?, limit? }。**为什么需要它**:MG 的组件/实例**读不到 `children`**(同 mixin 的 `findAll` / `findChildren` 才可用,`findChildren` 只搜一层),`jsd_find` 也就列不出内部图层 —— 所以「属性该绑到哪个层」与「写实例属性后那个层变没变」都得靠这条;`mg_bind_component_property` 的 `target` 描述也据此写',
    inputSchema: listSublayersSchema,
    run: listSublayersOp,
  },
  {
    name: 'mg_add_component_property',
    title: '新增组件属性',
    description:
      'MasterGo 特有:给组件新增一个可写属性(组件上的布尔/文本/换绑开关)。params: { nodeIds(组件节点 id), name, type: BOOLEAN|TEXT|INSTANCE_SWAP, defaultValue(BOOLEAN 用布尔,其余用字符串), preferredValues?([{type: COMPONENT|COMPONENT_SET, key}],仅 INSTANCE_SWAP) }。写完回读校验;建好后用 jsd_create_instance + jsd_set_instance_properties 写实例值(属性名就是这里给的 name)。**MG 不会把子文本自动暴露成 TEXT 属性,所以这是唯一的建属性入口**',
    inputSchema: addPropertySchema,
    run: addComponentProperty,
  },
  {
    name: 'mg_edit_component_property',
    title: '修改组件属性',
    description:
      'MasterGo 特有:改组件属性的名字 / 默认值 / 换绑候选。params: { nodeIds, propertyId(属性 id;MG 运行时通常不给 id,传属性名即可), name?, defaultValue?, preferredValues? }',
    inputSchema: editPropertySchema,
    run: editComponentProperty,
  },
  {
    name: 'mg_bind_component_property',
    title: '绑定图层到属性',
    description:
      'MasterGo 特有:把**组件内部的图层**绑到某个组件属性上,让属性真的驱动它。params: { componentId, propertyId(属性名或 id), slot: characters|isVisible, target?({type?,name?,index?} 按条件找子层,**推荐**), nodeIds?(已知子层 id 时可用), unbind?(true=解绑) }。目标图层走 `findChildren` 解析(内部 id 通常拿不到,先用 mg_list_sublayers 看有哪些子层)。**只 add 属性不绑定,属性不驱动任何东西**(typings 的 `componentPropertyReferences`);绑完回读校验。判据:改实例属性后看那个图层的 characters / isVisible 有没有变',
    inputSchema: bindPropertySchema,
    run: bindComponentProperty,
  },
  {
    name: 'mg_delete_component_property',
    title: '删除组件属性',
    description:
      'MasterGo 特有:删组件属性。params: { nodeIds, propertyId(属性 id 或属性名) }。写完回读确认已消失',
    inputSchema: deletePropertySchema,
    run: deleteComponentProperty,
  },
];
