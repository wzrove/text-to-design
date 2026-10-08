/**
 * 平台事实表(三域:变量 / 组件 / 变体)—— 唯一真源。
 *
 * 为什么需要这张表:同一条平台事实此前**没有归属**,只能散在散文里各写一份 ——
 * `dicts/capability.ts` 的注释、`mcp-server/tools/platform.ts` 的 platformNote、
 * `tools/components.ts` 的工具描述、`tools/prompts.ts` 的配方,以及 README 的表格。
 * 后果已经出现过两次:① `core/host.ts` 的契约注释停在「两平台都收 string|boolean」,
 * 第三平台接入(0017)后没回填,「jsDesign 只收字符串」这条差异长期无人知晓;
 * ② jsDesign 的变体兜底写法在 `components.ts` 与 `prompts.ts` 各抄一份。
 *
 * 本表**只装事实,不装措辞**:字段值是**标识符**(工具名、op 名、字段名、typings 行号),
 * 不是给人读的句子 —— 句子由消费方(工具描述 / prompt 配方)按当前语言现场拼。
 * 这条纪律的理由:表进 shared、被插件 UI 与 MCP 两侧共用,而两侧的语言与文案节奏不同;
 * 表里写句子等于把中文钉进一个本该语言中立的数据文件。
 *
 * **收录范围(刻意收窄)**:只登记「三平台不同」的部分。三平台同形的部分一个字不写
 * (同 0022 的口径)—— 收进来只是把超集抄第二遍,还会把「该平台没有」误报成「都不支持」。
 *
 * 事实来源两档,都写在 `evidence` 里、都要可追溯:
 * - **typings 声明**(`包名@版本 文件:行`)—— 类型级事实,由对应平台的
 *   `sync-guarantee.ts` 反向断言守(登记的缺席项必须真缺席);
 * - **仓内实测/实现**(`仓内路径:行`)—— 运行时事实或本仓接线位置,退出条件写在注释里。
 *
 * ⚠ 与 `dicts/capability.ts` 的分工,别搞混:
 * - `capability.ts` 回答「**这条能力位叫什么、门控哪些字段**」;
 * - 「**某平台有没有声明这条能力位**」是插件侧 `ui/src/code/<平台>/meta.ts` 的
 *   `capabilities` 数组 —— 本表**不复制**它,只在 `DOMAIN_CAPABILITY` 里给出
 *   「域 → 能力位」的映射,让消费方拿运行期 `capabilities`(ping 回包)自判。
 *   复制一份 claim 进来会立刻变出第二份事实(0029 已为此删过一处)。
 */

import type { HostCapabilityKey } from './capability';
import type { PlatformKey } from './platform';

/**
 * 三域(封闭枚举:加第四域要改这里 + 补三平台的条目,编译期逼问)。
 *
 * 为什么是这三个:它们各自对应一条**平台能力位**,且都存在「某平台做不了、
 * 需要替代路径」的情况 —— 即都有被写错的成本。
 */
export const KNOWLEDGE_DOMAINS = [
  'variables',
  'components',
  'variants',
] as const;

export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

/**
 * 域 → 该域的能力位。
 *
 * 消费方拿到 ping 回包的 `capabilities: HostCapability[]` 后,用
 * `capabilities.includes(DOMAIN_CAPABILITY[domain])` 判断「本平台是否声明了这条能力面」。
 * 注意三者的 `kind` 不同(`componentProperties` 是 propGate、`variables` 是 channel、
 * `inPlaceVariants` 是 flow,见 capability.ts),故这个判断**只回答「声明了没有」**,
 * 不回答「字段会不会生效」——后者是 core 的判定。
 */
export const DOMAIN_CAPABILITY: Readonly<
  Record<KnowledgeDomain, HostCapabilityKey>
> = {
  variables: 'variables',
  components: 'componentProperties',
  variants: 'inPlaceVariants',
};

/** 读路径的形态:map(Figma/jsDesign 的 `{[属性名]: 值}`)或 array(MG 原生) */
export type ReadShape = 'map' | 'array';

