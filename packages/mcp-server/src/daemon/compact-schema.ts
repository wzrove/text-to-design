/**
 * 出参 schema 的线格式投影。
 *
 * 背景(实测):daemon 的 53 个工具里,每个工具的 outputSchema 展开出来 25.5 KB,
 * 而同一个工具的真实回包只有 ~0.8 KB(单个文本节点的全字段序列化是 837 B)。
 * 声明比事实大 25–30 倍,而 53 份里只有 11 份内容不同 —— `serializedNodeSchema`
 * 被 `results.ts` 的 4 个结果 schema 内联展开,batch 的结果再引用它们,于是同一份
 * 25.5 KB 的 `$defs` 被复制了 46 次,目录合计 1.64 MB。
 *
 * 代价不在带宽,在于**下游索引装不下**:宿主把这份目录当作工具索引的输入,
 * 结果 53 个工具里只有 4 个能被检索到 —— 工具调不通不是执行错误,是"根本没被看见"。
 *
 * 这里做的是**投影**,不是裁剪语义:
 *   - 保留:顶层键名 + 类型 + required,以及数组元素/嵌套对象的键名 ——
 *     占位符要写的路径(`{{id.updated[0].id}}`)必须可见,否则模型写不出编排。
 *   - 丢弃:嵌套类型细节、`$defs`/`$ref`(先解析再投影)、字段级描述、约束关键字
 *     (这些模型从不读)。
 *   - 每个对象层强制 `additionalProperties: true`:真实回包里的字段远多于声明,
 *     若继承了原始 schema 的 `additionalProperties: false`,严格校验的客户端会把
 *     合法回包判为非法 —— 那是比体积更严重的回归。
 *
 * 运行期不变:工具结果的构造与校验走 core/response 的 `structured()` / `err()`,
 * 用的是 def 上的原 schema,与本文件无关(决策记录见 docs/design-decisions/0006)。
 */

/**
 * 展开到第几层对象键。
 * 0 = 根对象键(updated / created / exports…)
 * 1 = 属性值本身(array/object)
 * 2 = 数组元素或嵌套对象的键 —— `updated[0]` 这一层
 * 3 = 该元素的字段名(id/name/type…),占位符要写到这一级:{{id.updated[0].id}}
 * 4 = 不再展开,只给类型
 *
 * 深度定在 3 而不是 2:占位符的标准写法要下钻到 `xxx[0].字段名`,
 * 若在 2 就停住,数组元素的键名不可见 —— 模型仍然写不出占位符。
 */
const MAX_KEY_DEPTH = 3;

/** 联合分支最多保留几个(超出只留前 N 个,避免 oneOf 全家桶) */
const MAX_UNION_BRANCHES = 4;

/** 根级 description 的保留上限(它是给模型看的说明,值钱但不必很长) */
const MAX_ROOT_DESCRIPTION = 240;

/**
 * 非根对象的键数上限(声明顺序即优先级,不另立清单)。
 *
 * `serializedNodeSchema` 是全类型超集:20+ 种节点类型的字段全在一份 schema 里,
 * 列完是 85 个键、每份 1.5 KB。而编排真正会引用到的只有身份与位置那几个
 * (id/name/type/x/y/width/height/z/parentId),其余(fills/strokes/效果/文本样式/
 * auto-layout…)模型是在**真实回包**里读值的,不需要在目录里先声明一遍。
 *
 * 取"前 N 个"而不是手写白名单:节点接口本身就把身份与坐标声明在前
 * (见 shared/src/schemas/serialized-node.ts),照声明顺序截断即可 ——
 * 手写白名单会变成与接口并行的第二份事实(0003 记录里刚修掉的毛病)。
 * 取 16 是为了让 `z`(绘制顺序)也留在里面。
 */
const MAX_KEYS_PER_OBJECT = 16;

/** 引用解析的最大跳数:防 `$defs` 里的自引用成环 */
const MAX_REF_HOPS = 8;

type JsonObject = Record<string, unknown>;

interface ProjectionCtx {
  /** 本份 schema 内的 `$defs`,用于解析本地 `$ref` */
  defs: JsonObject;
}

