import {
  type DesignHost,
  type PlatformOp,
  resolveNodes,
} from 'text-to-design-shared';
import { z } from 'zod';
import {
  describeDimensions,
  duplicateDimensions,
  findDimension,
  type MemberView,
  missingDimensions,
  newMembers,
  readDimensions,
  resolveValueTarget,
  toMemberView,
  unknownRenameSources,
  type VariantDimension,
  verifyDelete,
  verifyRename,
  verifyValueEdit,
} from './variant-set';

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
 *
 * 变量相关的三条(0040)依据是**官方文档**而非 typings:`mg.variables` 的那一大片方法在
 * typings 里只有签名、没有一个字的说明,而槽位取值(`strokeProperty: 'all'` 之类)在
 * 类型上全是裸 `string` —— 照类型猜必然猜错,故按官方文档落表并注明出处:
 * https://developers.mastergo.com/apis/variables(「变量管理」「变量绑定与解绑」
 * 「图层属性变量」三节)。文档与 typings 的两处不一致已就地注明(见各自注释)。
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
  /**
   * 变体取值(原生是 `Array<VariantProperty>`,typings 3056 行)—— 成分侧读它就知道
   * 「这个成分代表哪一组值」。类型留 `unknown`:投影(`readVariantProperties`)负责收窄。
   */
  variantProperties?: unknown;
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

// ─────────────────────────────────────────────────────────────────────────────
// 集合级变体管理:MG 的三平台独有面(决策 0033)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 为什么这组 op 存在:0018 把 MG 的变体**写入**落成「集合内换绑 + 回读校验」—— 能切到集合里
 * **已有**的成分,但造不出新维度/新值。当时造第二个值的唯一手段是「把成分改名成 `属性 1=备选`,
 * 靠 MG 自己归一」:那是把引擎内部行为当 API 用,属未声明的副作用(0007 明令根除的形态)。
 *
 * 而 typings 里本来就有整套集合级入口(`@mastergo/plugin-typings@2.19.2` `dist/index.d.ts:3072-3085`),
 * 本仓此前一个没接 —— 0018 的「未决」把它明确留成「属新能力,需要时另开决策」,0033 就是那条决策。
 *
 * | 宿主入口 | 用途 | 本仓 |
 * |---|---|---|
 * | `createVariantProperties(names)` | 建维度(随带默认值) | 接 |
 * | `createVariantComponent()` | 往集合加新成分(新值组合) | 接 |
 * | `editVariantProperties({旧:新})` | 维度改名 | 接 |
 * | `editVariantPropertyValues({属性:{oldValue,newValue}})` | 改某维度下的值名 | 接 |
 * | `deleteVariantProperty(属性)` | 删维度 | 接 |
 * | `editVariantPropertiesAlias` / `editVariantPropertyValuesAlias` | 绑变量别名 | **未接**:依赖变量面(另开决策) |
 *
 * 两条实现纪律:
 * 1. **读面用 `componentPropertyValues` 的 VARIANT 项**:MG **没有** `variantGroupProperties`
 *    (typings 全文零命中,与 Figma / jsDesign 不同),集合「有哪些维度、每个维度有哪些值」
 *    只能从那里读(见 `PropertyEntry.variantOptions`)—— 去找那个字段就是找错平台了;
 * 2. **每个 op 写完回读**:本平台有「回包成功、值没变」的前科(0018 记的两条实例写入入口),
 *    回读对不上就抛错,绝不把「成功」返回给调用方。
 *
 * ⚠ 键用**属性名**:`editVariantPropertyValues` 的入参本身就是「属性名 → {oldValue,newValue}」
 * 的映射,故这一族统一按名字传(`deleteVariantProperty(property)` 同理解读)。
 * **真机已验证(2026-09-29,MG 客户端)**:建维 / 加成分 / 改取值 / 改名 / 删维五个 op 全部
 * 按名字生效并回读一致 —— 这条不再存疑;若哪天宿主改成要 propertyId,回读会当场报错并列出
 * id 与名字,届时只改传参那一行。
 */

/** 集合级变体管理的宿主能力面(只声明用到的部分) */
interface VariantSetHostNode {
  id: string;
  type?: string;
  name?: string;
  componentPropertyValues?: unknown;
  createVariantProperties?: (properties: string[]) => void;
  createVariantComponent?: () => void;
  editVariantProperties?: (properties: Record<string, string>) => void;
  editVariantPropertyValues?: (
    properties: Record<string, { oldValue: string; newValue: string }>,
  ) => void;
  deleteVariantProperty?: (property: string) => void;
  findChildren?: (cb?: (n: RawLayer) => boolean) => RawLayer[];
  children?: RawLayer[];
}

const VARIANT_SET_METHODS = {
  create_property: 'createVariantProperties',
  create_component: 'createVariantComponent',
  edit_property: 'editVariantProperties',
  edit_value: 'editVariantPropertyValues',
  delete_property: 'deleteVariantProperty',
} as const;

/** 取要操作的**变体集**(没有对应方法就直接说清是节点类型不对,别炸在实现深处) */
async function resolveVariantSet(
  host: DesignHost,
  nodeId: string,
  need: keyof typeof VARIANT_SET_METHODS,
): Promise<VariantSetHostNode> {
  const nodes = (await resolveNodes(host, [
    nodeId,
  ])) as unknown as VariantSetHostNode[];
  const node = nodes[0];
  if (node == null) throw new Error(`找不到节点 ${nodeId}`);
  const field = VARIANT_SET_METHODS[need];
  if (typeof node[field] !== 'function') {
    throw new Error(
      `节点 ${nodeId}(${node.type ?? '未知类型'})没有集合级变体能力(${field} 不存在):只有 COMPONENT_SET 有。`.concat(
        node.type === 'COMPONENT_SET'
          ? '宿主可能改了这个入口的名字,见 0033 的退出条件。'
          : '先 jsd_find 确认它是变体集,不是单个组件或实例;要「切变体」用 jsd_set_instance_properties(走集合内换绑,见 0018)。',
      ),
    );
  }
  return node;
}

