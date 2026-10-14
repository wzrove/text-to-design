import { z } from 'zod';
import { CORE_CAPABILITIES, HOST_CAPABILITIES } from '../dicts/capability';
import { PLATFORMS } from '../dicts/platform';

/** 平台枚举:当前支持即时设计/Figma,未来新增平台在 ../dicts/platform.ts 加值 */
export const pluginPlatformSchema = z.enum(PLATFORMS);
export type PluginPlatform = z.infer<typeof pluginPlatformSchema>;

/**
 * 平台能力枚举(线格式):adapter 声明当前平台支持哪些超集能力(供 ping/capabilities 上报)。
 *
 * 取值表在 ../dicts/capability.ts(与「能力门控的属性表」同一份真源);core 的
 * 超集字段判定也吃这张表 —— 由插件入口经 RuntimeContext 注入(见 0002),不再是两套事实。
 *
 * 与取值表**同宽**:插件与 MCP 一起发版,不作跨版本容忍 —— 退役的取值(`platformOps`)
 * 在这里就是非法值,不设第二份「只读不写」的名单。
 *
 * 语义边界 —— 只列**调用方能实际用上**的能力面:
 * - 不含 `getMainComponentAsync`:manifest 已走 dynamic-page(决策 0011),core 的
 *   主组件读取统一走 Access 层的 resolveMainComponent(内部即 getMainComponentAsync),
 *   但那是 core 的实现细节、不是暴露给调用方的能力面 —— 不进能力表。
 */
export const hostCapabilitySchema = z.enum(HOST_CAPABILITIES);
export type HostCapability = z.infer<typeof hostCapabilitySchema>;

/**
 * 核心能力:所有平台 adapter 都实现、**不随平台变化**的功能面。
 * 与上面的平台超集能力分开上报:调用方要判断「导出/图片填充/
 * 批量编排」这类能力是否可用时看这里,不要再从 capabilities 里找
 * ——capabilities 只列平台差异项,jsDesign 只有 `styles` 是正确的。
 *
 * 取值与中文标签在 ../dicts/capability.ts(经 shared 根出口导出);
 * 这里只做 zod 派生,不再自己维护一份取值。
 */
export const coreCapabilitySchema = z.enum(CORE_CAPABILITIES);
export type CoreCapability = z.infer<typeof coreCapabilitySchema>;

/**
 * ping 回传的平台特有操作条目。
 *
 * 为什么不只回传一个 `platformOps` 能力名:调用方(尤其模型)要能**发现** op 名与
 * 入参形状,否则只能猜 —— 而猜出来的 op 名只在报错里才被打回。事实源是插件侧
 * PlatformMeta.platformOps(含 zod inputSchema),这里只透传「名/标题/描述」,
 * 描述里已写明 params 形状,不把 schema 本体塞进线格式。
 */
export const platformOpInfoSchema = z.object({
  name: z.string().describe('schema.platform.name'),
  title: z.string(),
  description: z.string().describe('schema.platform.description'),
});
export type PlatformOpInfo = z.infer<typeof platformOpInfoSchema>;

/**
 * 变量别名引用(Figma `VariableAlias` 的线格式)。两种用途同一形状:
 * - 读路径:出现在 {@link boundVariablesSchema} 的三态里;其 `id` 可**直接回喂**
 *   `figma_variables_apply` 的 `variableId`;
 * - 写路径:组件属性的值形态之一(Figma `setProperties` 收 `VariableAlias`,
 *   `plugin-api.d.ts:11123`;MG / jsDesign 的签名不收,收窄登记在
 *   `dicts/platform-value-domain.ts` 的第四类表)。
 *
 * 不改名、不解析、不补名称 —— 读写字形一致,写后回读就是同一个 id 的比对(决策 0024)。
 */
export const variableAliasRefSchema = z.object({
  type: z.literal('VARIABLE_ALIAS'),
  id: z.string(),
});
export type VariableAliasRef = z.infer<typeof variableAliasRefSchema>;

