/**
 * 变体维度与实例取值的**实际运行期形状**归一(唯一处置点)。
 *
 * ## 为什么需要这一层
 *
 * typings 声明 `ComponentSetNode.variantGroupProperties: { [k]: { values: string[] } }`
 * (`@jsdesigndeveloper/plugin-typings@1.0.12 plugin-api.d.ts:1078`),**运行时给的不是字符串**:
 * 真机 2026-10-20(即时设计)同一份文档里,单成员集合回 `["ccc"]`,多成员集合回
 * `[{"name":"默认"},{"name":"禁用"}]` —— 对象形态撞穿线格式的 `string[]` 校验,于是
 * `get_page` / `jsd_find` **整条失败**(不是少一个字段,是这次只读调用报废)。
 *
 * 同族的坑已经在别处出现过(letterSpacing 双层包装、lineHeight 空文本),处置口径一致:
 * **运行时形状差不该把一次读判失败**,在投影点归一到线格式,而不是让每个消费方各猜一次。
 *
 * ## 第二件事:两套键
 *
 * 同一个集合上,集合级维度读作 `{"状态": [...]}`,成员 `variantProperties` 却读作
 * `{"分类1": "默认"}` —— **两套键**,而引擎写入口收的是**成员键**。只按集合键校验会把
 * 合法调用打死(真机:`{"分类1":"默认"}` 被拒「非法变体属性」);只按成员键校验又拿不到
 * 「集合上有哪些维度」。故两边都收,并把集合维度键按**取值唯一匹配**改写成成员键
 * (真值映射,不是猜):匹配不上或有歧义就点名报错,绝不静默下发一个打不中的键。
 *
 * ⚠ 这条不该写进 typings 断言:`sync-guarantee` 守的是「契约成员在不在」,而这两个字段
 * **成员在、取值形状与键空间不符** —— 只有真机能发现,故事实登记在
 * `dicts/platform-knowledge.ts` 的 jsDesign 证据里。
 */

/** 引擎沙箱是 target=es6,不注入 ES2022 的 `Object.hasOwn`(见 tests/engine-api-compat) */
function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** 集合维度表的原始形状(values 元素类型不可信) */
export type VariantGroupPropertiesRaw = Record<
  string,
  { values: readonly unknown[] } | undefined
>;

/** 单个取值 → 名字。字符串原样,对象取 `name`,其余字符串化 */
export function variantValueName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value != null && typeof value === 'object') {
    const name = (value as { name?: unknown }).name;
    if (typeof name === 'string') return name;
  }
  return String(value);
}

/**
 * 单节点的变体取值表 `variantProperties`(维度 → 当前取值)。
 *
 * typings 声明它是 `{[k]: string}`,运行期**同样不保证**是纯字符串(与集合维度表同族):
 * 即时设计实测会给出 `{name}` 对象。归一口径一致,故共用 `variantValueName`。
 * 读不出返回 `undefined`(键缺席),别写成空对象 —— 空对象会被当成「确实没有取值」。
 */
export function normalizeVariantProperties(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string> | undefined {
  if (raw == null) return undefined;
  try {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      out[key] = variantValueName(value);
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 维度 → 可选值(纯字符串数组)。整张表为空/读不出返回 `undefined`
 * (键缺席 = 读不到,与「确实没有维度」的空对象区分开,见 `assets.variants` 的缺席语义)。
 */
export function normalizeVariantGroupProperties(
  raw: VariantGroupPropertiesRaw | null | undefined,
): Record<string, string[]> | undefined {
  if (raw == null) return undefined;
  try {
    const out: Record<string, string[]> = {};
    for (const [dimension, entry] of Object.entries(raw)) {
      const values = entry?.values;
      out[dimension] = Array.isArray(values)
        ? values.map(variantValueName)
        : [];
    }
    return out;
  } catch {
    // 坏节点上读该字段会抛(与 variantProperties 同族);摘要字段,丢它不掀翻序列化
    return undefined;
  }
}

/** 一次变体写入的键解析结果 */
export type VariantWriteKeyResolution =
  | {
      /** 真正下发给引擎的键(成员键) */
      readonly key: string;
      /** 调用方给的是集合维度键、已按取值映射到成员键时的原名 */
      readonly rewrittenFrom?: string;
    }
  | { readonly error: string };

/**
 * 把调用方给的变体属性键解析成**引擎认的成员键**。
 *
 * 顺序(命中即返回):
 * 1. 就是成员键 → 原样;
 * 2. 是集合维度键 → 按**取值**在成员键里找唯一匹配,唯一则改写并回传原名,否则报错;
 * 3. 都不是 → 交给调用方后续处理(可能是组件属性键,不在本函数职责内)。
 *
 * 为什么按取值映射成立:两套键描述的是同一个维度,成员键上的当前值就是调用方想切到的
 * 那个值。真机样本:集合 `状态: [默认, 禁用, …]`,成员 `分类1: 默认`,按值映射后
 * `状态=禁用` → `分类1`。歧义(同一取值能在多个成员键上命中)时宁可报错 ——
 * 替调用方挑一个等于往写路径引进「回包成功、改错东西」。
 */
export function resolveVariantWriteKey(
  requestedKey: string,
  requestedValue: string,
  memberValues: Record<string, string> | null | undefined,
  setDimensions: Record<string, string[]> | null | undefined,
): VariantWriteKeyResolution | null {
  const member = memberValues ?? {};
  if (hasOwn(member, requestedKey)) return { key: requestedKey };
  const dims = setDimensions ?? {};
  if (!hasOwn(dims, requestedKey)) return null;
  const candidates = Object.keys(member).filter(
    (k) => member[k] === requestedValue,
  );
  if (candidates.length === 1) {
    return { key: candidates[0] as string, rewrittenFrom: requestedKey };
  }
  if (candidates.length === 0) {
    const memberKeys = Object.keys(member);
    return {
      error:
        memberKeys.length === 0
          ? `变体维度「${requestedKey}」写不到成员上:该实例没有 variantProperties 键可映射,引擎只认成员键`
          : `变体维度「${requestedKey}=${requestedValue}」对不上任何成员键的当前取值(成员键:${memberKeys.map((k) => `${k}=${member[k]}`).join('、')})。引擎写变体收的是**成员键**,不是集合维度键`,
    };
  }
  return {
    error: `变体维度「${requestedKey}=${requestedValue}」能映射到多个成员键(${candidates.join('、')}),无法确定要改哪一个。请改传成员键`,
  };
}

/** 该取值是否在集合维度的可选值里(用于「写了但集合上没这个值」的点名) */
export function variantValueOffered(
  value: string,
  options: readonly string[] | undefined,
): boolean {
  return options == null || options.includes(value);
}