/** 集合的变体维度表:读**原始** `componentPropertyValues`(判定逻辑在 `variant-set.ts`,纯函数可单测) */
function readSetDimensions(node: VariantSetHostNode): VariantDimension[] {
  return readDimensions(node.componentPropertyValues);
}

/**
 * 集合的**成员**(成分):只取**直接子层**里的 COMPONENT。
 * 深度遍历(`findAll`)会把成分内部的图层也捞进来,故这里用 `findChildren` 只看一层
 * (0019 实测:组件/实例读不到 `children`,`findChildren` 可用且只搜一层 —— 正是这里要的语义)。
 */
function listVariantMembers(node: VariantSetHostNode): {
  members: RawLayer[];
  source: string;
} {
  const direct =
    typeof node.findChildren === 'function' ? node.findChildren() : undefined;
  if (Array.isArray(direct)) {
    return {
      members: direct.filter((n) => n.type === 'COMPONENT'),
      source: 'findChildren(直接子层)',
    };
  }
  if (Array.isArray(node.children)) {
    return {
      members: node.children.filter((n) => n.type === 'COMPONENT'),
      source: 'children(直接子层)',
    };
  }
  return { members: [], source: '无可用遍历入口' };
}

/** 回读校验的**统一出口**:有问题就抛,消息由 `variant-set.ts` 的判定给出 */
function assertNoProblems(problems: readonly string[], prefix: string): void {
  if (problems.length > 0) {
    throw new Error(`${prefix}(${problems.join(';')})`);
  }
}

async function listVariantProperties(
  host: DesignHost,
  params: unknown,
): Promise<{
  node: { id: string; type?: string; name?: string };
  source: string;
  properties: Array<{
    name: string;
    id: string;
    options: string[];
    optionAlias?: string[];
  }>;
  totalProperties: number;
  members: MemberView[];
  totalMembers: number;
  note: string;
}> {
  const p = params as { nodeId: string; memberLimit?: number };
  const node = await resolveVariantSet(host, p.nodeId, 'create_property');
  const dims = readSetDimensions(node);
  const { members, source } = listVariantMembers(node);
  const limit = p.memberLimit ?? 20;
  return {
    node: { id: node.id, type: node.type, name: node.name },
    source,
    properties: dims.map((d) => ({
      name: d.name,
      id: d.id,
      options: d.options,
      ...(d.optionsAlias != null ? { optionAlias: d.optionsAlias } : {}),
    })),
    totalProperties: dims.length,
    members: members.slice(0, limit).map(toMemberView),
    totalMembers: members.length,
    // 「读不到维度」与「这个集合确实没有维度」是两件事,让调用方能分辨
    note:
      dims.length === 0
        ? '集合上读不到任何 VARIANT 属性:要么它还没有维度(先 mg_create_variant_property 建),要么这个节点不是变体集'
        : '维度与可选值读自 componentPropertyValues 的 VARIANT 项(MG 没有 variantGroupProperties 字段,别去读它)',
  };
}

async function createVariantProperty(
  host: DesignHost,
  params: unknown,
): Promise<{
  created: string[];
  properties: Array<{ name: string; options: string[] }>;
}> {
  const p = params as { nodeId: string; names: string[] };
  const node = await resolveVariantSet(host, p.nodeId, 'create_property');
  const before = readSetDimensions(node);
  const dup = duplicateDimensions(before, p.names);
  if (dup.length > 0) {
    throw new Error(
      `维度 ${dup.join('、')} 已存在(现有:${describeDimensions(before)})。改名用 mg_edit_variant_property`,
    );
  }
  node.createVariantProperties?.(p.names);
  const after = readSetDimensions(node);
  const missing = missingDimensions(after, p.names);
  if (missing.length > 0) {
    throw new Error(
      `建维度 ${missing.join('、')} 后回读不到(现有:${describeDimensions(after)})。宿主可能静默忽略,或把名字归一成了别的写法`,
    );
  }
  return {
    created: p.names,
    // 新维度随带一个默认值,调用方据此知道下一步能改哪些值
    properties: after.map((d) => ({ name: d.name, options: d.options })),
  };
}

async function createVariantComponent(
  host: DesignHost,
  params: unknown,
): Promise<{ created: MemberView[]; totalMembers: number; note: string }> {
  const p = params as { nodeId: string; count?: number };
  const node = await resolveVariantSet(host, p.nodeId, 'create_component');
  const count = p.count ?? 1;
  const beforeIds = listVariantMembers(node).members.map((m) => m.id);
  for (let i = 0; i < count; i += 1) node.createVariantComponent?.();
  const { members, source } = listVariantMembers(node);
  // `createVariantComponent()` 返回 void,新成分只能靠前后比 id 认领
  const created = newMembers(beforeIds, members);
  if (created.length === 0) {
    throw new Error(
      `加成分后回读不到新成分(调用前 ${beforeIds.length} 个,调用后 ${members.length} 个,来源:${source})。宿主可能静默忽略`,
    );
  }
  return {
    created,
    totalMembers: members.length,
    note: '新成分代表哪一组取值看它的 variantProperties。若不是你要的组合:先 mg_list_variant_properties 看清维度的可选值,再用 mg_create_variant_property / mg_edit_variant_property_value 调;「改成分名字会驱动取值」这条引擎行为(0018 记录)是**副作用**,不是 API,别依赖它',
  };
}

async function editVariantProperty(
  host: DesignHost,
  params: unknown,
): Promise<{
  renamed: Record<string, string>;
  properties: Array<{ name: string; options: string[] }>;
}> {
  const p = params as { nodeId: string; rename: Record<string, string> };
  const node = await resolveVariantSet(host, p.nodeId, 'edit_property');
  const before = readSetDimensions(node);
  const unknownOld = unknownRenameSources(before, p.rename);
  if (unknownOld.length > 0) {
    throw new Error(
      `维度 ${unknownOld.join('、')} 不存在(现有:${describeDimensions(before)})。旧名必须与读到的完全一致`,
    );
  }
  node.editVariantProperties?.(p.rename);
  const after = readSetDimensions(node);
  assertNoProblems(
    verifyRename(after, p.rename),
    `改维度名后回读不一致;现有:${describeDimensions(after)}`,
  );
  return {
    renamed: p.rename,
    properties: after.map((d) => ({ name: d.name, options: d.options })),
  };
}

