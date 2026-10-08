import { readVariantProperties } from './property-values';

/**
 * MasterGo **集合级变体管理**的判定投影(纯函数、可单测)。
 *
 * 为什么要有这个文件(与 `variant-swap.ts` 同因):本平台有「回包成功、值没变」的前科
 * (0018 记的两条实例写入入口),所以每个写 op 都必须**写完回读**、对不上就抛错。
 * 「回读对不对」这件事全是纯计算(比比名字、比比可选值),把它留在这里就能单测;
 * `ops.ts` 里只剩「解析节点 → 调宿主 → 拿回读比对」的薄胶水。
 *
 * 依据:`@mastergo/plugin-typings@2.19.2` `dist/index.d.ts`
 * - `ComponentSetNode.createVariantProperties / createVariantComponent / editVariantProperties /
 *   editVariantPropertyValues / deleteVariantProperty`(3072-3085 行)—— 本仓已接(0033);
 * - `ComponentPropertyValue.variantOptions / variantOptionsAlias`(3011-3026 行)——
 *   **集合的维度与可选值只能从这里读**:MG typings 里**没有** `variantGroupProperties`
 *   (与 Figma / jsDesign 不同,`sync-guarantee.ts` 有反向断言守这条);
 * - `variantProperties: Array<VariantProperty>`(3056 / 3092 行)是**成分/实例**侧的当前取值。
 */

/** 一个变体维度(集合上的一个 VARIANT 属性) */
export interface VariantDimension {
  /** 维度名(调用方写 op 参数用的就是它) */
  name: string;
  /** 宿主内部 id(报告与回读比对用;有的宿主不给,退回名字) */
  id: string;
  /** 该维度的可选值(读不到时为空数组 —— 与「这个维度确实没有值」不做区分,由调用方按 note 判断) */
  options: string[];
  /** 可选值的变量别名(3018 行);别名绑变量,本仓未接变量面 */
  optionsAlias?: string[];
}

/**
 * 从**原生** `componentPropertyValues` 数组里挑出 `type === 'VARIANT'` 的项,投影成维度表。
 *
 * 非数组(字段不存在 / 宿主没这个 mixin)返回空数组,由调用方按「读不到」处理 ——
 * 不在这一层抛错:同一段代码既要服务「空集合」也要服务「拿错节点」,两者的提示不同。
 */
export function readDimensions(values: unknown): VariantDimension[] {
  if (!Array.isArray(values)) return [];
  const out: VariantDimension[] = [];
  for (const item of values) {
    if (item == null || typeof item !== 'object') continue;
    const it = item as {
      name?: unknown;
      id?: unknown;
      type?: unknown;
      variantOptions?: unknown;
      variantOptionsAlias?: unknown;
    };
    if (it.type !== 'VARIANT') continue;
    if (typeof it.name !== 'string' || it.name === '') continue;
    const options = Array.isArray(it.variantOptions)
      ? it.variantOptions.filter((v): v is string => typeof v === 'string')
      : [];
    const alias = Array.isArray(it.variantOptionsAlias)
      ? it.variantOptionsAlias.filter((v): v is string => typeof v === 'string')
      : [];
    out.push({
      name: it.name,
      id: typeof it.id === 'string' && it.id !== '' ? it.id : it.name,
      options,
      ...(alias.length > 0 ? { optionsAlias: alias } : {}),
    });
  }
  return out;
}

/** 维度清单(报错与结果里列出当前状态,调用方不用再回头问一次) */
export function describeDimensions(dims: readonly VariantDimension[]): string {
  if (dims.length === 0) return '无';
  return dims
    .map(
      (d) =>
        `${d.name}(id ${d.id})=[${d.options.join('、') || '(读不到可选值)'}]`,
    )
    .join('、');
}

/** 按名字或 id 找维度(两个都收:宿主给不给 id 都可能) */
export function findDimension(
  dims: readonly VariantDimension[],
  key: string,
): VariantDimension | null {
  return (
    dims.find((d) => d.id === key) ?? dims.find((d) => d.name === key) ?? null
  );
}

