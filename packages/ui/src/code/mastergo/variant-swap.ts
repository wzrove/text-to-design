/**
 * MasterGo 的**变体写入**投影(纯函数、可单测)。
 *
 * 为什么不能直接写属性(真机实测,2026-09-24):
 *
 * | 入口(typings 都有声明) | 真机结果 |
 * |---|---|
 * | `InstanceNode.setProperties({[propertyId]: string\|boolean})`(3097 行) | 传变体属性名 → **静默无变化**,不报错 |
 * | `InstanceNode.setVariantPropertyValues(Record<string,string>)`(3094 行) | 同上 |
 * | `InstanceNode.componentProperties[].id`(3023 行 `id?: string`) | **运行时压根没有该字段** → 连按 propertyId 写都无从下手 |
 * | `swapComponent(component)`(3109 行附近) | ✅ **唯一有效**:换成同一 COMPONENT_SET 里目标值的那个成分,`variantProperties` 随之为目标值 |
 *
 * 所以「切变体」在本平台落成**集合内换绑**:按请求值在集合里找出变体值全等匹配的成分换过去。
 * 匹配不到时**明确报错**(列出可用的值组合),不静默 —— 否则调用方会以为切成功
 * (这正是上面两条静默无效入口的坑)。
 *
 * 本文件只做三件可单测的事:拆参数、合并期望值、选成分;宿主调用在 node-facade 里。
 */

/** 变体集里的成分(只需 id 与变体值来判断匹配) */
export interface VariantComponent {
  id: string;
  variantProperties?: Record<string, string>;
}

/** 期望的变体取值(属性名 → 值) */
export type VariantRequest = Record<string, string>;

/**
 * 把请求值合并到当前值之上:调用方通常只传要改的那几个属性,其余保持现值
 * (与 `setProperties` 的**部分更新**语义一致)。
 */
export function mergeVariantRequest(
  current: Record<string, string> | undefined,
  requested: VariantRequest,
): VariantRequest {
  return { ...(current ?? {}), ...requested };
}

/**
 * 拆实例属性入参:`VARIANT` 语义走换绑,其余(`TEXT`/`BOOLEAN`/`INSTANCE_SWAP`,即真正的
 * 组件属性)走宿主 `setProperties`,**认不出的名字进 `unknown`**。
 *
 * 判据按**属性类型/名字**,不按值类型 —— 两处都是被真机+测试逼出来的:
 * ① `TEXT` 组件属性的值同样是字符串,只按「是字符串就当变体值」会把文案属性错送进换绑路径;
 * ② 名字根本不存在时也被当成变体请求,报出「无法切变体…可用组合: | |」这种误导性错误(真机实测);
 *    传布尔那条更糟:**静默通过**。
 * 所以只有「声明为 VARIANT」或「在当前变体属性名里」才走换绑;认不出的名字交给门面 ——
 * 门面按「属性表是否可读」决定是**明确报错**还是转发给宿主(`unknown` 桶就是这个出口)。
 *
 * 归到变体但值不是字符串的键进 `wrongType`(调用方传错类型,由门面明确报错 —— 不让宿主静默忽略)。
 */
export function classifyInstanceProps(
  props: Record<string, unknown>,
  context: {
    variantKeys?: Iterable<string>;
    types?: Record<string, string>;
  } = {},
): {
  variant: VariantRequest;
  rest: Record<string, unknown>;
  wrongType: string[];
  unknown: string[];
} {
  const variantKeys = new Set(context.variantKeys ?? []);
  const types = context.types ?? {};
  const variant: VariantRequest = {};
  const rest: Record<string, unknown> = {};
  const wrongType: string[] = [];
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    const declared = types[key];
    if (declared == null && !variantKeys.has(key)) {
      unknown.push(key);
      continue;
    }
    if (declared != null && declared !== 'VARIANT') {
      rest[key] = value;
      continue;
    }
    if (typeof value === 'string') variant[key] = value;
    else wrongType.push(key);
  }
  return { variant, rest, wrongType, unknown };
}

/**
 * 选成分:变体值**全等**匹配期望值的那个成分。
 *
 * 全等而不是「包含」:变体维度是求笛卡尔积的,部分匹配会挑到错误的组合
 * (例如期望 `{尺寸:a1, 状态:默认}` 时,`{尺寸:a1, 状态:禁用}` 也「包含」a1)。
 * 期望值里比成分多出的属性(集合里没有的维度)由调用方先经 merge 得到,这里只做判定。
 */
export function pickVariantComponent(
  desired: VariantRequest,
  candidates: readonly VariantComponent[],
): { matched: VariantComponent | null; available: string[] } {
  const keys = Object.keys(desired);
  const available: string[] = [];
  for (const c of candidates) {
    const vp = c.variantProperties ?? {};
    available.push(describeVariant(vp));
    if (keys.every((k) => vp[k] === desired[k]))
      return { matched: c, available };
  }
  return { matched: null, available };
}

/** 变体值的可读描述(报错用):`属性 1=备选, 尺寸=a1` */
export function describeVariant(vp: Record<string, string>): string {
  return Object.entries(vp)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}