async function editVariantPropertyValue(
  host: DesignHost,
  params: unknown,
): Promise<{
  property: string;
  oldValue: string;
  newValue: string;
  options: string[];
}> {
  const p = params as {
    nodeId: string;
    property: string;
    oldValue: string;
    newValue: string;
  };
  const node = await resolveVariantSet(host, p.nodeId, 'edit_value');
  const before = readSetDimensions(node);
  const target = resolveValueTarget(before, p.property, p.oldValue);
  if ('message' in target) throw new Error(target.message);
  const dimension = target.dimension;
  node.editVariantPropertyValues?.({
    [dimension.name]: { oldValue: p.oldValue, newValue: p.newValue },
  });
  const after = readSetDimensions(node);
  assertNoProblems(
    verifyValueEdit(after, dimension.name, p.oldValue, p.newValue),
    `改取值后回读不一致:期望「${p.oldValue}」→「${p.newValue}」`,
  );
  return {
    property: dimension.name,
    oldValue: p.oldValue,
    newValue: p.newValue,
    options: findDimension(after, dimension.name)?.options ?? [],
  };
}

async function deleteVariantProperty(
  host: DesignHost,
  params: unknown,
): Promise<{ removed: string; properties: string[] }> {
  const p = params as { nodeId: string; property: string };
  const node = await resolveVariantSet(host, p.nodeId, 'delete_property');
  const before = readSetDimensions(node);
  const entry = findDimension(before, p.property);
  if (entry == null) {
    throw new Error(
      `集合没有维度「${p.property}」(现有:${describeDimensions(before)})`,
    );
  }
  node.deleteVariantProperty?.(entry.name);
  const after = readSetDimensions(node);
  assertNoProblems(
    // 消息带上 id/名字两种形态:真机若证明这个入口收的是 id,一眼就知道该改哪一行
    verifyDelete(after, entry.name).map(
      (m) => `${m}(名字 ${entry.name} / id ${entry.id})`,
    ),
    `删维度后回读仍在,宿主可能静默忽略或收的键不是名字;现有:${describeDimensions(after)}`,
  );
  return { removed: entry.name, properties: after.map((d) => d.name) };
}

// ─────── 变量(0040):mg.variables,依据官方文档而非 typings,见文件头 ───────

/**
 * 变量类型:取值 = typings 的 `VariableType` 全表(`dist/index.d.ts:1832`,12 项)。
 * ⚠ 官方文档的 `PluginVariableType` 表只列 11 项(**没有 `SPACING`**)—— 文档与 typings
 * 的这处不一致在本仓按 typings 走(引擎签名以 typings 为准),同宽与否由 `sync-guarantee`
 * 的双向断言守(`MgVariableType*Check`),所以这份清单改一处就够。
 *
 * 前四个是**单值**类型(建的时候可以带 `value`);其余是**复合样式**类型(建出来是空样式,
 * 文档明说不需要传 value)。
 */
export const MG_VARIABLE_TYPES = [
  'BOOLEAN',
  'NUMBER',
  'STRING',
  'COLOR',
  'PAINT',
  'TEXT',
  'EFFECT',
  'GRID',
  'STROKE_WIDTH',
  'CORNER_RADIUS',
  'PADDING',
] as const;

/**
 * typings 的 `VariableType` 列了、**引擎实建不收**的类型:真机 2026-10-14(MG 客户端)
 * 对 `mg_variables_create type=SPACING` 直接抛 `Unsupported variable type: SPACING`,
 * 与官方文档 `PluginVariableType` 表(11 项、没有 SPACING)一致。
 *
 * 此前这里按 typings 走(注释写着「文档少一项,本仓按 typings 为准」)—— 那是**没有实测时**
 * 的取舍,现在有实测:签名声明不等于引擎实现。登记成名单而不是删掉注释:建侧与列侧的 enum
 * 都用这 11 项(引擎建不出,也就列不出),`mg_list_variables` 因此少一个永远为空的筛选项。
 *
 * ⚠ 别和**样式类别**混起来:`jsd_create_style kind=SPACING` 在 MG 建得出来(走
 * `mg.createSpacingStyle`),建出来的东西落在**变量面**(见 `platform-knowledge.ts`)。
 */
export const MG_VARIABLE_TYPES_UNSUPPORTED = ['SPACING'] as const;

/**
 * 绑定槽位表:官方文档「属性参数一览」(https://developers.mastergo.com/apis/variables)。
 *
 * 为什么非要落表:typings 里这些参数的取值全是裸 `string`,照类型猜一定会写出
 * `strokeProperty: 'strokeWidth'` 这种不存在的槽位 —— 引擎侧要么静默不生效、要么抛一句
 * 没有上下文的错。文档给了确切取值,就按文档登记并在错误里点名(0034 的越界字段点名)。
 */
const VARIABLE_SLOTS = {
  baseProperty: ['opacity', 'fillColor', 'visible'],
  strokeProperty: ['top', 'right', 'bottom', 'left', 'all', 'color'],
  radiusProperty: ['topLeft', 'topRight', 'bottomRight', 'bottomLeft', 'all'],
  paddingProperty: [
    'top',
    'right',
    'bottom',
    'left',
    'topBottom',
    'leftRight',
    'all',
  ],
  dimensionProperty: [
    'width',
    'height',
    'maxWidth',
    'maxHeight',
    'minWidth',
    'minHeight',
  ],
  effectProperty: ['x', 'y', 'blur', 'spread', 'color'],
  gridProperty: ['sectionSize', 'count', 'gutterSize', 'offset', 'color'],
  textProperty: [
    'fontFamily',
    'fontWeight',
    'fontSize',
    'lineHeight',
    'letterSpacing',
    'paragraphSpacing',
  ],
} as const;

type SlotKind = keyof typeof VARIABLE_SLOTS;

