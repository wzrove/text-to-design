import type { PlatformMeta } from 'text-to-design-shared';
import { mastergoOps } from './ops';

/**
 * MasterGo 能力面。
 *
 * 只声明**核对过确实存在**的能力(`@mastergo/plugin-typings@2.19.2`,证据行号见 0017):
 * - `styles`:四个 `mg.getLocal*Styles()` 同步 getter 齐全 → 本地样式可枚举、可引用;
 * - 其余超集能力逐项**不声明**,不是因为偷懒,而是对不上或不存在:
 *   - `textTruncation` / `maxLines`:无此属性(截断只能靠 `textAutoResize` 的
 *     `TRUNCATE*` 取值,语义不等价);
 *   - `componentProperties`:读侧已由门面**投影**成契约形状(实例侧 `componentProperties` /
 *     组件侧 `componentPropertyValues`,见 0017 复核节),写侧刚补上平台 op(0019);
 *     但**真机写入尚未验证通过**,所以继续不 claim —— 等实机确认布尔/文本写得住再 claim;
 *   - `variables`:typings 里有 `mg.variables`,但没有 platformOps 实现,claim 等于空口;
 * - `inPlaceVariants`:**已真机验证**——`mg.combineAsVariants` 把**原组件本身**移进集合
 *   (合并后集合的 children 就是传入组件的 id,页面无克隆残留),与 Figma 同语义;
 *   故 claim 它,core 的合并首选顺序据此走原位姿势。
 *
 * platformOps:目前是**组件属性管理**三个 op(见 0019)—— MG 不会把组件的子文本自动暴露成
 * `TEXT` 属性,没有这组 op 就永远造不出第一个属性,`jsd_set_instance_properties` 的
 * 布尔/文本/换绑路径等于摆设。变量(`mg.variables`)仍未接:形状与 Figma 不同、需另开决策。
 */
export const meta: PlatformMeta = {
  capabilities: ['styles', 'inPlaceVariants'],
  platformOps: mastergoOps,
};
