/**
 * 组件/变体属性的读写投影(MG 门面用,纯函数、可单测)。
 *
 * 形状真源:`@mastergo/plugin-typings`(`dist/index.d.ts`,pnpm 下为
 * `node_modules/.pnpm/@mastergo+plugin-typings@<ver>/node_modules/@mastergo/plugin-typings/dist/index.d.ts`)。
 * 本文件每条映射都有行号依据,改之前先回去看类型 —— 这是「找不到的字段/参数去类型里找」的落点。
 *
 * 依据:
 * ① `InstanceNode.componentProperties: Array<ComponentProperties>`(3096 行),
 *    项为 `{name, id?, type: 'BOOLEAN'|'TEXT'|'INSTANCE_SWAP'|'VARIANT', value: boolean|string, preferredValues?, …}`(3020 行);
 *    契约要 `Record<string, ComponentPropertyValue>`(`shared/schemas/platform.ts`)→ **投影**;
 * ② `InstanceNode.variantProperties: Array<VariantProperty> | undefined`(3092 行),
 *    `VariantProperty{property, value}`(2958 行)→ 投影成 `Record<string, string>`;
 * ③ `setProperties(properties: { [propertyId: string]: string | boolean }): void`(3097 行)
 *    —— 键是 **propertyId**,而 `ComponentProperties.id?` 是可选的,故只在能对上 id 时改写键;
 * ④ `setVariantPropertyValues(property: Record<string, string>): void`(3057 / 3094 行,同步 void)
 *    —— **变体属性专用入口**;走 `setProperties` 会静默无效(真机实测:5 种写法试遍,
 *    实例状态一律不变、也不报错),故全字符串入参分流到这里。
 */

/** 线格式的组件属性值(`shared/schemas/platform.ts`:type + value + 可选 preferredValues) */ export interface ContractPropertyValue {
  type: string;
  value: boolean | string;
  preferredValues?: Array<{ type: string; key: string }>;
}

/**
 * MG 的 `variantProperties`(`Array<VariantProperty>`)→ 契约的 `Record<string, string>`。
 *
 * 变体属性名是**中文/带空格的自由文本**(真机见到 `属性 1`),故键一律原样,不做归一。
 * 全空(未定义/空数组/项全不合格)时返回 `undefined` —— 契约侧是可选字段,
 * 「读不到」和「空记录」要区分开。
 */
export function readVariantProperties(
  value: unknown,
): Record<string, string> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const item of value) {
    if (item == null || typeof item !== 'object') continue;
    const it = item as { property?: unknown; value?: unknown };
    if (typeof it.property === 'string' && typeof it.value === 'string') {
      out[it.property] = it.value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * MG 的 `componentProperties`(`Array<ComponentProperties>`)→ 契约的
 * `Record<string, ComponentPropertyValue>`。
 *
 * 键取 `id ?? name`:MG 的 `id` 是可选的(typings 3023 行 `id?: string`),缺省时名字本身就是
 * 稳定标识 —— 与 `remapPropertyIds` 的判据保持同一套,读出来的键才能原样写回去(round-trip)。
 * 只透传契约认得的三个字段,`alias` / `valueAlias` / `isDefaultValue` 是 MG 专有,丢掉。
 */
export function readComponentProperties(
  value: unknown,
): Record<string, ContractPropertyValue> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Record<string, ContractPropertyValue> = {};
  for (const item of value) {
    if (item == null || typeof item !== 'object') continue;
    const it = item as {
      name?: unknown;
      id?: unknown;
      type?: unknown;
      value?: unknown;
      preferredValues?: unknown;
    };
    const key = pickKey(it);
    if (key == null) continue;
    if (typeof it.type !== 'string') continue;
    if (typeof it.value !== 'string' && typeof it.value !== 'boolean') continue;
    const entry: ContractPropertyValue = { type: it.type, value: it.value };
    const preferred = pickPreferred(it.preferredValues);
    if (preferred.length > 0) entry.preferredValues = preferred;
    out[key] = entry;
  }
  // 数组存在但为空 → 返回空表(**可读且确实没有属性**),与「字段不存在 → undefined」区分开:
  // 前者足以判定「这个名字不可写」,后者不能(见 node-facade 的 applyInstanceProps)
  return out;
}

/**
 * **组件侧**的属性表:MG 的 `ComponentNode` 不走 `componentProperties`,而是
 * `ComponentPropertiesMixin.componentPropertyValues`(typings 2997 / 3011 行),
 * 项为 `{name, type, defaultValue, id?, preferredValues?, alias?, …}` —— 值是
 * `defaultValue` 而非 `value`。
 *
 * 为什么非要有这条:调用方要写组件属性(布尔/文本/换绑)必须**先知道属性名与类型**,
 * 而组件是唯一能问出「这个组件有哪些可写属性」的地方。没有它,MG 上读组件的
 * `componentProperties` 恒为 undefined,`jsd_set_instance_properties` 就只剩瞎猜名字。
 */
export function readComponentPropertyValues(
  value: unknown,
): Record<string, ContractPropertyValue> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Record<string, ContractPropertyValue> = {};
  for (const item of value) {
    if (item == null || typeof item !== 'object') continue;
    const it = item as {
      name?: unknown;
      id?: unknown;
      type?: unknown;
      defaultValue?: unknown;
      preferredValues?: unknown;
    };
    const key = pickKey(it);
    if (key == null) continue;
    if (typeof it.type !== 'string') continue;
    const v = it.defaultValue;
    if (typeof v !== 'string' && typeof v !== 'boolean') continue;
    const entry: ContractPropertyValue = { type: it.type, value: v };
    const preferred = pickPreferred(it.preferredValues);
    if (preferred.length > 0) entry.preferredValues = preferred;
    out[key] = entry;
  }
  // 同 readComponentProperties:空数组是「可读且没有」,不是「读不到」
  return out;
}