/**
 * 槽位键的枚举列表(给 zod 用)。`satisfies` 是**防漂移**的那一环:哪天 `VARIABLE_SLOTS`
 * 里的键改名/增删,这里编译不过 —— 而不是静默少一个可绑的属性面。
 */
const SLOT_KINDS = [
  'baseProperty',
  'strokeProperty',
  'radiusProperty',
  'paddingProperty',
  'dimensionProperty',
  'effectProperty',
  'gridProperty',
  'textProperty',
] as const satisfies readonly SlotKind[];

async function listVariablesOp(
  _host: DesignHost,
  params: unknown,
): Promise<{
  collections: Array<{
    id: string;
    name: string;
    isExternal: boolean;
    modes: Array<{ id: string; name: string }>;
  }>;
  variables: Array<{
    id: string;
    name: string;
    type: string;
    collectionId: string;
    description?: string;
    /** 各模式下的值(键 = modeId);复合样式变量按子项数组给出,原样透传不归一 */
    values?: Record<string, unknown>;
  }>;
  count: number;
  truncated?: boolean;
}> {
  const p = params as { collectionId?: string; type?: string; limit?: number };
  const limit = p.limit ?? 200;
  const filter: { collectionId?: string; type?: never } = {};
  if (p.collectionId != null) filter.collectionId = p.collectionId;
  if (p.type != null) filter.type = p.type as never;
  // ⚠ typings 把 `options` 标成可选,引擎实现却**不做判空**:传显式 `undefined` 直接抛
  // `Cannot read properties of undefined (reading 'collectionId')`(真机 2026-10-14,
  // 不带 collectionId/type 的 `mg_list_variables` 每次都崩)。要么给对象,要么**一个参数都不传**。
  const all =
    Object.keys(filter).length > 0
      ? mg.variables.getVariables(filter)
      : mg.variables.getVariables();
  const slice = all.slice(0, limit);
  return {
    // 集合恒列全量(它还带模式表,而模式是变量值的索引维度,不是可选信息)
    collections: mg.variables.getCollections().map((c) => ({
      id: c.id,
      name: c.name,
      isExternal: c.isExternal,
      modes: c.modes.map((m) => ({ id: m.id, name: m.name })),
    })),
    variables: slice.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      collectionId: v.collectionId,
      ...(v.description ? { description: v.description } : {}),
      values: v.modes as unknown as Record<string, unknown>,
    })),
    count: all.length,
    ...(all.length > slice.length ? { truncated: true } : {}),
  };
}

async function createVariables(
  _host: DesignHost,
  params: unknown,
): Promise<{
  collectionId: string;
  collectionName: string;
  variables: Array<{
    id: string;
    name: string;
    type: string;
    created: boolean;
    /** `setVariableValue` 的返回原样透传;可能为空/缺字段,不是验收判据 */
    values?: Record<string, unknown>;
  }>;
  /**
   * 本轮执行内读不到、但**下一次调用就能读到**的复合样式类型(见函数体那条真机记录)。
   * 出现它不等于失败 —— 资源已落盘,只是引擎的读面在本轮不认它。
   */
  pendingReadback?: Array<{ id: string; name: string; type: string }>;
}> {
  const p = params as {
    collectionName?: string;
    variables: Array<{
      name: string;
      type: string;
      value?: unknown;
      description?: string;
    }>;
  };
  if (p.variables == null || p.variables.length === 0) {
    throw new Error('变量列表为空');
  }
  const collectionName = p.collectionName ?? 'Variables';
  const existing = mg.variables
    .getCollections()
    .find((c) => c.name === collectionName);
  // 文档:createCollection 返回 Promise<Collection>;typings 写着 `Collection | null`,按宽的处理
  const collection =
    existing ?? (await mg.variables.createCollection(collectionName));
  if (collection == null) {
    throw new Error(`建变量集合失败:宿主没有返回集合(${collectionName})`);
  }
  // MG 的 Collection **没有** defaultModeId(与 Figma 不同),只有 modes;
  // 官方约定「不传 modeId 时用第一个模式」,所以这里显式取第一个并显式传给写入
  const modeId = collection.modes[0]?.id;
  const created: Array<{
    id: string;
    name: string;
    type: string;
    created: boolean;
    /** `setVariableValue` 的返回(引擎侧更新后的值);单值类型用它确认值真的落盘 */
    values?: Record<string, unknown>;
  }> = [];
  try {
    const before = mg.variables.getVariables({
      collectionId: collection.id,
    });
    for (const v of p.variables) {
      // 同名同类型就地更新值(幂等补值),避免重复建
      const same = before.find((x) => x.name === v.name && x.type === v.type);
      const variable =
        same ??
        (await mg.variables.createVariable({
          name: v.name,
          type: v.type as never,
          ...(v.description != null ? { description: v.description } : {}),
          collectionId: collection.id,
        }));
      if (variable == null) throw new Error(`建变量失败:${v.name}`);
      let values: Record<string, unknown> | undefined;
      if (v.value !== undefined) {
        // typings 里 modeId **必填**、文档里可选 —— 按 typings 走(引擎签名以 typings 为准);
        // 集合必然带模式,这里取不到就是异常态,点名报错而不是发一次没有模式的值写入
        if (modeId == null) {
          throw new Error(
            `集合「${collection.name}」没有模式,写不了值(变量 ${v.name})`,
          );
        }
        // `setVariableValue` 返回更新后的 Variable(typings :1203-1207)。**不是验收判据**:
        // 真机 2026-10-19 它的 `modes` 时有时无(同一批里有的带 `bool`/`floatData`,有的只有
        // `{modeId}`,默认双模式集合甚至回空对象),且 **STRING 的任何读面都不带值**
        // (列表 / 按 id / 写返回三面皆无)。故原样透传,缺值就是缺值 —— 别据此判写入成败。
        const returned = await mg.variables.setVariableValue({
          id: variable.id,
          value: v.value as never,
          modeId,
        });
        if (returned?.modes != null && Object.keys(returned.modes).length > 0)
          values = returned.modes as Record<string, unknown>;
      }
      created.push({
        id: variable.id,
        name: variable.name,
        type: variable.type,
        created: same == null,
        ...(values != null ? { values } : {}),
      });
    }
  } catch (e) {
    // 只回滚本次新建的集合;复用既有集合时不删 —— 否则会连坐删掉用户已有的变量
    // (同 figma/ops.ts 的 createVariables 取舍)
    if (existing == null) mg.variables.deleteCollection(collection.id);
    throw e;
  }
  // 回读:本平台有「回包成功、值没变」的前科(0018),存在性必须再读一次。
  // ⚠ 但**复合样式类型(PAINT / TEXT / EFFECT / …)在同一次执行内读不到**:真机 2026-10-14
  // 建 `type=PAINT` 后,`getVariables({collectionId})` 与 `getVariableById(id)` 都拿不到它,
  // 而**下一次调用**的清单里它好好地在那儿(id 与名字都对得上,集合归属也是指定的那个)。
  // 判据不能是「本轮读不到 = 建失败」—— 那会把已落盘的资源报成错误,调用方重试就攒一堆
  // 重复变量(比静默失效更糟)。故分三档:本轮读到 / 本轮读不到但交给下一次 / 名字类型不符。
  const after = mg.variables.getVariables({ collectionId: collection.id });
  const pending: Array<{ id: string; name: string; type: string }> = [];
  const missing: string[] = [];
  for (const c of created) {
    const listed = after.find((x) => x.id === c.id);
    if (listed != null) {
      if (listed.name !== c.name || listed.type !== c.type)
        missing.push(
          `变量 ${c.id} 回读到的名字/类型与请求不符(请求 ${c.name}/${c.type},回读 ${listed.name}/${listed.type})`,
        );
      continue;
    }
    if (mg.variables.getVariableById(c.id) != null) continue;
    // 单值类型本轮就该读到,读不到是真失败;复合样式类型交给下一次确认
    if (isCompositeStyleType(c.type))
      pending.push({ id: c.id, name: c.name, type: c.type });
    else missing.push(`变量 ${c.name}(${c.id}) 回读不到`);
  }
  assertNoProblems(missing, '建/改变量后回读失败');
  return {
    collectionId: collection.id,
    collectionName: collection.name,
    variables: created,
    ...(pending.length > 0 ? { pendingReadback: pending } : {}),
  };
}