/** 实例组件属性值(Figma ComponentPropertyValue 的线格式,preferredValues 对齐 InstanceSwapPreferredValue) */
export const componentPropertyValueSchema = z.object({
  /**
   * `SLOT` 是 Figma `ComponentPropertyType` 的第五项(plugin-api.d.ts:10985),MG 只有四项
   * (`dist/index.d.ts:3004`)。此前枚举漏它:引擎读得回来,输出校验(:11089 那套)却判它
   * 不合法 ⇒ 带插槽的实例整条 `componentProperties` 过不了 schema。
   * ⚠ 只进**读**形态:写侧 `setProperties` 对 SLOT 直接抛 `cannotSetSlotProperty`
   * (`:11121`),`core/component.ts:154` 把它归进 skipped,别名形态
   * {@link componentPropertyAliasValueSchema} 里也没有它。
   */
  type: z.enum(['BOOLEAN', 'VARIANT', 'TEXT', 'INSTANCE_SWAP', 'SLOT']),
  value: z.union([z.boolean(), z.string()]),
  preferredValues: z
    .array(
      z.object({
        type: z.enum(['COMPONENT', 'COMPONENT_SET']),
        key: z.string(),
      }),
    )
    .optional(),
  /**
   * 该属性的**哪个字段绑了变量**(Figma `ComponentProperties[].boundVariables`,
   * typings :11083-11091:`{ value?: VariableAlias }`,`value` 是可绑字段名
   * 即 `VariableBindableComponentPropertyField`)。
   *
   * 为什么必须有这条:把属性值绑成变量之后,引擎在**这里**给证据 —— 节点级的
   * `boundVariables` 不含组件属性。缺了它,写别名就只剩「值变了」这一条间接证据,
   * 分不清「绑上了」还是「把变量的当时值写死了」(真机 2026-10-13 复现:改那个
   * STRING 变量的值,实例文本跟着变 —— 说明引擎记的是绑定,而读包里没有这个键)。
   * `value` 序列化时原样浅拷贝带出,这里声明它才不会在 zod 出口被 strip。
   */
  boundVariables: z
    .object({ value: variableAliasRefSchema.optional() })
    .optional(),
  /**
   * MasterGo 的**组件属性 ↔ 变量**证据:`ComponentPropertyValue.variableId`
   * (`dist/index.d.ts:3001`,官方注释「当组件属性绑定到变量时,对应的变量 id,
   * 仅 TEXT/BOOLEAN 类型可能存在」)。只在 MG 的**组件侧**表(`componentPropertyValues`)里
   * 有这一项,实例侧的 `ComponentProperties`(:3030)没有。
   *
   * 为什么不并进上面的 `boundVariables`:0024 的纪律是「按引擎词汇原样透传,不引入归一化层」
   * —— MG 给的是裸 id 字符串而不是 `{type:'VARIABLE_ALIAS', id}`,合成一套等于替平台编形状,
   * 写后回读就没法比对同一个字段了。
   *
   * ⚠ 它是**只读**出口:MG 的 `setProperties`(:3097)只收 `string|boolean`,插件侧没有把属性
   * 绑成变量的入口 —— 「关系存在、能读到、写不了」与「没有这层关系」是两件事,别混成前者。
   */
  variableId: z.string().optional(),
});
export type ComponentPropertyValue = z.infer<
  typeof componentPropertyValueSchema
>;

/**
 * 组件属性值的**写形态之一**:值跟随变量。
 *
 * ⚠ 只存在于写路径,不在读形态 {@link componentPropertyValueSchema} 里:引擎读回来的
 * `componentProperties` 值仍是标量,绑定另有出口(`boundVariables.componentProperties`,
 * 见决策 0024),`ui/src/code/figma/sync-guarantee.ts:229` 就在守这条读写分界。
 * 写侧收它是因为 Figma `setProperties` 的签名含 `VariableAlias`
 * (`plugin-api.d.ts:11123`);MG / jsDesign 的签名不收,收窄登记在
 * `dicts/platform-value-domain.ts` 第四类表,写路径按表点名拒绝。
 */
