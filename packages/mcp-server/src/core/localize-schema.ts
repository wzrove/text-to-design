import type { MessageKey, T as Translate } from 'text-to-design-shared';
import { core } from 'zod';

/**
 * 把 schema 里存成 **MessageKey** 的 `describe` 投影成当前 locale 的文案(0016)。
 *
 * ## 为什么必须有这一层
 *
 * `.describe()` 在**模块加载期**求值,而那时还不知道 locale(locale 来自进程 env,
 * 装配点在 `buildServer`)。所以 `shared/schemas/*` 只存键,语言推迟到这里 ——
 * 这是本方案唯一新增的间接层。
 *
 * ## zod 4 的描述存在**全局 registry**,不在 `_def` 上(实测)
 *
 * 踩过的坑:按 zod 3 的经验去读/写 `schema._def.description` 完全没有效果 ——
 * zod 4 的 `describe()` 实现是
 * `core.globalRegistry.add(clone, { description })`,而 `.description` 是个只读
 * getter(`globalRegistry.get(this)?.description`)。也就是说:
 *   - **读**走公开 getter(`schema.description`),那才是客户端看到的那个值;
 *   - **写**只能走 `core.globalRegistry.add(schema, { description })`,
 *     `schema.description = x` 会静默无效(严格模式下直接抛)。
 * 症状很隐蔽:**字段说明会显示成键名本身**(如 `schema.executeSchemas.width`),
 * 工具照样能调 —— 所以这里配了"投影后不得残留键"的门禁
 * (`tests/i18n.test.ts` 的 localizeSchema 用例)。
 *
 * ## 为什么是先遍历后写,而不是重建一棵 schema 树
 *
 * 遍历用**属性驱动**(看节点上有哪些容器属性),不认类型名 —— zod 4 的类型名是
 * `'object'` / `'optional'` 这类小写短名,且新增类型时不希望这里悄悄漏掉分支。
 * 写法是就地注册(与 `.describe()` 同一机制),所以**要求进程级单一 locale**:
 * daemon 一次启动只解析一次 env,重复执行幂等。要做 per-session locale 就得改成克隆。
 */

type AnySchema = Record<string, unknown>;

/** zod 4 的 def(zod 3 的 `_def` 兼容垫片上也有,故两条都认) */
function defOf(node: AnySchema): AnySchema | undefined {
  const direct = node.def;
  if (direct != null && typeof direct === 'object') return direct as AnySchema;
  const legacy = node._def;
  return legacy != null && typeof legacy === 'object'
    ? (legacy as AnySchema)
    : undefined;
}

/** 当前描述:公开 getter 是唯一可信来源(registry 支撑);def.description 作兜底 */
function readDescription(node: AnySchema): string | undefined {
  const viaGetter = node.description;
  if (typeof viaGetter === 'string' && viaGetter !== '') return viaGetter;
  const viaDef = defOf(node)?.description;
  return typeof viaDef === 'string' && viaDef !== '' ? viaDef : undefined;
}

/** 写描述:与 `.describe()` 同一条路(写 `def.description` 在 zod 4 上无效) */
function writeDescription(node: AnySchema, text: string): void {
  core.globalRegistry.add(node as never, { description: text });
}

/**
 * 收集子节点。**属性驱动**,不认类型名:zod 4 每个节点把结构放在 `def` 的不同键上
 * (object→shape、array→element、optional→innerType、union→options、record→
 * keyType/valueType、lazy→getter、tuple→items、pipe/transform→in/out、catchall)。
 */
function children(def: AnySchema): AnySchema[] {
  const out: AnySchema[] = [];
  for (const key of [
    'innerType',
    'element',
    'valueType',
    'keyType',
    'in',
    'out',
    'catchall',
    'rest',
  ]) {
    const value = def[key];
    if (value != null && typeof value === 'object')
      out.push(value as AnySchema);
  }
  if (Array.isArray(def.options)) {
    for (const option of def.options) {
      if (option != null && typeof option === 'object') {
        out.push(option as AnySchema);
      }
    }
  }
  if (Array.isArray(def.items)) {
    for (const item of def.items) {
      if (item != null && typeof item === 'object') out.push(item as AnySchema);
    }
  }
  if (Array.isArray(def.type)) {
    // tuple(zod 4 的 `type: []` 写法)
    for (const item of def.type) {
      if (item != null && typeof item === 'object') out.push(item as AnySchema);
    }
  }
  const shape = def.shape;
  if (shape != null && typeof shape === 'object') {
    for (const value of Object.values(shape as Record<string, unknown>)) {
      if (value != null && typeof value === 'object') {
        out.push(value as AnySchema);
      }
    }
  }
  if (typeof def.getter === 'function') {
    try {
      const value = (def.getter as () => unknown)();
      if (value != null && typeof value === 'object') {
        out.push(value as AnySchema);
      }
    } catch {
      // lazy 自引用分支取不到就跳过:影响面只是这一处的文案
    }
  }
  return out;
}

function forEachNode(schema: unknown, visit: (node: AnySchema) => void): void {
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const schemaNode = node as AnySchema;
    visit(schemaNode);
    const def = defOf(schemaNode);
    if (def == null) return;
    for (const child of children(def)) walk(child);
  };
  walk(schema);
}

/**
 * 就地投影:把描述里的键换成当前 locale 的文案。
 *
 * 不是键的描述(尚未迁移的中文长句等)原样保留 —— 迁移是逐批的,投影必须能处理
 * 「半迁移」状态(`createT` 对未知键返回键本身,所以"看着像键但不在 catalog"
 * 会显形,不会静默吞掉)。
 */
export function localizeSchema<S extends object>(schema: S, t: Translate): S {
  forEachNode(schema, (node) => {
    const current = readDescription(node);
    if (current == null) return;
    const translated = t(current as MessageKey);
    if (translated !== current) writeDescription(node, translated);
  });
  return schema;
}

/** 收集整棵树上的描述(门禁用:投影前后数量必须相等,防遍历漏分支) */
export function collectDescriptions(schema: unknown): string[] {
  const out: string[] = [];
  forEachNode(schema, (node) => {
    const current = readDescription(node);
    if (current != null) out.push(current);
  });
  return out;
}