/**
 * 一条域事实。字段全部**允许显式缺席**(`null` / 空数组),缺席本身是事实:
 * 「这个平台读不到」与「这条没登记」必须能区分开,否则调用方只能靠猜。
 */
export interface DomainFact {
  /**
   * 读路径:节点序列化里的字段名。`null` = 该平台读不到该域的事实
   * (不是「还没写」,是 typings 里就没有对应声明)。
   */
  readonly read: string | null;
  /** 读路径的原生形态(仅 `read` 非空时有意义;仓内读出口已归一成 map) */
  readonly readShape: ReadShape | null;
  /**
   * **已接**的写入入口:本仓工具名或 platformOp 名(按推荐调用序)。
   * 空数组 = 该平台在该域没有可用写入口。
   */
  readonly write: readonly string[];
  /**
   * 平台 typings 里**有**、但本仓未接的入口(登记为待开决策,不是遗忘)。
   * 空数组 = 没有这类入口。
   */
  readonly nativeUnwired: readonly string[];
  /**
   * **集合级**管理入口(只有 `variants` 域会有):直接管理变体集本身 —— 建维度 / 加成分 /
   * 改取值 / 删维度,不经过「实例换绑」。
   *
   * 与 `write` 分开的理由:两者的作用对象不同。`write` 操作的是**实例**(或把一组组件合并成
   * 集合),`setLevelOps` 操作的是**集合自身**。提示词要说清「你要造新值,还是切已有值」——
   * 混成一句会让人拿实例入口去干集合的活(那正是 MG 上「回包成功、画布不变」的来源,见 0018)。
   */
  readonly setLevelOps?: readonly string[];
  /**
   * `write` 不可用或不够用时的替代路径(`jsd_*` 工具名序列)。
   * `null` = 没有替代路径 —— 即该平台在该域**做不到**,不是没想到办法。
   */
  readonly fallback: string | null;
  /** 证据:`包名@版本 文件:行`(typings 事实)或 `仓内路径:行`(实测/接线位置) */
  readonly evidence: readonly string[];
}

// ── 包名 + 版本,给 evidence 复用(改版本时只改这里,漏改会被 evidence 断言守住) ──
const JSD = '@jsdesigndeveloper/plugin-typings@1.0.12 plugin-api.d.ts';
const FIG = '@figma/plugin-typings@1.139.0 plugin-api.d.ts';
const MG = '@mastergo/plugin-typings@2.19.2 dist/index.d.ts';

/**
 * 平台 × 域 的事实表。
 *
 * 读法:三行 = 三平台,三列 = 三域。**每一格都必须显式写**(缺席用 `null` / `[]`),
 * 漏一格在类型上过不了(`Record` 要求全键)。
 */
export const PLATFORM_KNOWLEDGE: Readonly<
  Record<PlatformKey, Readonly<Record<KnowledgeDomain, DomainFact>>>