export const componentPropertyAliasValueSchema = z.object({
  type: z.enum(['BOOLEAN', 'TEXT', 'INSTANCE_SWAP']),
  value: variableAliasRefSchema,
});
export type ComponentPropertyAliasValue = z.infer<
  typeof componentPropertyAliasValueSchema
>;

/**
 * 组件属性**引用**(0041):某图层的哪个槽位由哪个组件属性驱动。值是属性的
 * **完整键**(如 `摘要2#32:7`),可**直接回喂** `jsd_set_instance_properties`。
 *
 * 与 {@link componentPropertyValueSchema} 成对:那条说「实例上这个属性等于什么」,
 * 本条说「哪个图层会被它改」。真机踩过:属性成对存在(`摘要`/`摘要2`)时只有连着
 * 可见层的那一组会改画面,写错那组会「回包成功、画布不动」—— 读路径里没有这层关系
 * 就只能靠试。
 *
 * 槽位键**归一到一套词汇**(`visible` / `characters` / `mainComponent`):Figma 原生
 * 就叫这三个,而 MG 原生的显隐槽叫 `isVisible` —— 原样透传等于把 0025 刚决定藏起来的
 * 两套词汇重新暴露到读路径。jsDesign 的 typings 全文无该声明,字段恒缺席(登记在
 * `ui/src/code/jsdesign/sync-guarantee.ts`)。
 */
export const componentPropertyReferencesSchema = z.object({
  /** 显隐由哪个属性驱动 */
  visible: z.string().optional(),
  /** 文本内容由哪个属性驱动 */
  characters: z.string().optional(),
  /** 主组件(换绑)由哪个属性驱动 */
  mainComponent: z.string().optional(),
});
export type ComponentPropertyReferences = z.infer<
  typeof componentPropertyReferencesSchema
>;

/**
 * 组件/变体属性的**入参**值:变体属性传字符串(`{"状态":"禁用"}`),布尔属性传布尔,
 * 需要显式声明类型(或换绑属性要带 `preferredValues`)时传 `{type, value}` 对象,
 * 值要跟随变量时传 `{type, value:{type:'VARIABLE_ALIAS', id}}`(仅 Figma,见
 * {@link componentPropertyAliasValueSchema})。
 *
 * 为什么这些形态都收:契约 `DesignHost.setProperties` 收标量与对象两种形态,
 * 而各宿主底层收什么由各自签名决定(Figma `string|boolean|VariableAlias`、
 * MG `string|boolean`、jsDesign 只有 `string`)—— 收窄到字符串会让布尔/换绑属性在
 * **两个平台都设不了**;平台收不了的形态在写路径按
 * `dicts/platform-value-domain.ts` 点名拒绝。
 */
export const componentPropertyInputSchema = z.union([
  z.string(),
  z.boolean(),
  componentPropertyValueSchema,
  componentPropertyAliasValueSchema,
]);

/**
 * 节点上的变量绑定。键 = 引擎的可绑定字段名(与 `figma_variables_apply` 的
 * `boundProperty` **同一套词汇**),值的三态由引擎决定:
 * - 单个别名 —— 标量绑定字段(`cornerRadius` / `width` …);
 * - 别名数组 —— `fills` / `strokes` / `effects` / `layoutGrids` / `textRangeFills`;
 * - 按属性名索引的别名表 —— `componentProperties`。
 *
 * 缺省语义:节点无任何绑定、或平台不提供该字段(仅 Figma 有,见 0024)时**整个键省略**,
 * 故「键在 = 至少有一条绑定」,调用方不必再判空。
 *
 * ⚠ 引擎口径原样保留:有独立圆角的节点上,`cornerRadius` 绑定会表现为
 * `topLeftRadius`/`topRightRadius`/`bottomLeftRadius`/`bottomRightRadius` 四条
 * (`@figma/plugin-typings` `plugin-api.d.ts:6441`),不归一成 `cornerRadius`。
 */
export const boundVariablesSchema = z.record(
  z.string(),
  z.union([
    variableAliasRefSchema,
    z.array(variableAliasRefSchema),
    z.record(z.string(), variableAliasRefSchema),
  ]),
);
export type BoundVariableAliases = z.infer<typeof boundVariablesSchema>;