/**
 * 属性表的**键**取「名字优先」,id 兜底。
 *
 * 真机实测(MG):`componentPropertyValues` 项**同时有** `name`(显示图标)与 `id`(20:395)。
 * 键取名字的理由:名字是调用方写值时要用的东西(`{"显示图标": false}`)、跨实例稳定;
 * id 由门面在调宿主前用 `remapPropertyIds` 现查现换(`setProperties` 收的是 propertyId)。
 * 只取 id 的代价见 0019 的复验:传属性名一律匹配不上,连「重名检查」都失效。
 */
function pickKey(item: { name?: unknown; id?: unknown }): string | null {
  if (typeof item.name === 'string' && item.name !== '') return item.name;
  if (typeof item.id === 'string' && item.id !== '') return item.id;
  return null;
}

/** `InstanceSwapPreferredValue[]` → 契约的 `{type,key}[]`(形状不符的项丢掉) */
function pickPreferred(value: unknown): Array<{ type: string; key: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((p) => {
    if (p == null || typeof p !== 'object') return [];
    const pv = p as { type?: unknown; key?: unknown };
    return typeof pv.type === 'string' && typeof pv.key === 'string'
      ? [{ type: pv.type, key: pv.key }]
      : [];
  });
}

/** `ComponentPropertyValue` → 宿主标量:对象取 `.value`,标量原样 */
export function unwrapPropertyValues(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      val != null && typeof val === 'object' && 'value' in (val as object)
        ? (val as { value?: unknown }).value
        : val;
  }
  return out;
}

/**
 * 键归一:名字 → `componentProperties[].id`(typings 3097 行,`setProperties` 收的是 propertyId)。
 *
 * 只改写**能对上**的键(名字匹配且该项带非空 `id`),其余原样 —— 宁可不改也不猜。
 * 拿不到清单(节点没有该字段 / 形状不符)时整体原样返回。
 */
export function remapPropertyIds(
  props: Record<string, unknown>,
  ...tables: unknown[]
): Record<string, unknown> {
  const idByName = new Map<string, string>();
  for (const table of tables) {
    if (!Array.isArray(table)) continue;
    for (const item of table) {
      if (item == null || typeof item !== 'object') continue;
      const it = item as { name?: unknown; id?: unknown };
      if (
        typeof it.name === 'string' &&
        typeof it.id === 'string' &&
        it.id !== '' &&
        !idByName.has(it.name)
      ) {
        idByName.set(it.name, it.id);
      }
    }
  }
  if (idByName.size === 0) return props;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    out[idByName.get(key) ?? key] = val;
  }
  return out;
}

/**
 * `setProperties` 的分流已迁走:`variant-swap.ts` 的 `splitInstanceProps` 负责拆参数,
 * 门面(`node-facade.ts` 的 `applyInstanceProps`)负责走「集合内换绑 + 回读校验」——
 * 因为本平台的两条原生写入入口对变体值都**静默无效**(真机实测,见 0018)。
 */
