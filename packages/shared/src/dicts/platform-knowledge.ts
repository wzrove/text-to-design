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
 * ⚠ **四类可复用件里「样式」没有独立的域**,别按 `styles` 去这张表里找:
 * 「变量 ↔ 样式」这条关系是三平台塌缩方式差异的落点(Figma 变量**喂**样式、
 * MG 变量**含**样式、jsDesign 只有样式),它记在 `variables` 域的注释 /
 * `nativeUnwired` / `evidence` 里;样式自身的能力差异(能不能按 id 应用 vs 能不能列清单)
 * 在 `dicts/capability.ts` 的 `styles` 与 `styleEnumeration` 两条(0043)。
 * 加第四个域会让每条事实都被复制一遍(0029 已为此删过一处)。
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
   * 读路径:本仓**已接**的读出口。两种形态都登记在这一列 ——
   * 节点序列化里的字段名(Figma 的 `boundVariables`),或本仓接上的枚举 API
   * (MG 的 `mg.variables.getVariables()`,供 `get_page` 的资源清单用)。
   * `null` = 该平台读不到该域的事实(不是「还没写」,是 typings 里就没有对应声明)。
   */
  readonly read: string | null;
  /** 读路径的原生形态(`map` = 键值表;`array` = 原生给数组)。仅 `read` 非空时有意义 */
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
      // 缺席也得给出口:`variable-binding` 配方第 3 节在无写入口时直接引这条,
      // 留 null 就等于对着调用方说「跳过」而不给做法(0007)。
      fallback:
        '两条路,都不是变量那种玩法:① **本地样式** —— `jsd_create_style` 从一个既有节点抄出样式(本平台四类:PAINT / TEXT / EFFECT / GRID;契约的类别是三家 `StyleType` 的八项并集,余下四类本平台没有工厂,传过去会被写前点名拒),回 id;绑上去用 jsd_set_fill_color 的 fillStyleId / jsd_set_text 的 textStyleId / jsd_set_effects 的 effectStyleId / jsd_set_stroke 的 strokeStyleId。**⚠ 本平台未声明 `styleEnumeration`,样式清单(`jsd://styles` / `assets.styles`)恒空、列不出来**:已有样式的 id 只能从正用着它的节点上读(`*StyleId` 字段),新建的 id 从 `jsd_create_style` 回包记账(建重复了用 `jsd_delete_style` 删)。一条样式改一次,全档跟随。② **结构继承** —— 抽成 COMPONENT 后改主件,实例自动继承(批量套覆盖走 variant-sync 配方)。',
      evidence: [
        `${JSD}(全文无 variable 声明:grep -in variable 零命中)`,
        'packages/ui/src/code/jsdesign/meta.ts capabilities=[styles](按 id 应用样式是有的;**不声明 styleEnumeration** —— 列不出样式,见 0043)',
        'packages/shared/src/core/access.ts:174(listStylesAsync 在未声明 styleEnumeration 时直接返回空,四个 getter 一次都不调)',
        'packages/ui/src/code/jsdesign/host.ts:48(createStyle 已接:`jsd_create_style` 走 jsDesign.createPaintStyle 等四工厂;四类样式的共同契约在 packages/shared/src/core/styles.ts)',
        `${JSD}:88-91(createPaintStyle / createTextStyle / createEffectStyle / createGridStyle)`,
        // 替代路径为什么只有样式:本平台的样式面就是「一组固定视觉」的唯一落点,
        // 而它比 MG 还窄 —— 四类(与 Figma 同宽)且 **BaseStyle 没有集合字段**,
        // 样式是扁平一张表,没有 MG 那种「样式挂在集合里」的分组维度(:1990 对照)。
        `${JSD}:1137-1143 StyleType 四类 / BaseStyle 只有 id+type+name+remove,无 collectionId、collectionName`,
      ],
    },
    // 组件:`componentProperties` 读侧不存在(已在 sync-guarantee 里反向断言),
    // 写侧走原生 `setProperties`,但签名只收字符串 ⇒ 布尔/文本/换绑属性写不了。
    // 注意别写成「无对应能力」:入口是有的,缺口在**值形态**(见方法参数取值域表)。
    components: {
      read: null,
      readShape: null,
      write: ['jsd_set_instance_properties'],
      nativeUnwired: [
        'Page.importComponentSetByKeyAsync(:111) —— 团队库「组件集」导入入口,本仓只接了组件那半(:110);拿到集合节点是目前唯一的非画布来源',
        'Page.createNodeFromJSXAsync(:119) —— JSX 建节点,是否支持组件/集合标签未验(typings 无声明,只有 any)',
      ],
      fallback:
        'jsd_swap_component(换绑到目标组件)+ jsd_set_fill_color / jsd_set_text(直接写可见样式)',
      evidence: [
        `${JSD}:1093 setProperties 只收 string`,
        `${JSD}:1081-1085 ComponentNode(createInstance / instances)`,
        'packages/ui/src/code/jsdesign/sync-guarantee.ts:97 反向断言 componentProperties 缺席',
        // 运行期行为(不是类型事实):别在这张表里当「签名收什么」用,它是「调了会怎样」。
        'packages/ui/src/code/jsdesign/sync-guarantee.ts:367-393 setProperties 签名只收字符串;真机 2026-10-14 的运行期行为:给**没有变体属性**的 INSTANCE 调它不是点名报错,而是挂到转发超时(25s)—— 没有变体集时别拿它当切状态的通道',
        'packages/shared/src/core/component.ts setInstanceProperties 的属性面守卫 —— 2026-10-19 真机复现同一条(未知属性名 `Foo` → 25077ms 后失败、错误只有「插件响应超时」):能力位不含 componentProperties 且变体表 / variantProperties 都拿不到键时,写前点名拒,不再落到引擎空转',
        'packages/shared/src/core/access.ts resolveMainComponent 的选路 —— 2026-10-19 真机隔离:typings 未声明的 `getMainComponentAsync` 在即时设计运行时**存在且永不 settle**(与 `*Async` 样式枚举同一模式),`?.` 探测让 `jsd_copy_overrides`(只读快照、不写属性)挂到 25109ms;改由 `mainComponentSync` 声明只问同步 `mainComponent`',
        'packages/ui/src/code/jsdesign/ops.ts jsd_component_facts —— 2026-10-20 三页官方文档核对(js.design/developer-doc/plugin/api/node/{ComponentNode,InstanceNode,ComponentSetNode}):**成员与 typings 1.0.12 逐字一致,没有多出来的 API**;文档确认而契约缺的字段(ComponentNode.instances / key / remote / description / expanded / getPublishStatusAsync、InstanceNode.scaleFactor、ComponentSetNode.defaultVariant / variantGroupProperties / children)由本 op 透出。`getPublishStatusAsync` 单独可选:同族 async 成员有永不 settle 的先例(dec e1e66f0a)',
        'packages/ui/src/code/jsdesign/ops.ts jsd_component_facts 真机(2026-10-20,重载后):COMPONENT 的 instances 可读且准确(建组件+2 实例 → instanceCount 2 / instanceIds 两条)、key 是空串、remote=false;description **可写**且回读一致(PublishableMixin :838);getPublishStatusAsync **21ms 返回、不永挂**(与 getMainComponentAsync 不同),但对非团队库节点回的是**错误串** "Failed to get node publish status" 而不是 PublishStatus 三值 ⇒ op 里三值才认,其余落 publishStatusError',
        'packages/ui/src/code/jsdesign/ops.ts jsd_component_facts 的 INSTANCE 分支 + core/assets.ts readVariantProperties —— 真机 2026-10-20 两条:① `variantGroupProperties.values` 元素**不保证是字符串**(单成员集合 ["ccc"],两成员集合 [{"name":"默认"}]),撞穿 assets.variants.properties 的 string[] 校验使 `get_page` **整条失败**,故 projection 与 op 都按名字归一;② 对真实变体实例调 setProperties **11~15ms 就抛** `in setProperties: i.setProperties is not a function`(typings :1093 与文档都声明了它)⇒ 符号是否真在由 op 的 `setPropertiesAvailable` 回报复核',
        'packages/ui/src/code/jsdesign/host.ts combineAsVariants 的显式绑定 —— 官方 API 参考页(js.design/developer-doc/plugin/api/reference/jsDesign)确认语义「将任意数量的组件合并为变体」、签名 (nodes, parent, index?);真机 2026-10-20 逐项排除:receiver 绑回全局后报错逐字相同、组件名改成 `状态=默认/禁用` 仍败、带子层仍败、先 reparent 进 FRAME 仍败 ⇒ **引擎实现缺陷,不是调用方式**',
        'packages/shared/src/core/component.ts combineAsVariantsNodes 的姿势顺序 —— 真机 2026-10-20:合并失败会**毁入参组件**(用户组件 13:100 变损坏节点、repair 直接删),故「原位合并」只在平台声明 inPlaceVariants 时才尝试(Figma 声明、顺序不变);jsDesign 只跑两条克隆姿势,失败也不伤原组件',
        // 2026-10-20 补做「干净画布 + 只跑原位姿势」的单姿势隔离实验(此前原位从未被单独测过:
        // 它当时排在两式之后,只能在已被污染的画布上跑,结论因此不可靠)。结果仍是崩。
        'packages/ui/src/code/jsdesign/host.ts combineAsVariants 的**单姿势隔离实验** —— 真机 2026-10-20(即时设计,干净画布,只跑原位姿势,传入真 COMPONENT、类型完全合规):仍抛 in get_booleanOperation: Value is not a string;后果是入参组件 13:332 被就地改成 BOOLEAN_OPERATION、13:333 幸存 ⇒ 坐实引擎实现缺陷,并排除两个替代解释:①「clone 返回 INSTANCE 导致参数类型不符才是根因」(原位传合规类型照样崩);②「被克隆两式弄脏画布才连带失败」(干净画布单跑照样崩)',
        // 裸调实验(2026-10-20,取消 core 全部判断后直接交真 COMPONENT 给原生):
        // 引擎返回 BOOLEAN_OPERATION 并把四个组件搬进去 ⇒ 与调用方判断无关,是引擎路由错误。
        'packages/ui/src/code/jsdesign/host.ts combineAsVariants 的**裸调实验** —— 真机 2026-10-20(即时设计,画板 3 下 4 个真 COMPONENT,取消 core 的姿势选择 / clone 类型校验 / 父容器校验 / 跨父级校验 / 返回类型校验,直接 host.combineAsVariants(components, parent)):引擎**成功返回一个 type=BOOLEAN_OPERATION 的节点**(id 13:446),读它的 name 抛 in get_name: Value is not a string;四个原 COMPONENT **被搬进该布尔节点下**(parentId=13:446),画板 3 随即变空 ⇒ 坐实「引擎把合并路由成布尔运算」,并排除「core 的某个前置判断改变了入参」这一解释(裸调无任何判断,行为一致)。事后可用 jsd_reparent_nodes 把组件搬回原容器,损坏节点由 repair 清',
        // 参数类型核验(2026-10-20,非破坏性探针):resolveNodes 返回的就是原生对象本身
        // (sameAsApiGetNodeById=true),且 nodes 各有 createInstance、parent 有 children/appendChild
        // ⇒ 引擎收到的入参完全满足原生签名,不是本仓包装/代理导致的。
        'packages/shared/src/core/access.ts resolveNodes 的返回身份 —— 真机 2026-10-20(即时设计,只读探针,未执行合并):四个 COMPONENT 逐个比对 `=== jsDesign.getNodeById(id)`,**全部 true**(即返回的是原生对象本身,不是包装或代理);成员核验 nodes 各有 createInstance(ComponentNode 独有)、无 setProperties(那是 InstanceNode 的),parent 有 children/appendChild/insertChild 且无 createInstance、且不等于 currentPage ⇒ 入参**完全满足** combineAsVariants(nodes: ReadonlyArray<ComponentNode>, parent: BaseNode & ChildrenMixin) 的签名。故「参数类型不满足」这一解释被排除:类型层面的 `as never` 只是掩盖了静态证明,运行时要传的对象是对的',
        'packages/shared/src/core/component.ts / jsd_reparent_nodes —— 真机 2026-10-20:RECTANGLE 可 reparent 进 COMPONENT(文档 ComponentNode 继承 BaseFrameMixin → appendChild :711),childCount 0→1,且**两个实例的 childCount 同步变 1**(主件加子层实时传播)',
        // 实例三通道与变体成员两处类型差异:全部是「typings 声明了、运行期不是那样」,
        // 故按**实际类型/实际行为**收口,不改 typings 断言(那里守的是成员在不在)。
        'packages/shared/src/core/component.ts setInstanceProperties / swapComponents / detachInstanceNodes + packages/shared/src/core/nodes.ts cloneNodes + packages/shared/src/core/variant.ts —— 真机 2026-10-20(即时设计,逐条隔离):① **变体集成员**上 createInstance 必抛 in createInstance: The node with id undefined does not exist(集合内 8 个成员全复现;独立 COMPONENT 正常),clone() 返回 undefined;② swapComponent 必抛 in swapComponent: Cannot read properties of undefined (reading type)(独立组件之间 / 成员之间 / 克隆实例上全复现);③ detachInstance **原位返回同一个 INSTANCE**(type 仍 INSTANCE、mainComponentId 照旧)⇒ 静默 no-op;④ 集合维度键 状态 与成员键 分类1 **不是同一套**,只按集合键校验会把合法的成员键写入拒掉',
      ],
    },
    // 变体:读得到(Readonly),写变体值可以(值是字符串,正好落在 setProperties 的取值域里);
    // 但**做不出变体集** —— **没有创建入口**:全 API 无 `createComponentSet` / `createVariant`
    // (typings 零命中),唯一产出路径是 `combineAsVariants`(`:127`),而它实测必崩(09-24 / 10-14 / 10-19 三次)。
    // ⚠ 别把「没有入口」说成「没有追加面」:`ComponentSetNode` 继承 `BaseFrameMixin` → 带
    // `appendChild` / `insertChild`(`:708-712`)。只是**拿不到集合节点**去追加 —— 创建路径断了,
    // 这一面在实际调用里不可达。故「多主件」不是替代做法,是唯一可行路径。
    variants: {
      read: 'variantProperties',
      readShape: 'map',
      // ⚠ 只剩合并入口:实例侧的**两条**写入通道运行期都不可用 ——
      // `setProperties` 不是函数、`swapComponent` 抛内部错误(真机 2026-10-20)。
      // 故「切到已有取值」在本平台**没有脚本入口**,别把 jsd_set_instance_properties 写进来
      // (写了等于承诺一条必败的路径)。
      write: ['jsd_combine_as_variants'],
      nativeUnwired: [
        'Page.importComponentSetByKeyAsync(:111) —— 未接;这是「不经画布拿到集合节点」的唯一路径',
        'ComponentSetNode.appendChild / insertChild(:711-712,继承自 BaseFrameMixin)—— 类型上能追加成员,但没有创建入口 ⇒ 拿不到集合节点,这一面实际不可达',
      ],
      fallback:
        '多主件:每个状态各建一个 COMPONENT,按「族名 / 状态」命名(如 Nav / Inbox、Nav / Me);实例侧切值本平台运行期无入口(setProperties 不是函数、swapComponent 抛内部错误,真机 2026-10-20),变体取值只能在画布上手工切换',
      evidence: [
        `${JSD}:899-900 VariantMixin.variantProperties(readonly)`,
        `${JSD}:1074-1079 ComponentSetNode 自身只多 clone / defaultVariant / variantGroupProperties;但 :1074 继承 BaseFrameMixin(:851)→ 带 appendChild / insertChild(:711-712)`,
        // 读面形状事实:typings 说 string[],运行期给对象 —— 归一收在 core/variant.ts
        'packages/shared/src/core/variant.ts + core/serialize.ts + core/assets.ts —— 真机 2026-10-20:variantGroupProperties.values 元素**不保证是字符串**(单成员集合 ["ccc"],两成员集合 [{"name":"默认"},{"name":"禁用"}]),不归一会撞穿线格式 string[] 并让 get_page / jsd_find **整条失败**(不是少字段,是这次只读调用报废);variantProperties 同理。归一实现单点(两个投影点共用),serializeNode 另加一层「getter 抛也省略该字段」的保护',
        'packages/ui/src/code/jsdesign/host.ts / core/component.ts combineAsVariants 兜底 —— 真机 2026-10-19 复核(即时设计,重载后):72ms 抛「三种姿势均失败…in get_booleanOperation: Value is not a string」**与 09-24/10-14 逐字一致**;残留形态这次是 **3 个 BOOLEAN_OPERATION(原 COMPONENT 被就地改成 BOOLEAN_OPERATION、id 保留)+ 1 个幸存 COMPONENT,没有 COMPONENT_SET**(10-14 那次是留下畸形 COMPONENT_SET),`assets.variants` 回到 0 ⇒ 残留形态不稳定,清理一律走 `jsd_manage_nodes op=repair`(实测 `cleaned: 3 个`)',
        `${JSD}:127 combineAsVariants 是 ComponentSetNode 的唯一产出路径`,
        'packages/shared/src/core/component.ts:245-256 三种姿势全败的兜底与分流',
        // 真机 2026-10-14(即时设计):三姿势全败,引擎错 `in get_booleanOperation:
        // Value is not a string`;但画布上**真的多出一个 COMPONENT_SET**(维度被引擎
        // 默认命名为「分类 1」/ 取值「变量 2」,成员取不到实例)+ 3 个 BOOLEAN_OPERATION。
        // 所以「做不出来」= 调用必抛、产物不可用,**不是**「引擎没建东西」—— 残留要清。
        'packages/shared/src/core/nodes.ts:1006 repairNodes 是清残骸的唯一入口(jsd_delete_node 对它们报「没有要删除的节点」);真机 2026-10-14(即时设计):合成抛错后 assets.variants 从 0 变 1(畸形集合,成员 jsd_create_instance 报「node with id undefined does not exist」),另有 3 个 BOOLEAN_OPERATION 残骸',
      ],
    },
  },
  figma: {
    // 变量:三条读出口 + 四个写 op。`read` 是**三个**通道(Figma 比另两家多两条):
    // ① 节点上的绑定(`boundVariables`,0024,与写侧 `boundProperty` 同源词汇);
    // ② 0040 补的**库存面** `figma_variables_list`(集合 / 模式 / 值)—— 此前没有它,
    //    「有哪些变量、值是多少」在画布上根本没有出口,绑变量前只能靠猜 id;
    // ③ 样式对象自身的值与绑定 `figma_style_variables_list` —— 「变量 → 样式 → 节点」
    //    这条三层链的中间一环,只有这里能看到(节点上的 boundVariables 不含样式内部)。
    // `readShape` 描述的是①(键值表);②③返回数组。这个字段是粗粒度提示,两级形态并列时
    // 以注释为准 —— 若将来第三家也要挂读 op,该把「读 op 名单」拆成独立字段(见 0040「退出条件」)。
    variables: {
      read: 'boundVariables / figma_variables_list / figma_style_variables_list',
      readShape: 'map',
      write: [
        'figma_variables_create',
        'figma_variables_apply',
        'figma_variables_remove',
        'figma_style_variables_apply',
      ],
      nativeUnwired: [
        'Variable.setValueForMode / rename(改变量值与生命周期里的改名,本仓未接;删除已接成 figma_variables_remove)',
        'VariableCollection 的模式增删改名(addMode / renameMode / removeMode)',
        '样式的反查面 StyleConsumers / getStyleConsumersAsync(:12387)——「这条样式被哪些节点用着」未接,改样式前只能靠名字猜影响面',
      ],
      fallback: null,
      evidence: [
        'packages/ui/src/code/figma/ops.ts figma_variables_create / figma_variables_apply(dec 0040 起带 unbind;dec 7165f370 起一次吃 bindings[] 多组)/ figma_variables_list / figma_variables_remove',
        'packages/shared/src/schemas/platform.ts:90-118 boundVariables 线格式',
        `${FIG}:2149 getLocalVariablesAsync / :2160 getLocalVariableCollectionsAsync`,
        `${FIG}:6817-6852 VariableBindableNodeField / TextField(paint 与 effect / grid 项是另外三个入口,故 boundProperty 分三档)`,
        `${FIG}:6855-6861 VariableBindablePaintStyleField / EffectStyleField / GridStyleField = paints / effects / layoutGrids,ComponentPropertyField = value —— 样式级与组件属性级绑定各一套字段,不在节点那三档里`,
        // 样式档的写入口**不对称**:只有 TextStyle 有 setBoundVariable(:12507),
        // 另三类是 readonly boundVariables + 可写的 paints / effects / layoutGrids,
        // 绑定要经 setBoundVariableFor{Paint,Effect,LayoutGrid} 拿副本再整数组赋回。
        `${FIG}:12432 / :12496 / :12521 / :12537 四类样式的 boundVariables;:12507 TextStyle.setBoundVariable(唯一有 setter 的那类)`,
        'packages/ui/src/code/figma/ops.ts figma_style_variables_apply / figma_style_variables_list(样式 ↔ 变量的读写两端)',
        `${FIG}:11571 VariableResolvedDataType 六种里没有 VARIANT,也没有「一组值」的样式类型 —— Figma 的样式是**独立资源**,靠自身 boundVariables 引变量;这一点与 MG 相反(见 mastergo.variables)`,
        'docs/design-decisions/0024-变量绑定进入读路径：boundVariables-按引擎词汇原样透传，不引入归一化层.md',
      ],
    },
    // 组件:读侧 componentProperties、定义侧 addComponentProperty、设值 setProperties 三种值形态全收
    // (标量 / {type,value} / 值跟随变量的 VARIABLE_ALIAS —— 最后那种只此一家)。
    components: {
      read: 'componentProperties',
      readShape: 'map',
      write: ['figma_component_property_add', 'jsd_set_instance_properties'],
      nativeUnwired: [],
      fallback: null,
      evidence: [
        `${FIG}:11127 readonly componentProperties`,
        `${FIG}:11123 setProperties(string | boolean | VariableAlias)`,
        `${FIG}:2214 createVariableAliasByIdAsync(官方给的「属性值绑变量」构造入口)`,
        `${FIG}:11571 VariableResolvedDataType 无 VARIANT —— 变体属性值绑不了变量`,
        // SLOT 是 Figma 属性类型的第五项,写侧引擎明说不收:读形态已收进线格式
        // (`schemas/platform.ts` 的 componentPropertyValueSchema),写形态由
        // `core/component.ts:154` 归进 skipped 点名,不靠 try/catch 兜。
        `${FIG}:10985 ComponentPropertyType 五项(BOOLEAN|TEXT|INSTANCE_SWAP|VARIANT|SLOT)`,
        `${FIG}:11121 setProperties 不收 SLOT,抛 cannotSetSlotProperty`,
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
    // 变量:typings 里有整套 `mg.variables`(集合/Mode/变量)。0039 接了**只读枚举**
    // (`mg.variables.getVariables()` 经 adapter 投影进 `get_page.assets.variables`),
    // 0040 又补了**写侧**的两个 op —— 三平台里读写都通的第二个。
    //
    // ⚠ 这组 op 的**槽位取值**在 typings 里全是裸 `string`,没有任何文档注释可依;
    // 唯一依据是官方文档 https://developers.mastergo.com/apis/variables(「变量管理」
    // 「变量绑定与解绑」「图层属性变量」三节),已逐值登记进 `ops.ts` 的 `VARIABLE_SLOTS`。
    // 另外两处文档与 typings 不一致也记在那边:①文档的 `PluginVariableType` 表少一个
    // `SPACING`;②`setVariableValue` 的 `modeId` 文档可选、typings 必填(本仓按 typings 走)。
    //
    // 与「jsDesign 连 API 都没有」仍是两种不同的缺席:那边只能提替代路径,这边是「可以接、
    // 大部分还没接」—— 未接项见 `nativeUnwired`(模式/分组/别名/作用域/一步建绑)。
    //
    // ⚠ **本平台是「变量 ⊇ 样式」,不是 Figma 那种「变量喂样式」**:
    // `VariableType`(:1832)十二项里有八个复合样式类型(PAINT / TEXT / EFFECT / GRID /
    // STROKE_WIDTH / CORNER_RADIUS / PADDING / SPACING),建出来就是一条样式;
    // 而 `StyleType`(:1810)八项与它们**逐字重名**,`type Style`(:2079)联合里还直接
    // 混进了 `Variable` —— 于是 `getStyleById` 连变量都查得出来,样式与变量共用同一套
    // id 空间与同一套类别词汇。区分只有一条:`BaseStyle` 有 `collectionName`(:1990)、
    // `Variable` 没有(:1874)—— `mastergo/host.ts:175-201` 的 removeStyle 守卫就靠它
    // (真机 2026-10-14 拿变量 id `3:7` 调 `jsd_delete_style`,回包 removed、变量真没了)。
    variables: {
      read: 'mg.variables.getVariables()',
      readShape: 'array',
      write: [
        'mg_variables_create',
        'mg_variables_apply',
        'mg_variables_remove',
      ],
      nativeUnwired: [
        'mg.variables 的 Mode 管理:addMode / renameMode / deleteMode / setVariableMode / setPageVariableMode(读侧已给 getModes,见 mg_list_variables)',
        'mg.variables 的分组管理:getGroupList / createGroup / addVariablesToGroup / removeVariablesFromGroup / renameGroup / disbandGroup / deleteGroup',
        'mg.variables.createVariableInLayer(一步建变量 + 绑图层;与 create + apply 的组合重叠,未接)',
        'mg.variables.setVariableReference / unlinkVariable(变量引用变量、跨类型别名与复合样式变量的子属性引用)',
        'mg.variables 的作用域与代码语法:setVariableScopes / setCodeSyntax / getVariableIndexes / addVariableValue(复合变量补子项)',
        // 四类专属样式**建**已接(dec 25827d0c:`jsd_create_style` 的 kind 收八项,MG 的
        // createCornerRadiusStyle / createPaddingStyle / createSpacingStyle /
        // createStrokeWidthStyle 都在 `:1459-1468`)。仍未接的是它们的**样式侧枚举**
        // (`getLocalStrokeWidthStyles` 等 :1517-1520 没投影成契约成员)—— 但真机 2026-10-14
        // 查清了两件事:① 本平台**确实声明了** `styleEnumeration`,且 `assets.styles` 列得出来
        // (PAINT / EFFECT 三条,不退超时)—— 0043 的「MG 待验」结掉;② 这四类建出来**落在变量面**
        // (出现在 `assets.variables`,不进 `assets.styles`,删除走 `mg_variables_remove`)——
        // `mg.createSpacingStyle` 与「SPACING 复合样式变量」在 MG 里本来就是同一个东西。
        // ⚠ 但**两份清单不互补、按创建路径随机可见**(同日复验:同一个 PAINT 复合样式变量
        // 走 `mg_variables_create` 建出来只进 `assets.styles`,`mg_list_variables` 两种筛法都列不出它)。
        'mg.getLocalStrokeWidthStyles / getLocalCornerRadiusStyles / getLocalPaddingStyles / getLocalSpacingStyles(:1517-1520):四类样式的样式侧枚举未接(它们改由 assets.variables 那侧可见)',
      ],
      fallback: null,
      evidence: [
        `${MG}:1522 readonly variables: VariableAPI`,
        `${MG}:1098-1108 VariableAPI(Collection / Mode)`,
        `${MG}:1176 getVariables() / :1874 Variable{id,name,…}`,
        `${MG}:1832 VariableType 十二项(八项与 :1810 StyleType 逐字重名)/ :2079 type Style 联合含 Variable / :1990 BaseStyle.collectionName`,
        `${MG}:1920 VariableValue(含 :1901 TextVariableValue 与 Record<string,unknown>):复合样式变量走**部分更新**,不传的子项就是空样式`,
        // 四条真机事实(2026-10-14,MG 客户端)—— typings 与官方文档都给不出这些,
        // 每条挂在**承住它的那段代码**上(证据行的开头必须是仓内路径或 @包名)。
        'packages/ui/src/code/mastergo/ops.ts MG_VARIABLE_TYPES_UNSUPPORTED —— 真机:`mg_variables_create type=SPACING` 抛 `Unsupported variable type: SPACING`;官方文档的 PluginVariableType 11 项才是引擎实况,typings 的 VariableType 十二项含幻影',
        'packages/ui/src/code/mastergo/ops.ts createVariables 的回读分支 —— 真机:复合样式变量**不进 `getVariables()` 列表**(按 collectionId、按 type 两种筛法当次与下一次都列不出),但 `getVariableById(id)` 读得到 ⇒ 回读判据必须是按 id 查;两条都读不到才落 `pendingReadback`(判成失败会让调用方重试、攒出重复变量)',
        'packages/ui/src/code/mastergo/ops.ts listVariablesOp 的取变量分支 —— 真机:`mg.variables.getVariables(undefined)` 抛 `Cannot read properties of undefined (reading collectionId)`:typings 把 options 标成可选,引擎实现不判空,空筛选必须一个参数都不传',
        'packages/ui/src/code/mastergo/host.ts createStyle 的八工厂分支 —— 真机:`jsd_create_style` 的四类新 kind 建得出(id 6:12~6:15),但它们进的是 `assets.variables` 而不是 `assets.styles`;反向 `mg_variables_create type=PAINT`(id 6:45)只进 `assets.styles`,`mg_variables_remove` 对它无效并点名走 `jsd_delete_style`(删后回读判据生效,不再假报 removed)。⇒ 两份清单是同一批资源的两个视角,**按创建路径随机可见**,只有 id 是可靠判据',
        'packages/ui/src/code/mastergo/meta.ts capabilities 声明 styleEnumeration —— 真机:`assets.styles` 列得出来(PAINT / EFFECT 三条,不退超时),0043 的「MG 是否也这样」那一半结掉',
        'packages/ui/src/code/mastergo/ops.ts 三个变量 op 与槽位表(官方文档 URL 见该文件头注释;mg_variables_apply 与 Figma 同形:形制对齐见 dec 0040,一次吃 bindings[] 多组见 dec 7165f370)',
        `${MG}:1832 VariableType 十二项里没有 VARIANT —— 变体属性无从绑变量`,
        'packages/ui/src/code/mastergo/ops.ts removeVariables 的三档 —— 真机 2026-10-19(重载后两轮):单值变量的 deleteVariable **跨执行才生效**(同执行内删两遍 + 回读仍全失败,下一次调用立刻 removed),故同执行回读判失败会把成功报成失败(10-15 那 5 条 failed 即此形态);复合样式变量(PAINT)的 deleteVariable 是 **no-op**(跨多次执行仍在:列表 / assets.variables / 拿它绑图层三面都证明它还活着,同 id 走 jsd_delete_style 一次删掉)',
        'packages/ui/src/code/mastergo/ops.ts createVariables 的 values —— 真机 2026-10-19:setVariableValue 的返回 modes **时有时无**(同批里有的带 bool / floatData,有的只有 {modeId},默认双模式集合回空对象);STRING 变量在列表 / 按 id / 写返回三个读面都只有 {modeId} ⇒ 值不可验证,values 只原样透传不作判据',
        'packages/ui/src/code/mastergo/meta.ts capabilities 声明 variables(0040 起)',
      ],
    },
    // 组件:读侧由门面投影成契约形状(原生是数组),写侧有 mg_add_component_property;
    // `setProperties` 签名是 string|boolean(键必须是 propertyId,名字归一在门面里)。
    // 能力位仍**不声明**:写侧真机未验证通过(meta.ts:12-14)。
    //
    // ⚠ 「MG 的组件属性绑不了变量」这句此前写成了「没有这层关系」,更正:
    // **关系在引擎里存在、类型里读得到**(`ComponentPropertyValue.variableId` :3001,
    // 官方注释「当组件属性绑定到变量时,对应的变量 id,仅 TEXT/BOOLEAN 类型可能存在」),
    // 缺的只是**插件侧写入口**(:3097 只收 string|boolean)。读出口 0024 起已透传
    // (见 `schemas/platform.ts` 的 componentPropertyValueSchema 与
    // `mastergo/property-values.ts` 的 readComponentPropertyValues)—— 只在**组件侧**那张表,
    // 实例侧的 `ComponentProperties`(:3030)没有这一项。
    components: {
      read: 'componentProperties',
      readShape: 'map',
      write: [
        'mg_add_component_property',
        'mg_bind_component_property',
        'mg_edit_component_property',
        'mg_delete_component_property',
        'jsd_set_instance_properties',
      ],
      nativeUnwired: [
        '把组件属性绑成变量:MG 只在读侧给 variableId(:3001),写侧没有任何入口 —— 要绑只能在设计器里手动做,插件只能验证它存不存在',
      ],
      fallback: null,
      evidence: [
        `${MG}:3096 readonly componentProperties: Array<ComponentProperties>`,
        `${MG}:3097 setProperties({ [propertyId: string]: string | boolean })——**不收变量别名**,值绑变量只此 Figma 一家(dicts/platform-value-domain.ts 的第四类表按平台 deny)`,
        `${MG}:3001 ComponentPropertyValue.variableId —— 属性 ↔ 变量的**只读**证据(仅组件侧;实例侧 :3030 无此字段)`,
        `${MG}:2965-2980 ComponentPropertiesMixin(add / edit / delete)`,
        `${MG}:3004 ComponentPropertyType 四项,没有 Figma 的 SLOT(:10985)`,
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