/** 复合样式类型:建出来是「一条样式」的那种,引擎在本轮执行内不把它们列进集合 */
function isCompositeStyleType(type: string): boolean {
  return (
    type === 'PAINT' ||
    type === 'TEXT' ||
    type === 'EFFECT' ||
    type === 'GRID' ||
    type === 'STROKE_WIDTH' ||
    type === 'CORNER_RADIUS' ||
    type === 'PADDING' ||
    type === 'SPACING'
  );
}

interface MGBinding {
  nodeIds: string[];
  variableId?: string;
  property: SlotKind;
  value: string;
  index?: number;
  unbind?: boolean;
}

interface MGBindGroup {
  property: SlotKind;
  value: string;
  variableId?: string;
  collectionId?: string;
  applied: string[];
  failed: string[];
  linkedCollections: Array<{ layerId: string; collectionIds: string[] }>;
  unverified?: string[];
}

/** 一组绑定落到一批图层;MG 无「属性 ↔ 变量」反读接口,回读只能证到集合层 */
async function runMGBinding(
  host: DesignHost,
  b: MGBinding,
  label: string,
): Promise<MGBindGroup> {
  const nodes = await resolveNodes(host, b.nodeIds);
  if (nodes.length === 0) throw new Error(`${label} 没有找到要绑变量的节点`);
  const unbind = b.unbind === true;
  // 解绑不需要变量:unlinkVariableReferenceInLayer 不收 id
  const variable = unbind
    ? null
    : mg.variables.getVariableById(b.variableId ?? '');
  if (!unbind && (variable == null || b.variableId == null)) {
    throw new Error(
      `${label} 没有找到变量:${b.variableId ?? '(未给 variableId)'}`,
    );
  }
  const variableId = b.variableId ?? '';
  // 槽位按宿主键名原样展开(文档的表就是宿主键名),不在这里改写成别的词汇
  const slot: Record<string, unknown> = {
    [b.property]: b.value,
    ...(b.index != null ? { index: b.index } : {}),
  };
  const applied: string[] = [];
  const failed: string[] = [];
  for (const n of nodes) {
    try {
      if (unbind) {
        await mg.variables.unlinkVariableReferenceInLayer({
          layerId: n.id,
          ...slot,
        });
      } else {
        await mg.variables.setVariableReferenceInLayer({
          id: variableId,
          layerId: n.id,
          ...slot,
        });
      }
      applied.push(n.id);
    } catch {
      failed.push(n.id);
    }
  }
  // 回读:MG **没有**「图层属性 ↔ 变量」的反读接口,唯一拿得到的证据是该图层用到了哪些集合
  // (getLayerVariableModes)。它证明「集合挂上了」,证不了「挂在该属性上」—— 所以绑数组属性
  // 必须自己给 index,视觉结论交 jsd_export 目视(这条限制写进 op 描述,不留给调用方猜)。
  const linkedCollections = applied.map((layerId) => ({
    layerId,
    collectionIds: mg.variables
      .getLayerVariableModes(layerId)
      .map((m) => m.collectionId),
  }));
  const collectionId = variable?.collectionId;
  // 解绑方向不做这条判定:同一个集合可能还被该图层的别的属性用着,「集合还在」不代表没解开
  const unverified =
    unbind || collectionId == null
      ? []
      : linkedCollections
          .filter((l) => !l.collectionIds.includes(collectionId))
          .map((l) => l.layerId);
  return {
    property: b.property,
    value: b.value,
    ...(b.variableId != null ? { variableId: b.variableId } : {}),
    ...(collectionId != null ? { collectionId } : {}),
    applied,
    failed,
    linkedCollections,
    ...(unverified.length > 0 ? { unverified } : {}),
  };
}