/** 建维度前的重名检查:返回已存在的名字 */
export function duplicateDimensions(
  dims: readonly VariantDimension[],
  names: readonly string[],
): string[] {
  return names.filter((n) => dims.some((d) => d.name === n));
}

/** 建/改之后**该出现却没出现**的名字(静默失效在这里被抓住) */
export function missingDimensions(
  dims: readonly VariantDimension[],
  names: readonly string[],
): string[] {
  return names.filter((n) => !dims.some((d) => d.name === n));
}

/** 改名前的旧名检查:返回集合里不存在的旧名 */
export function unknownRenameSources(
  dims: readonly VariantDimension[],
  rename: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(rename).filter((old) => !dims.some((d) => d.name === old));
}

/**
 * 改名后的回读比对:返回问题清单(空 = 通过)。
 *
 * 两个方向都查 —— 旧名还在(没改)与新名没出现(改丢了)是两种不同的失败,
 * 分开说能让调用方一眼看出宿主是「没动」还是「动错了」。
 */
export function verifyRename(
  dims: readonly VariantDimension[],
  rename: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  for (const [oldName, newName] of Object.entries(rename)) {
    if (dims.some((d) => d.name === oldName))
      problems.push(`旧名 ${oldName} 仍在`);
    if (!dims.some((d) => d.name === newName)) {
      problems.push(`新名 ${newName} 没出现`);
    }
  }
  return problems;
}

/**
 * 改取值前的目标检查:维度必须存在,且旧取值必须在该维度的可选值里。
 * 命中返回维度,否则返回**可直接抛出的**消息。
 */
export function resolveValueTarget(
  dims: readonly VariantDimension[],
  property: string,
  oldValue: string,
): { dimension: VariantDimension } | { message: string } {
  const dimension = findDimension(dims, property);
  if (dimension == null) {
    return {
      message: `集合没有维度「${property}」(现有:${describeDimensions(dims)})`,
    };
  }
  if (!dimension.options.includes(oldValue)) {
    return {
      message: `维度「${dimension.name}」下没有取值「${oldValue}」(可选值:${
        dimension.options.join('、') || '读不到'
      })`,
    };
  }
  return { dimension };
}

/** 改取值后的回读比对:新值必须出现、旧值必须消失 */
export function verifyValueEdit(
  dims: readonly VariantDimension[],
  property: string,
  oldValue: string,
  newValue: string,
): string[] {
  const got = findDimension(dims, property);
  const options = got?.options ?? [];
  const problems: string[] = [];
  if (!options.includes(newValue)) problems.push(`新取值「${newValue}」没出现`);
  if (options.includes(oldValue)) problems.push(`旧取值「${oldValue}」仍在`);
  return problems;
}

/** 删维度后的回读比对:该维度必须不在 */
export function verifyDelete(
  dims: readonly VariantDimension[],
  name: string,
): string[] {
  return dims.some((d) => d.name === name) ? [`维度「${name}」仍在`] : [];
}

/**
 * 成员(成分)侧的最小读面。
 *
 * 成员枚举走 `findChildren` 的**直接子层**(在 ops.ts 里),这里只做投影:
 * 深度遍历会把成分内部的图层一起捞进来,那是错的(0019 实测 `findAll` 是深度遍历)。
 */
export interface RawMember {
  id: string;
  name?: string;
  variantProperties?: unknown;
}

export interface MemberView {
  id: string;
  name?: string;
  variantProperties?: Record<string, string>;
}

export function toMemberView(m: RawMember): MemberView {
  const variantProperties = readVariantProperties(m.variantProperties);
  return {
    id: m.id,
    ...(m.name !== undefined ? { name: m.name } : {}),
    ...(variantProperties !== undefined ? { variantProperties } : {}),
  };
}

/** 调用前后比 id,找出**新加**的成分(加成分是 void 返回,只能这样认领) */
export function newMembers(
  beforeIds: readonly string[],
  after: readonly RawMember[],
): MemberView[] {
  const before = new Set(beforeIds);
  return after.filter((m) => !before.has(m.id)).map(toMemberView);
}