function isPlainObject(v: unknown): v is JsonObject {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** 解析本地引用 `#/$defs/name`(JSON Pointer 转义按规范解) */
function resolveRef(ref: string, defs: JsonObject): unknown {
  if (!ref.startsWith('#/')) return undefined;
  let node: unknown = { $defs: defs };
  for (const rawSegment of ref.slice(2).split('/')) {
    const segment = decodeURIComponent(rawSegment)
      .replace(/~1/g, '/')
      .replace(/~0/g, '~');
    if (!isPlainObject(node)) return undefined;
    node = node[segment];
  }
  return node;
}

/** 标量类型照抄;`type` 数组里只留标量,避免 `["object","null"]` 这类夹带 */
function copyType(node: JsonObject): string | undefined {
  const t = node.type;
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) {
    const scalars = t.filter(
      (x): x is string =>
        typeof x === 'string' && x !== 'object' && x !== 'array',
    );
    return scalars.length > 0 ? scalars.join(',') : undefined;
  }
  return undefined;
}

/** 分支去重:同一份节点 schema 出现在 anyOf 两侧时只留一份 */
function dedupeBranches(branches: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const b of branches) {
    const key = JSON.stringify(b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
    if (out.length >= MAX_UNION_BRANCHES) break;
  }
  return out;
}

function project(node: unknown, depth: number, ctx: ProjectionCtx): unknown {
  if (!isPlainObject(node)) return {};

  // `$ref` 先解析再投影:zod 把整棵节点树放在 `$defs` 里,properties 只是指针。
  // 不解析就等于什么都没保留(这正是投影初期"占位符路径丢了"的原因)。
  if (typeof node.$ref === 'string') {
    if (depth > MAX_REF_HOPS) return {};
    const resolved = resolveRef(node.$ref, ctx.defs);
    return resolved === undefined ? {} : project(resolved, depth, ctx);
  }

  const out: JsonObject = {};

  if (depth === 0) {
    const desc = node.description;
    if (typeof desc === 'string' && desc.length > 0) {
      out.description =
        desc.length > MAX_ROOT_DESCRIPTION
          ? `${desc.slice(0, MAX_ROOT_DESCRIPTION)}…`
          : desc;
    }
  }

  const type = copyType(node);
  if (type != null) out.type = type;

  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = node[key];
    if (Array.isArray(branches) && branches.length > 0) {
      // 分支在同一深度上摊开:anyOf 的两侧描述的是同一个返回值,不该多占一层
      out[key] = dedupeBranches(branches.map((b) => project(b, depth, ctx)));
    }
  }

  // 对象到底了:声明成"开放对象",不列字段名,也不再下钻
  const bottomedOut = depth >= MAX_KEY_DEPTH && isPlainObject(node.properties);

  if (isPlainObject(node.items)) {
    out.items = bottomedOut ? {} : project(node.items, depth + 1, ctx);
  }

  if (isPlainObject(node.properties) && !bottomedOut) {
    const names = Object.keys(node.properties);
    // 根对象的键描述的是"这次调用回了什么"(updated / created / exports…),
    // 全都值钱;非根对象(尤其节点超集)照声明顺序取前 N 个
    const kept = depth === 0 ? names : names.slice(0, MAX_KEYS_PER_OBJECT);
    const props: JsonObject = {};
    for (const name of kept) {
      props[name] = project(node.properties[name], depth + 1, ctx);
    }
    out.properties = props;
    if (depth === 0 && Array.isArray(node.required)) {
      const required = node.required.filter(
        (r): r is string => typeof r === 'string' && r in props,
      );
      if (required.length > 0) out.required = required;
    }
  }

  const looksLikeObject =
    out.type === 'object' ||
    isPlainObject(out.properties) ||
    (isPlainObject(node.items) && out.type !== 'array');
  if (looksLikeObject) out.additionalProperties = true;

  return out;
}

/**
 * 把上游工具的出参 JSON Schema 压成"键名 + 类型"级的投影。
 * 输入不是对象时原样返回(空 schema 本身就是合法 JSON Schema)。
 */
export function compactOutputSchema(schema: unknown): unknown {
  if (!isPlainObject(schema)) return schema;
  const defs = isPlainObject(schema.$defs) ? schema.$defs : {};
  const projected = project(schema, 0, { defs });
  // 投影为空(`{}`:原 schema 没有任何可描述的键)时退回一个开放对象,
  // 保证 fromJsonSchema 拿到的是能识别成对象的 schema,而不是"任意值"
  if (isPlainObject(projected) && Object.keys(projected).length === 0) {
    return { type: 'object', additionalProperties: true };
  }
  return projected;
}
