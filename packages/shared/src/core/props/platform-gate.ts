import { PLATFORM_LABEL } from '../../dicts/platform';
import {
  platformPropAllowedOn,
  platformValueAllowed,
  platformValueRejectionHint,
} from '../../dicts/platform-value-domain';
import type { WriteCtx } from './types';

/**
 * 按平台类型系统做的**写前判定**(决策 0022)。
 *
 * 为什么判定在这里而不在平台门面:判定需要两样东西 —— ① 知道当前是哪个平台
 * (`RuntimeContext.platform`);② 有个能上行给调用方的出口(`WriteOutcome`)。
 * 两者都只在 core 手上;平台门面(如 MasterGo 的 `node-facade.ts`)两样都没有,
 * 于是它历史上只能 `console.warn` —— 调用方拿到的是「成功」,画布没变,结果里
 * 一个字都没有,正是 0007 要根除的静默失效。
 *
 * 与另外两层判定的分工(**三层,查序固定**):
 * 1. 本模块 —— **平台收窄**:这个平台接受这个取值吗?这个平台的这类节点有这字段吗;
 * 2. `core/capabilities.ts` —— **能力门控**:这个平台有没有这个能力面(styles /
 *    变量 / 文本截断…),按 `capabilities` 能力位判,与"当前节点是什么类型"无关;
 * 3. `dicts/prop-applicability.ts` —— **领域适用性**:圆角对椭圆有没有意义。
 *    三平台一致,不含平台轴。
 * 1 与 3 都要过;2 在 `update.ts` 的结果装配期另有出口,不重复在这里判。
 *
 * fail-open:未注入平台(null)时一律放行 —— 拿不准就别拦,交给存在性守卫与回读兜底。
 * 这与 `RuntimeContext` 未注入能力表时的既有口径一致(0002)。
 */
/** 被平台拒的原因类别 —— 决定文案说「字段不存在」还是「取值不接受」 */
export type PropRejection = 'type' | 'value';

/**
 * **只判不报**:本平台是否拒掉这次写入,以及拒的理由。返回 null = 放行。
 *
 * 与 {@link gatePropWrite} 的关系:两者的判定条件是**同一份**(都取自
 * `dicts/platform-value-domain.ts`),差别只在要不要写进 `WriteOutcome`。
 * 分开的理由是回压路径(如 `layoutWriter.settle` 把调用方声明的值再压一遍)
 * **不能重复点名** —— 写阶段已经报过一次,再报一次会让同一次调用出现两遍同样的话;
 * 但「被平台拒过的值」在回压时必须**跳过**,否则等于绕过判定把它写进去。
 */
export function platformRejectsProp(
  w: WriteCtx,
  key: string,
  value: unknown,
): PropRejection | null {
  const platform = w.ctx.platform;
  if (platform == null) return null;
  if (!platformPropAllowedOn(platform, key, w.node.type)) return 'type';
  if (!platformValueAllowed(platform, key, value)) return 'value';
  return null;
}

export function gatePropWrite(
  w: WriteCtx,
  key: string,
  value: unknown,
): boolean {
  const rejection = platformRejectsProp(w, key, value);
  if (rejection == null) return true;
  const platform = w.ctx.platform;
  if (platform == null) return true;
  const label = PLATFORM_LABEL[platform];
  w.outcome.ignored.add(key);

  if (rejection === 'type') {
    w.outcome.warnings.push(
      `${key} 在 ${label} 的「${w.node.type}」上没有对应字段(该平台的这类节点不含这个属性的 mixin),本次已跳过:不是写失败,是这种节点上不存在该属性。要用它就换本平台支持该属性的节点类型;不去写的话结果里不会再回显它。`,
    );
    return false;
  }

  const hint =
    platformValueRejectionHint(platform, key) ?? '该取值本平台无法表达';
  w.outcome.warnings.push(
    `${key} 的值 ${JSON.stringify(value)} 无法在 ${label} 表达(${hint}),本次已跳过:不是写失败,是平台没有这个取值。请改用本平台支持的取值,或把该差异留给调用方处理。`,
  );
  return false;
}