async function applyVariableReference(
  host: DesignHost,
  params: unknown,
): Promise<{
  groups: MGBindGroup[];
  applied: string[];
  failed: string[];
  unverified?: string[];
  warning?: string;
}> {
  const { bindings } = params as { bindings: MGBinding[] };
  const groups: MGBindGroup[] = [];
  for (const [i, b] of bindings.entries()) {
    groups.push(await runMGBinding(host, b, `bindings[${i}]`));
  }
  const applied = [...new Set(groups.flatMap((g) => g.applied))];
  const failed = [...new Set(groups.flatMap((g) => g.failed))].filter(
    (id) => !applied.includes(id),
  );
  const unverified = [...new Set(groups.flatMap((g) => g.unverified ?? []))];
  return {
    groups,
    applied,
    failed,
    ...(unverified.length > 0
      ? {
          unverified,
          warning: `回读不到变量所属集合(${unverified.join('、')})—— MG 没有「图层属性 ↔ 变量」的反读接口,这条只证明集合挂没挂上;请 jsd_export 目视确认`,
        }
      : {}),
  };
}

const variantSetNodeFields = {
  nodeId: z.string().min(1).describe('变体集(COMPONENT_SET)节点 id'),
};
const listVariantPropertiesSchema = z.object({
  ...variantSetNodeFields,
  memberLimit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('最多返回几个成员(成分),默认 20'),
});

const createVariantPropertySchema = z.object({
  ...variantSetNodeFields,
  names: z
    .array(z.string().min(1))
    .min(1)
    .describe('要建的维度名,如 ["状态","尺寸"];每个维度随带一个默认值'),
});

const createVariantComponentSchema = z.object({
  ...variantSetNodeFields,
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('加几个成分(新值组合),默认 1'),
});

const editVariantPropertySchema = z.object({
  ...variantSetNodeFields,
  rename: z
    .record(z.string(), z.string())
    .describe('维度改名表 {旧名: 新名};旧名必须与读到的完全一致'),
});

const editVariantPropertyValueSchema = z.object({
  ...variantSetNodeFields,
  property: z.string().min(1).describe('维度名(与读到的完全一致)'),
  oldValue: z.string().min(1).describe('该维度下现有的取值'),
  newValue: z.string().min(1).describe('要改成的取值'),
});

const deleteVariantPropertySchema = z.object({
  ...variantSetNodeFields,
  property: z.string().min(1).describe('要删的维度名(或它的 id)'),
});

const listVariablesSchema = z.object({
  collectionId: z.string().optional().describe('只列该集合下的变量'),
  type: z.enum(MG_VARIABLE_TYPES).optional().describe('只列该类型的变量'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe('最多返回几个变量(默认 200);集合那一段恒全量返回'),
});

const variablesCreateSchema = z.object({
  collectionName: z
    .string()
    .optional()
    .describe('集合名;同名集合复用(不新建),缺省 "Variables"'),
  variables: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z
          .enum(MG_VARIABLE_TYPES)
          .describe(
            '变量类型。⚠ typings 的 VariableType 有 12 项,但 **SPACING 引擎实建不收**(真机抛 `Unsupported variable type: SPACING`,官方文档的类型表也没有它)—— 所以这里只放 11 项。要 SPACING 那层复用走 `jsd_create_style kind=SPACING` MG 建得出来)',
          ),
        value: z
          .unknown()
          .optional()
          .describe(
            '初值。单值类型:BOOLEAN 布尔 / NUMBER 数字 / STRING 字符串 / COLOR 用 {r,g,b,a}(**0-1 浮点,不是 hex**)。复合样式类型可选:走 setVariableValue 的部分更新语义,只带你关心的字段(如 PAINT 传 {type:0,color:{r,g,b,a}}),不传就是空样式',
          ),
        description: z.string().optional(),
      }),
    )
    .min(1)
    .describe('要建的变量;同名同类型已存在时就地更新它的值'),
});

const mgBindingSchema = z
  .object({
    nodeIds: z.array(z.string().min(1)).min(1),
    variableId: z
      .string()
      .min(1)
      .optional()
      .describe(
        '变量 id(本地变量,见 mg_list_variables 或 jsd_get_page 的 assets.variables);`unbind: true` 时不用给',
      ),
    property: z.enum(SLOT_KINDS),
    value: z.string().min(1).describe('该属性面的槽位;取值见工具描述里的表'),
    index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        '数组型属性的下标(如 fills);⚠ MG 面板顺序与数组顺序相反(fills[0] 是最底层)',
      ),
    unbind: z
      .boolean()
      .optional()
      .describe('true = 解绑该槽位;默认 false(绑定)'),
  })
  // 逐组 strict:拼错的键必须当场点名(真机 2026-10-14 误塞 `boundProperty:""` 被静默吞掉)
  .strict()
  .superRefine((v, ctx) => {
    const allowed: readonly string[] = VARIABLE_SLOTS[v.property];
    if (!allowed.includes(v.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: `${v.property} 不接受「${v.value}」,可选:${allowed.join(' / ')}`,
      });
    }
    // 解绑不需要变量(unlinkVariableReferenceInLayer 不收 id):只在绑定方向要求
    if (v.unbind !== true && v.variableId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variableId'],
        message: '绑定时必须给 variableId(解绑才不用给)',
      });
    }
  });

/** 与 Figma 的 `figma_variables_apply` **同形**:都是一次吃一组 bindings */
const variablesApplySchema = z.object({
  bindings: z
    .array(mgBindingSchema)
    .min(1)
    .describe('一组 = 一个变量 × 一个槽位 × 一批节点;一次调用可带多组'),
});

const variablesRemoveSchema = z.object({
  variableIds: z
    .array(z.string().min(1))
    .min(1)
    .describe('要删的变量 id 列表(取自 mg_list_variables 或 assets.variables)'),
});