> = {
  jsdesign: {
    // 变量:typings 里**一个 variable 相关声明都没有**(grep -in variable 零命中),
    // 所以既没有读路径也没有写入口 —— 不是「MG 那种有 API 但没接」,是平台没这个面。
    variables: {
      read: null,
      readShape: null,
      write: [],
      nativeUnwired: [],
      fallback: null,
      evidence: [`${JSD}(全文无 variable 声明:grep -in variable 零命中)`],
    },
    // 组件:`componentProperties` 读侧不存在(已在 sync-guarantee 里反向断言),
    // 写侧走原生 `setProperties`,但签名只收字符串 ⇒ 布尔/文本/换绑属性写不了。
    // 注意别写成「无对应能力」:入口是有的,缺口在**值形态**(见方法参数取值域表)。
    components: {
      read: null,
      readShape: null,
      write: ['jsd_set_instance_properties'],
      nativeUnwired: [],
      fallback:
        'jsd_swap_component(换绑到目标组件)+ jsd_set_fill_color / jsd_set_text(直接写可见样式)',
      evidence: [
        `${JSD}:1093 setProperties 只收 string`,
        `${JSD}:1081-1085 ComponentNode(createInstance / instances)`,
        'packages/ui/src/code/jsdesign/sync-guarantee.ts:97 反向断言 componentProperties 缺席',
      ],
    },
    // 变体:读得到(Readonly),写变体值可以(值是字符串,正好落在 setProperties 的取值域里);
    // 但**做不出变体集** —— `ComponentSetNode` 在 typings 里没有创建/追加成员的入口,
    // 全 API 唯一产出路径是 `combineAsVariants`,而它实测必崩(2026-09-24 真机)。
    // 故「多主件」不是替代做法,是唯一可行路径。
    variants: {
      read: 'variantProperties',
      readShape: 'map',
      write: ['jsd_combine_as_variants', 'jsd_set_instance_properties'],
      nativeUnwired: [],
      fallback:
        '多主件:每个状态各建一个 COMPONENT,按「族名 / 状态」命名(如 Nav / Inbox、Nav / Me)',
      evidence: [
        `${JSD}:899-900 VariantMixin.variantProperties(readonly)`,
        `${JSD}:1074-1079 ComponentSetNode 只有 clone / defaultVariant / variantGroupProperties`,
        `${JSD}:127 combineAsVariants 是 ComponentSetNode 的唯一产出路径`,
        'packages/shared/src/core/component.ts:245-256 三种姿势全败的兜底与分流',
      ],
    },
  },
  figma: {
    // 变量:读有(boundVariables,0024),写走两个 platformOp。三平台里唯一一处读+写都通的。
    variables: {
      read: 'boundVariables',
      readShape: 'map',
      write: ['figma_variables_create', 'figma_variables_apply'],
      nativeUnwired: [],
      fallback: null,
      evidence: [
        'packages/ui/src/code/figma/ops.ts:390 figma_variables_create',
        'packages/ui/src/code/figma/ops.ts:398 figma_variables_apply',
        'packages/shared/src/schemas/platform.ts:90-118 boundVariables 线格式',
        'docs/design-decisions/0024-变量绑定进入读路径：boundVariables-按引擎词汇原样透传，不引入归一化层.md',
      ],
    },
    // 组件:读侧 componentProperties、定义侧 addComponentProperty、设值 setProperties 三种值形态全收。
    components: {
      read: 'componentProperties',
      readShape: 'map',
      write: ['figma_component_property_add', 'jsd_set_instance_properties'],
      nativeUnwired: [],
      fallback: null,
      evidence: [
        `${FIG}:11127 readonly componentProperties`,
        `${FIG}:11123 setProperties(string | boolean | VariableAlias)`,
        `${FIG}:9577 componentPropertyDefinitions / :9581 addComponentProperty`,
        'packages/shared/src/core/component.ts:124-160 读形态 → 写形态单点映射(0023)',
      ],
    },
    // 变体:原位合并可用(实例链接不断)。⚠ 旧入口在 Figma 上**已弃用**:
    // 实例的 `variantProperties` 与组件集的 `variantGroupProperties` 官方都指向新入口
    // (componentProperties / componentPropertyDefinitions)—— 本仓读出口仍读旧字段,
    // 属**可用但要跟官方走**的状态,登记在此避免下一个人当成错。
    variants: {
      read: 'variantProperties',
      readShape: 'map',
      write: ['jsd_combine_as_variants', 'jsd_set_instance_properties'],
      nativeUnwired: [],
      fallback: null,
      evidence: [
        `${FIG}:9560 variantProperties 对实例已 @deprecated(指向 componentProperties)`,
        `${FIG}:11040 variantGroupProperties 已 @deprecated(指向 componentPropertyDefinitions)`,
        `${FIG}:1822 combineAsVariants`,
        'packages/ui/src/code/figma/meta.ts capabilities 声明 inPlaceVariants',
      ],
    },
  },
  mastergo: {
    // 变量:typings 里有整套 `mg.variables`(集合/Mode/变量),但本仓一个 op 都没接,
    // 故既不 claim 能力位也不给写入口 —— 与「jsDesign 连 API 都没有」是两种不同的缺席,
    // 消费方要按这条决定是「提替代路径」还是「提可以接」。
    variables: {
      read: null,
      readShape: null,
      write: [],
      nativeUnwired: [
        'mg.variables.createCollection / getCollections / getCollectionById / deleteCollection / renameCollection / moveCollection',
        'mg.variables 的 Mode 相关入口',
      ],
      fallback: null,
      evidence: [
        `${MG}:1522 readonly variables: VariableAPI`,
        `${MG}:1098-1108 VariableAPI(Collection / Mode)`,
        'packages/ui/src/code/mastergo/meta.ts:15 typings 里有但没 op 实现,claim 等于空口',
      ],
    },
    // 组件:读侧由门面投影成契约形状(原生是数组),写侧有 mg_add_component_property;
    // `setProperties` 签名是 string|boolean(键必须是 propertyId,名字归一在门面里)。
    // 能力位仍**不声明**:写侧真机未验证通过(meta.ts:12-14)。
    components: {
      read: 'componentProperties',
      readShape: 'map',
      write: ['mg_add_component_property', 'jsd_set_instance_properties'],
      nativeUnwired: [],
      fallback: null,
      evidence: [
        `${MG}:3096 readonly componentProperties: Array<ComponentProperties>`,
        `${MG}:3097 setProperties({ [propertyId: string]: string | boolean })`,
        `${MG}:2965-2980 ComponentPropertiesMixin(add / edit / delete)`,
        'packages/ui/src/code/mastergo/meta.ts:12-14 写侧真机未验,故不 claim',
      ],
    },
    // 变体:集合级管理入口**三平台最全**(MG 独有 7 个),已由 0033 接上 5 个 —— 这是唯一
    // 能**原生**建维度/改取值/加成分的平台:以前造第二个值只能改成分名字让引擎归一(副作用)。
    // 实例侧取值仍走集合内换绑:`setProperties` / `setVariantPropertyValues` 对变体值运行时
    // 静默无效(门面注释实测),故 write 里不列它们。
    variants: {
      read: 'variantProperties',
      readShape: 'array',
      write: ['jsd_combine_as_variants', 'jsd_set_instance_properties'],
      setLevelOps: [
        'mg_list_variant_properties',
        'mg_create_variant_property',
        'mg_create_variant_component',
        'mg_edit_variant_property',
        'mg_edit_variant_property_value',
        'mg_delete_variant_property',
      ],
      nativeUnwired: [
        'ComponentSetNode.editVariantPropertiesAlias',
        'ComponentSetNode.editVariantPropertyValuesAlias',
      ],
      fallback: null,
      evidence: [
        `${MG}:3056 / :3092 readonly variantProperties: Array<VariantProperty> | undefined`,
        `${MG}:1415 combineAsVariants(nodes)(无 parent / index 参数)`,
        `${MG}:3072-3085 ComponentSetNode 的集合级 op 名单(5 个已接 + 2 个别名未接)`,
        `${MG}:3011-3026 ComponentPropertyValue.variantOptions / variantOptionsAlias —— MG 无 variantGroupProperties,维度只能从这里读`,
        'packages/ui/src/code/mastergo/ops.ts 集合级 op 组(写完回读校验)',
        'packages/ui/src/code/mastergo/node-facade.ts:536-543 实例侧两条原生写入运行时静默无效,只有换绑有效',
        'docs/design-decisions/0018-实例变体写入：MG上改为集合内换绑加回读校验.md',
        'docs/design-decisions/0033-MG-集合级变体管理接入-platformOps：原生建维改值替代改名副作用.md',
      ],
    },
  },
};

/** 取一条域事实(平台未知时返回 `null`,调用方据此不承诺任何分支) */
export function platformDomainFact(
  platform: PlatformKey | null,
  domain: KnowledgeDomain,
): DomainFact | null {
  return platform == null ? null : PLATFORM_KNOWLEDGE[platform][domain];
}