/**
 * 删变量:`mg.variables.deleteVariable(id)` 是同步 void(typings :1218),不回报告成败,只能回读判定。
 * 真机(MG,2026-10-19 重载后两轮):
 *
 * - **单值类型**(BOOLEAN / NUMBER / STRING / COLOR):能删,但**跨执行才生效** —— 同一次执行里
 *   再删一遍、再读一遍都还是「在」(实测 id 95:525 双删 + 回读全失败),下一次调用立刻 `removed`
 *   (95:515 / 95:522)。⇒ 本执行内读得到**不是失败**,认作已下发(pending),下次复核。
 * - **复合样式类型**(PAINT / TEXT / EFFECT / …):`deleteVariable` 是 **no-op**(跨多次执行仍在:
 *   列表、`assets.variables`、拿它绑图层三面都证明它活着;同 id 走 `jsd_delete_style` 一次删掉)。
 *   故这类**动手前就拒**,不调 `deleteVariable`。
 */
async function removeVariables(
  _host: DesignHost,
  params: unknown,
): Promise<{
  removed: string[];
  /** 已下发删除、但本执行内回读仍见该 id —— 引擎跨执行才生效,下次调用复核 */
  pending?: string[];
  failed: { id: string; reason: string }[];
}> {
  const { variableIds } = params as { variableIds: string[] };
  const removed: string[] = [];
  const pending: string[] = [];
  const failed: { id: string; reason: string }[] = [];
  const listed = (id: string) =>
    mg.variables.getVariables().some((v) => v.id === id);
  for (const id of variableIds) {
    try {
      const before = mg.variables.getVariableById(id);
      if (before == null && !listed(id)) throw new Error(`没有找到变量: ${id}`);
      if (before != null && isCompositeStyleType(before.type))
        throw new Error(
          `复合样式变量(${before.type})不走这条:deleteVariable 对它是 no-op(真机 2026-10-19),请走 jsd_delete_style({ ids: [${id}] })`,
        );
      mg.variables.deleteVariable(id);
      // 单值类型的删除跨执行生效(实测同执行内双删 + 回读仍全失败),本执行内等不到 —— 不白等:
      // 读得到就归 pending,报 failed 会把成功报成失败,那正是 10-15 记的假失败。
      if (listed(id)) pending.push(id);
      else removed.push(id);
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { removed, ...(pending.length > 0 ? { pending } : {}), failed };
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
  {
    name: 'mg_list_variant_properties',
    title: '查看变体集维度与成分',
    description:
      'MasterGo 特有:列出变体集的**变体维度与可选值**、以及各成分(成员)的当前取值。params: { nodeId(COMPONENT_SET), memberLimit? }。**动手前的摸底入口**,也是另几个变体 op 的回读面。维度与可选值读自 `componentPropertyValues` 的 VARIANT 项 —— MG **没有** `variantGroupProperties` 字段(与 Figma / jsDesign 不同),别去读它',
    inputSchema: listVariantPropertiesSchema,
    run: listVariantProperties,
  },
  {
    name: 'mg_create_variant_property',
    title: '新建变体维度',
    description:
      'MasterGo 特有:给变体集新建维度(每个维度随带一个默认值;真机 2026-09-29 实测默认值名就是「默认」)。params: { nodeId(COMPONENT_SET), names: string[] }。建完回读确认维度出现并回传各自的默认值;已存在的维度会报错。**有了维度才能加成分/改取值**',
    inputSchema: createVariantPropertySchema,
    run: createVariantProperty,
  },
  {
    name: 'mg_create_variant_component',
    title: '新增变体成分',
    description:
      'MasterGo 特有:往变体集里加新成分(新值组合)。params: { nodeId(COMPONENT_SET), count? }。返回新成分的 id/名字/当前取值。**这是「造出第二个值」的正路**:以前只能靠改写成分名字让引擎归一(副作用,见 0018),现在用它。⚠ **加成分会顺带给第一个维度自动造一个新取值**(真机 2026-09-29:值名由引擎生成,如「状态3」),其余维度取各自默认值 —— 要精确控制组合,加完再用 mg_edit_variant_property_value 把那个自动值改成你要的,别依赖改名',
    inputSchema: createVariantComponentSchema,
    run: createVariantComponent,
  },
  {
    name: 'mg_edit_variant_property',
    title: '变体维度改名',
    description:
      'MasterGo 特有:改变体维度的名字。params: { nodeId(COMPONENT_SET), rename: {旧名: 新名} }。旧名必须与读到的完全一致(不存在会报错并列出当前维度);改完回读确认旧名消失、新名出现。⚠ 改名会影响成分的 variantProperties 组成,改完用 mg_list_variant_properties 复核',
    inputSchema: editVariantPropertySchema,
    run: editVariantProperty,
  },
  {
    name: 'mg_edit_variant_property_value',
    title: '改变体取值',
    description:
      'MasterGo 特有:改某个维度下的取值名。params: { nodeId(COMPONENT_SET), property(维度名), oldValue, newValue }。旧取值必须在该维度的可选值里(不在会报错并列出可选值);改完回读确认新取值出现、旧取值消失。⚠ **这是重命名,不是新建**:带该取值的成分名字会同步改名(真机 2026-09-29),已切到该取值的实例通过换绑跟随',
    inputSchema: editVariantPropertyValueSchema,
    run: editVariantPropertyValue,
  },
  {
    name: 'mg_delete_variant_property',
    title: '删除变体维度',
    description:
      'MasterGo 特有:删掉一个变体维度。params: { nodeId(COMPONENT_SET), property(维度名或 id;真机 2026-09-29 验证**按名字生效**) }。写完回读确认维度消失。⚠ 维度被删后,该维度的取值组合从集合里消失,引用这些组合的实例会落到哪个成分由引擎决定 —— 删完用 mg_list_variant_properties 复核,必要时逐个实例 jsd_set_instance_properties 重切',
    inputSchema: deleteVariantPropertySchema,
    run: deleteVariantProperty,
  },
  {
    name: 'mg_list_variables',
    title: '查看变量集合与变量',
    description:
      'MasterGo 特有:列出**变量集合(含模式)**与**变量**(类型 / 所属集合 / 描述 / 各模式的值)。params: { collectionId?, type?, limit? }。**动手前的摸底入口**,也是另两个变量 op 的回读面。与 `jsd_get_page` 的 `assets.variables` 不是两件事:那条是**不分平台的概览**(只有 id + 名称),要值、要模式、要按集合筛就用这条。值按模式索引(键 = modeId,取自变量自身的 `modes`);集合恒全量返回 —— 模式不是可选信息,它是变量值的索引维度。⚠ MG 的 `Collection` 没有 defaultModeId 字段(与 Figma 不同),官方约定「第一个模式」为默认模式',
    inputSchema: listVariablesSchema,
    run: listVariablesOp,
  },
  {
    name: 'mg_variables_create',
    title: '批量建变量',
    description:
      'MasterGo 特有:批量建变量(与 Figma 的 `figma_variables_create` 同形,便于两个平台共用一套调用纪律)。params: { collectionName?, variables: [{ name, type, value?, description? }] }。type 收 11 项:单值 BOOLEAN / NUMBER / STRING / COLOR(COLOR 用 {r,g,b,a},**0-1 浮点**),复合样式 PAINT / TEXT / EFFECT / GRID / STROKE_WIDTH / CORNER_RADIUS / PADDING(建出来是空样式,value 走部分更新语义)。⚠ typings 的 `VariableType` 有 12 项,但 **SPACING 引擎实建不收**(真机 2026-10-14 抛 `Unsupported variable type: SPACING`,官方文档的类型表也没有它)—— 要 SPACING 那层复用走 `jsd_create_style kind=SPACING`。**同名集合复用、同名同类型变量就地更新值**;失败回滚本次新建的集合(复用既有集合时不删,避免连坐)。回包 `variables[].values` = `setVariableValue` 的返回**原样透传,不是验收判据**(真机 2026-10-19):它的 `modes` 时有时无(同批里有的带 `bool` / `floatData`,有的只有 `{modeId}`,默认双模式集合甚至回空对象,空就省掉这个键),而 **STRING 三个读面(列表 / 按 id / 写返回)都不带值** —— 别拿「有没有值字段」判写入成败,值只信画布效果。⚠ 复合样式类型**不进 `mg.variables.getVariables()` 列表**(真机 2026-10-14:建成功后,下一次调用按 `collectionId` 或按 `type` 筛都列不出它,但 `getVariableById(id)` 读得到,而它会出现在 `assets.styles` 那一份清单里)。所以本 op 的回读按 **id** 查而不是按列表查;两条都读不到才落进回包的 `pendingReadback`(判成失败会让调用方重试、攒出重复变量)。要确认它在不在,用回包的 id 走 `getStyleById` 侧的 `jsd_*` 或直接改值,别依赖 `mg_list_variables`',
    inputSchema: variablesCreateSchema,
    run: createVariables,
  },
  {
    name: 'mg_variables_apply',
    title: '批量绑定/解绑变量到图层属性',
    description:
      'MasterGo 特有:一次调用绑**多组**变量(与 Figma 的 `figma_variables_apply` 同形),unbind=true 则解绑(解绑**不用**给 variableId)。params: { bindings: [{ nodeIds, variableId?, property, value, index?, unbind? }] } —— 一组 = 一个变量 × 一个槽位 × 一批节点。property 与 value 是一对,取值来自官方文档「属性参数一览」:`baseProperty`(opacity / fillColor / visible)、`strokeProperty`(top / right / bottom / left / all / color)、`radiusProperty`(topLeft / topRight / bottomRight / bottomLeft / all)、`paddingProperty`(top / right / bottom / left / topBottom / leftRight / all)、`dimensionProperty`(width / height / maxWidth / maxHeight / minWidth / minHeight)、`effectProperty`(x / y / blur / spread / color)、`gridProperty`(sectionSize / count / gutterSize / offset / color)、`textProperty`(fontFamily / fontWeight / fontSize / lineHeight / letterSpacing / paragraphSpacing);传错会在入参校验就被点名。数组型属性(fills / effects / grids)**必须**给 index。⚠ 组件属性 ↔ 变量在 MG **只读不写**:`setProperties` 只收 string|boolean(dist/index.d.ts:3097),插件侧没有任何把属性绑成变量的入口;但关系本身存在 —— 组件侧的 `componentProperties[].variableId`(:3001,仅 TEXT/BOOLEAN 可能存在)会告诉你设计器里手动绑的是哪个变量,别把它当「没有这层关系」。变体属性另说:变量类型表里没有 VARIANT(:1832),切取值走 jsd_set_instance_properties 或集合级 op。⚠ MG **没有**「图层属性 ↔ 变量」的反读接口:回读只能拿到该图层用到了哪些集合(getLayerVariableModes),所以绑完要 jsd_export 目视确认渲染真的变了',
    inputSchema: variablesApplySchema,
    run: applyVariableReference,
  },
  {
    name: 'mg_variables_remove',
    title: '删除变量',
    description:
      'MasterGo 特有:删本地变量(逐个删,单条 id 不存在只进 failed、不连坐其余)。params: { variableIds: [id…] }。`deleteVariable` 是同步且不回报告(`dist/index.d.ts:1218`),回包三档(真机 2026-10-19 重载后两轮):**`removed`** = 本执行内回读已不见;**`pending`** = 已下发但**单值类型的删除跨执行才生效**,同执行内回读必然还见(实测双删同一 id + 回读全失败,下一次调用立刻 removed)—— 这不算失败,下次调用复核即可;**`failed`** = 找不到该 id,或它是**复合样式类型**(PAINT / TEXT / EFFECT / …),那类 `deleteVariable` 是 **no-op**(列表、`assets.variables`、绑定解析三面都证明它还活着),本 op **动手前就拒**并点名走 `jsd_delete_style`(实测同 id 走样式入口一次删掉)。删前查不到 → failed(不存在没什么好删)。⚠ 样式与变量共用一套 id 空间、类别词汇逐字重名(`getStyleById` 连变量都查得出来,`jsd_delete_style` 拿单值变量 id 会点名拒而不是误删 —— 守卫已接)。⚠ 分组管理(`addVariablesToGroup` / `disbandGroup` 等)与模式切换仍未接',
    inputSchema: variablesRemoveSchema,
    run: removeVariables,
  },
];
