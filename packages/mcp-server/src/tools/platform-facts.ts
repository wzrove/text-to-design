import {
  DOMAIN_CAPABILITY,
  type KnowledgeDomain,
  LAYOUT_GRID_UNVERIFIABLE_PLATFORMS,
  PLATFORM_LABEL,
  PLATFORMS,
  type PlatformKey,
  PROP_APPLICABILITY,
  platformDomainFact,
  platformMethodParamAcceptedKinds,
} from 'text-to-design-shared';

/**
 * 平台事实的**唯一渲染点**(数据在 `dicts/platform-knowledge.ts`,句子在这里拼)。
 *
 * 为什么要有这一层:表里装的是**标识符**(工具名 / op 名 / 字段名 / typings 行号),
 * 不是给人读的句子 —— 句子得有人拼,而拼句子的地方恰好有两处:
 * ① **工具描述**:装配期拼一次(`buildServer` 里注册工具时),要覆盖**全部平台**;
 * ② **配方 prompt**:调用期拼,只讲**当前平台**(见 `tools/prompts.ts`)。
 * 两处各写一遍句子,就是同一条事实的第二、第三份措辞 —— 写完就开始漂,这正是 0032
 * 要根除的形态(`core/host.ts` 那条「两平台都收 string|boolean」的注释就是漂出来的)。
 *
 * **本文件不读模块级平台状态**:平台由调用方显式传(`null` = 装配期或未探测)。
 * 两种时机由调用方决定:描述在装配期拼(`buildServer` 早于插件连接,此刻读缓存必然
 * 为空,见 0030),prompt 在调用期拼 —— 本文件不替它们选时机。
 *
 * 「某平台声明了没有」这类**运行期**事实也只由调用方传 `claimed`(取自 ping 回包的
 * capabilities),本文件不重复声明(claim 的唯一真源是插件侧 `meta.capabilities`)。
 * 装配期拿不到运行期 claim 时,本文件用表里**已有的数据**推「哪边是主路径」:
 * `fallback != null` 就说明该域在该平台的主路径走不通(有替代路径才需要记替代路径),
 * 这不是第二份 claim,是从已有事实派生 —— 真正的判据仍在运行期。
 */

/** 要渲染哪些平台:传具体平台只出这一条;传 `null` 出全部(装配期用) */
function targets(platform: PlatformKey | null): readonly PlatformKey[] {
  return platform == null ? PLATFORMS : [platform];
}

/** 平台名(与 ping / 面板同一份投影,见 dicts/platform.ts) */
function label(platform: PlatformKey): string {
  return PLATFORM_LABEL[platform];
}

/** 某平台某域**没声明**时用的替代路径(取自事实表,不在本文件重写) */
function fallbackOf(platform: PlatformKey, domain: KnowledgeDomain): string {
  const fallback = platformDomainFact(platform, domain)?.fallback;
  // 空值只可能来自「能力位说做不到、表里却没记替代路径」这种自相矛盾的状态
  // (tests/platform-knowledge.test.ts 的 claim 一致性断言会先红),此时如实说,别装成有路径
  return fallback ?? '(替代路径未登记 —— 能力位与事实表不一致,请复核)';
}

/**
 * 多状态组件(变体集)怎么做 —— 工具描述与配方共用。
 *
 * 判据是**能力位** `inPlaceVariants`,平台名只作例子。调用期(`claimed != null`,
 * 取自 ping 回包的 capabilities)出精确句;装配期(`claimed == null`)出「按能力位
 * 分流 + 例子」的句子,判断动作留给调用方(它手上才有 capabilities)。
 */
export function variantStrategyText(
  platform: PlatformKey | null,
  claimed: boolean | null,
): string {
  const setLevel = (p: PlatformKey | null): string => {
    const ops =
      p == null ? null : platformDomainFact(p, 'variants')?.setLevelOps;
    if (ops == null || ops.length === 0) return '';
    return `造新维度/新取值不用绕实例:本平台有集合级管理入口(${ops.join(' / ')})—— 先 mg_list_variant_properties 看现状,再建维度/加成分/改取值,每个 op 都写完回读(各自的行为注意写在它的描述里,调用前读一眼);换绑(jsd_set_instance_properties)只负责切到**已有**成分。`;
  };
  if (platform != null && claimed != null) {
    // 「造不出来」不等于「平台上没有变体」:本平台变体集的读面可能照样在(jsDesign 有
    // variantGroupProperties / variantProperties),文档里已有的变体集照样能读能切。
    // 少了这句,调用方会把「脚本造不出集合」推成「这个平台没有变体」,连读都不读了。
    const readFace = platformDomainFact(platform, 'variants')?.read;
    const reuseExisting =
      readFace == null
        ? ''
        : `文档里**已有**的变体集不受影响:\`${readFace}\` 与组件集上的维度取值照常读得到,已有取值照常用 jsd_set_instance_properties 切 —— 缺的只是「用脚本造一个新的」;`;
    const head = claimed
      ? `${label(platform)}声明了原位合并(inPlaceVariants) ⇒ 直接调用即可:并入集合的就是实例所指的 COMPONENT 本身,已有实例链接不断、页面不残留冗余原件,不需要先克隆。`
      : `${label(platform)}未声明原位合并(inPlaceVariants),合成路径在本平台做不出来 —— 别重试、也别去改组件结构。${reuseExisting}替代路径:${fallbackOf(platform, 'variants')}。`;
    const extra = setLevel(platform);
    return extra === '' ? head : `${head}${extra}`;
  }
  // 装配期:按「有没有登记替代路径」分两组(替代路径存在 = 主路径在该平台走不通)
  const needsFallback = PLATFORMS.filter(
    (p) => platformDomainFact(p, 'variants')?.fallback != null,
  );
  const inPlace = PLATFORMS.filter((p) => !needsFallback.includes(p));
  return [
    `按能力位 ${DOMAIN_CAPABILITY.variants} 分流(当前平台声明了没有,以 jsd_ping 的 capabilities 或 jsd://platform/state 为准):`,
    `声明了它的平台走原位合并,直接调即可(如 ${inPlace.map(label).join(' / ')});`,
    `未声明的平台(如 ${needsFallback.map(label).join(' / ')} 这类)合成路径做不出来,别重试也别去改组件结构,改用替代路径:${
      needsFallback.length > 0
        ? fallbackOf(needsFallback[0] as PlatformKey, 'variants')
        : '(未登记)'
    }`,
    '。另外,有的平台还提供**集合级**管理入口(建维度 / 加成分 / 改取值 / 删维度),名单在 jsd_ping 的 platformOps 里 —— 有它就别靠「改成分名字」这类副作用去造新值。',
  ].join('');
}

/**
 * 「组件/实例属性写什么值」—— 工具描述与配方共用。
 *
 * 值形态取自**第四类登记**(`PLATFORM_METHOD_PARAM_DOMAIN`),不在这里手写平台差异:
 * 这正是 `core/host.ts` 那条过时注释的教训(手写的「两平台都收 string|boolean」
 * 在第三平台接入后没人回填)。
 */
export function componentWriteText(platform: PlatformKey | null): string {
  if (platform == null) {
    // 装配期:逐平台列出签名取值域(事实表 + 第四类登记,都不是本文件手写)
    return targets(null)
      .map((p) => {
        const kinds = platformMethodParamAcceptedKinds(p, 'setProperties');
        const fact = platformDomainFact(p, 'components');
        const readPart =
          fact?.read == null
            ? `读不到 ${'componentProperties'}`
            : `读 ${fact.read}`;
        return `${label(p)} 收 ${kinds?.join(' / ') ?? '(未探测)'}(${readPart})`;
      })
      .join(';');
  }
  const fact = platformDomainFact(platform, 'components');
  const kinds = platformMethodParamAcceptedKinds(platform, 'setProperties');
  const parts: string[] = [
    kinds == null
      ? '值形态未探测(先读 jsd://platform/state)'
      : `setProperties 签名收 ${kinds.join(' / ')}`,
  ];
  if (fact != null) {
    parts.push(
      fact.write.length > 0
        ? `写入口:${fact.write.join(' / ')}`
        : '没有可用写入口',
    );
    parts.push(
      fact.read == null
        ? `读侧无 componentProperties(能力位 ${DOMAIN_CAPABILITY.components} 未声明),只能读 variantProperties`
        : `读侧读 ${fact.read} —— 组件属性传读到的**完整键**(短名只在基名唯一时被 core 补齐),变体属性传名字`,
    );
    if (fact.fallback != null) parts.push(`替代路径:${fact.fallback}`);
  }
  return parts.join(';');
}

/**
 * 「本平台的变量面」—— 工具描述与配方共用。
 *
 * 三平台**缺的形态不一样**,不能一句话糊过去:读写都通的可能不止一家(各家的读路径与
 * 写入口名字都不同,故按表逐平台派生);有的平台 typings 里有整套变量 API 但本仓只接了
 * 一部分(可以接,只是没接完);有的平台连 API 都没有(接不了)。把后两者说成一回事,
 * 会让调用方以为换个版本就能用。
 */
export function variableFaceText(platform: PlatformKey | null): string {
  if (platform != null) {
    const fact = platformDomainFact(platform, 'variables');
    if (fact == null) return `${label(platform)}的变量面未登记。`;
    if (fact.write.length > 0) {
      return `${label(platform)}有变量面:读路径 \`${fact.read}\`,写入口 ${fact.write.map((w) => `\`${w}\``).join(' → ')}。`;
    }
    if (fact.nativeUnwired.length > 0) {
      // 「没接」说的是**写**入口。读侧可能已经接了(如 MG 的只读枚举,0039)——
      // 一句「本仓没接」会把「能看到变量清单」也一起否掉,故这里分开讲。
      const readPart =
        fact.read == null
          ? ''
          : `本仓只接了**只读枚举**(读路径 \`${fact.read}\`,进 jsd_get_page 的资源清单),`;
      return `${label(platform)}的 typings 里有变量 API(${fact.nativeUnwired.length} 类入口),${readPart}**写入口一个都没接** —— 属「可以接、只是还没接」,不是平台没有。替代路径:${fallbackOf(platform, 'variables')}`;
    }
    return `${label(platform)}**没有变量能力面**(typings 里没有任何变量声明),别去找变量 op。替代路径:${fallbackOf(platform, 'variables')}`;
  }
  const withWrite = PLATFORMS.filter(
    (p) => (platformDomainFact(p, 'variables')?.write.length ?? 0) > 0,
  );
  const unwired = PLATFORMS.filter(
    (p) =>
      (platformDomainFact(p, 'variables')?.write.length ?? 0) === 0 &&
      (platformDomainFact(p, 'variables')?.nativeUnwired.length ?? 0) > 0,
  );
  const absent = PLATFORMS.filter(
    (p) => !withWrite.includes(p) && !unwired.includes(p),
  );
  // 读写都通的平台可能有**多个**,且各自的读路径/写入口名字不同(0039/0040 起 MG 也在列),
  // 所以这半句必须从表里逐平台派生 —— 硬写 figma 那一条会在 MG 接上后变成假话。
  const withWriteLines = withWrite.map((p) => {
    const fact = platformDomainFact(p, 'variables');
    const writes = (fact?.write ?? []).map((w) => `\`${w}\``).join(' → ');
    return `${label(p)} 读 \`${fact?.read}\`、写 ${writes || '(无)'}`;
  });
  return [
    `变量三平台差别最大,别一句话糊过去:读写都通的 —— ${withWriteLines.join(';')};`,
    `typings 有 API 但本仓未接的(${unwired.map(label).join(' / ') || '无'})—— 属「可以接」;`,
    `连 API 都没有的(${absent.map(label).join(' / ') || '无'})—— 属「接不了」。`,
    '别把后两者当一回事:前者换个版本就能接,后者得换平台。',
  ].join('');
}

/**
 * 「绑定变量时参数怎么传」—— **有变量面的平台之间词汇也不同**:Figma 的绑定字段名就是
 * 读侧字段(`boundProperty` 用 fills/strokes 那套),MG 是官方文档的槽位词
 * (`property` + `value`,如 strokeProperty:'all')。
 *
 * 写在这里而不是在 prompts 里按平台分支:0022/0032 的取向是「平台差异只落声明表与它的
 * 投影点」,配方只做拼接。此前这段只有 Figma 那一份,加了 MG 的写入口后若不拆,配方会把
 * Figma 的字段词汇喂给 MG 的调用方。
 */
export function variableBindBulkText(platform: PlatformKey | null): string {
  if (platform === 'mastergo') {
    return '- 一次调用带多组:`bindings: [{ nodeIds, property, value, variableId?, index?, unbind? }]`,一组 = 一个变量 × 一个槽位 × 一批节点;槽位取值见 `mg_variables_apply` 的描述,传错会在入参校验就点名,数组型属性另给 `index`,不要一个节点一次调用;';
  }
  if (platform === 'figma') {
    return '- 一次调用带多组:`bindings: [{ nodeIds, boundProperty, variableId?, subField?, index?, unbind? }]`,一组 = 一个变量 × 一个字段 × 一批节点,不要一个节点一次调用;节点级字段直接写字段名,fills / strokes 绑在 paint 上,index 省略即该数组全部 SOLID 项,effects / layoutGrids 另给 `subField` + `index`;';
  }
  return '- 绑定一次传多个 `nodeIds`,参数词汇以本平台变量面给的为准,不要一个节点一次调用;';
}

/** 「绑定之后怎么回读」—— 三平台的读面不同:节点字段 / 集合模式 / 没有 */
export function variableBindVerifyText(platform: PlatformKey | null): string {
  if (platform === 'mastergo') {
    return [
      '- ⚠ MG **没有**「图层属性 ↔ 变量」的反读接口:回读只能拿到该图层用到的集合与模式(见 `mg_list_variables`),它证明「集合挂上了」、证不了「挂在该属性上」;',
      '- 所以绑数组属性(fills / effects / grids)**必须**自己给 `index`,并 jsd_export({ids:[节点id], scale=0.5}) 目视确认渲染真的变了 —— 这一条别省。',
    ].join('\n');
  }
  if (platform === 'figma') {
    return [
      '- 回读节点上的绑定,比对里面的 variableId 与你要绑的是同一个 —— **回显成功不等于绑上了**;',
      '- 涉及视觉的改动再 jsd_export({ids:[节点id], scale=0.5}) 导小图目检一次;',
    ].join('\n');
  }
  return '- 回读本平台提供的绑定读面,比对里面的 variableId 与你要绑的是同一个 —— **回显成功不等于绑上了**;';
}

/** 「本平台的绑定读侧长什么样」—— 配方第 2 节正文(读面形态 + id 能否直接回喂) */
export function variableBindShapeText(platform: PlatformKey | null): string {
  if (platform === 'mastergo') {
    return [
      '- MG 的节点上**没有**绑定字段可读:`mg_list_variables` 给出集合 / 模式 / 变量及它们的值,某图层用了哪些集合看 `getLayerVariableModes`;',
      '- 变量 id 取自 `mg_list_variables` 或 `jsd_get_page` 的 `assets.variables`,**可直接回喂**写入口,不用改名、不用补名称。',
    ].join('\n');
  }
  if (platform === 'figma') {
    return [
      '- 读节点上的变量绑定(字段名见上一节):键是引擎的可绑定字段名,值的三态由引擎决定 —— 标量字段是单个别名;fills / strokes / effects / layoutGrids / textRangeFills 是别名数组;componentProperties 是按属性名索引的别名表。**键在 = 至少有一条绑定**(无绑定或平台不提供该字段时整个键省略)。',
      '- 库存与模式走 `figma_variables_list`(集合 / 模式 / 各变量的值);读路径就是写侧的 `boundProperty` 词汇,值里的 id **可直接回喂**写入口,不用改名、不用补名称。',
      '- 引擎口径原样保留:有**独立圆角**的节点上,圆角绑定会表现为 topLeftRadius / topRightRadius / bottomLeftRadius / bottomRightRadius 四条(不归一成 cornerRadius)。',
    ].join('\n');
  }
  return [
    '- 以本平台变量面给出的读路径为准:**键在 = 至少有一条绑定**(平台不提供该字段时整个键省略)。',
    '- 值里的 id **可直接回喂**写入口,不用改名、不用补名称。',
  ].join('\n');
}

/**
 * 「四类可复用件各自的复用入口」—— 设计前那道复用纪律的落地句子。
 *
 * 为什么要单独一段:光说「复用」没用 —— 调用方得知道**每一类怎么复用**才不会退回新建。
 * 入口名字三平台不同(样式与变量尤其),所以按平台给;平台差异只落在这里,
 * 配方只做拼接(0022/0032)。
 */
export function reuseGuideText(platform: PlatformKey | null): string {
  if (platform === 'mastergo') {
    return [
      '- 组件:`jsd_create_instance` 用 `componentId` 铺实例;同类单元 ≥2 个时**先查清单**,别新建重复组件。',
      '- 变体集:切到**已有**取值用 `jsd_set_instance_properties`(取值清单看 `assets.variants[].properties`;MG 原生读不到该字段时用 `mg_list_variant_properties` 看)。要造新值用集合级 op,不要靠改主件名字。',
      '- 样式:节点字段 `fillStyleId` / `strokeStyleId` / `textStyleId` / `effectStyleId` 直接引用样式 id。⚠ 本平台只声明了 `styles`(**按 id 应用**),**没声明 `styleEnumeration`**(列出有哪些样式)—— 四个 `getLocal*Styles` 都在但永不返回(同步调用还会冻死插件线程,见 0043),故 `assets.styles` 与 `jsd://styles` **恒空**:别拿「清单里没有」当「文档里没有」,要复用已有样式就从**正用着它的节点**上读 id(`jsd_find` / `jsd_get_selection` 的 `*StyleId` 字段);确认没有才 `jsd_create_style` 从指定节点抄,并**把回包 id 记账**(这份平台列不出来,丢了找不回;建重复了用 `jsd_delete_style` 按 id 删)。',
      '- 变量:`mg_variables_apply` 绑到图层属性,变量 id 从 `mg_list_variables` 或 `assets.variables` 取。要的是「一组值一起复用」(间距 / 圆角 / 描边宽度 / 填色这套)就建 **复合样式变量**:`mg_variables_create` 的 type 有 PAINT / TEXT / EFFECT / GRID / STROKE_WIDTH / CORNER_RADIUS / PADDING(11 项,**SPACING 引擎不收**)—— 建出来本身就是一条样式,只进 `assets.variables`。',
    ].join('\n');
  }
  if (platform === 'figma') {
    return [
      '- 组件:`jsd_create_instance` 用 `componentId` 铺实例;同类单元 ≥2 个时**先查清单**,别新建重复组件。',
      '- 变体集:切到**已有**取值用 `jsd_set_instance_properties`(取值清单看 `assets.variants[].properties`)。',
      '- 样式:平台 op `figma_style_apply_by_name` 按名应用,或直接写节点字段 `fillStyleId` / `strokeStyleId` / `textStyleId` / `effectStyleId`;**清单里没有就建一条** —— `jsd_create_style` 从指定节点抄。',
      '- 变量:`figma_variables_apply` 绑到节点(变量 id 先 `figma_variables_list` 或从 `assets.variables` 取);**绑进样式里**用 `figma_style_variables_apply`(改一次,所有引用该样式的节点都跟),回读走 `figma_style_variables_list`。',
    ].join('\n');
  }
  if (platform === 'jsdesign') {
    return [
      '- 组件:`jsd_create_instance` 用 `componentId` 铺实例;同类单元 ≥2 个时**先查清单**,别新建重复组件。⚠ 本平台把带 `/` 的组件名拆成「集合 / 成分」—— `assets.components[].name` 是**叶子名**(建 `组/主件` 后清单里叫 `主件`,集合名在 `assets.variants` 上),按名字取组件(`{{@comp:…}}`)时一律照清单里的原样写。',
      '- 变体集:切到**已有**取值用 `jsd_set_instance_properties`(取值清单看 `assets.variants[].properties`)。',
      '- 样式:节点字段 `fillStyleId` / `strokeStyleId` / `textStyleId` / `effectStyleId` 直接引用样式 id(清单见 `assets.styles` 或 `jsd://styles`);**清单里没有就建一条** —— `jsd_create_style` 从指定节点抄。',
      '- 变量:本平台没有变量面(`assets.variables` 恒空),别去找变量入口;统一色板走上一条的样式路。',
    ].join('\n');
  }
  return [
    '- 组件:`jsd_create_instance` 用 `componentId` 铺实例;同类单元 ≥2 个时**先查清单**,别新建重复组件。',
    '- 变体集:切到**已有**取值用 `jsd_set_instance_properties`(取值清单看 `assets.variants[].properties`)。',
    '- 样式:节点上的 `*StyleId` 字段引用样式 id(`jsd_create_style` 能从既有节点建出一条),或本平台提供的按名应用入口(清单见 `jsd://platform/state` 的 platformOps)。',
    '- 变量:本平台的变量入口见 `jsd://platform/state` 的 platformOps(`assets.variables` 恒空即本平台没有变量面)。',
  ].join('\n');
}

/**
 * 「四类可复用件**之间**怎么连」—— 设计策略第 0 条里,选型判据之外的那段关系。
 *
 * 为什么单独一段:`reuseGuideText` 说的是「每一类各自的复用入口」,但真正让调用方选错的
 * 是**连线方式三平台根本不同**:Figma 是「变量 → 样式 → 节点」的三层链,MG 把样式塌进
 * 变量(八项复合样式类型),jsDesign 只有样式一层。缺了这段,Figma 上养成的习惯会被照搬
 * 到 MG 去找「样式的变量绑定」、或搬到即时设计去找变量入口。
 *
 * 取舍写在**这一处**,不在 prompts 里按平台分支重写(0032);平台侧的入口名/读路径仍取
 * `dicts/platform-knowledge.ts`,本函数只拼关系。`styleEnumerated` 由调用方从 ping 回包
 * 的 capabilities 传(claim 的唯一真源是插件侧 meta,本文件不复制,见 0043)。
 */
export function resourceRelationText(
  platform: PlatformKey | null,
  styleEnumerated: boolean | null,
): string {
  const shared = [
    '- **三平台一致的三条**:① 分层是「变量(一个值)→ 样式(一组固定视觉)→ 组件(一组节点)→ 变体(组件的多态维度)」,越往下越贵也越难改;② 「改一处影响全部」有**三种源头** —— 改值(变量)/ 改一组值(样式)/ 改结构(主组件),按差异落在哪一层选,别一律抽组件;③ **变体取值绑变量三家都做不到**:三平台的变量类型表里都没有 `VARIANT`(行号见 `dicts/platform-knowledge.ts` 三家的 evidence)——「切到禁用态时颜色跟着主题变」得拆成两件事:变体只管**结构态**,颜色/间距仍由变量或样式扛。',
    '- **三套词汇别混用**:组件属性走 `jsd_set_instance_properties`,节点字段走 `jsd_set_*`,变量绑定走本平台的变量 op —— 拿错入口的典型症状是「回包成功、画布没变」。',
  ];
  const styleFace =
    styleEnumerated === false
      ? [
          '- ⚠ **样式这一面列不出来**:本平台声明了 `styles`(按 id 应用是通的)但没声明 `styleEnumeration`,故 `assets.styles` / `jsd://styles` **恒空**(0043)。已有样式的 id 只能从**正用着它的节点**上读 `fillStyleId` / `strokeStyleId` / `textStyleId` / `effectStyleId`,新建的必须把 `jsd_create_style` 回包的 id **记账** —— 丢了找不回(重复建了按 id 走 `jsd_delete_style`)。',
        ]
      : [];
  if (platform === 'figma') {
    return [
      '- **Figma:三层链(变量 → 样式 → 节点)三端都通,但一套链一套词汇**,别把三档的字段名混着传:① **节点档** `figma_variables_apply`(width / cornerRadius / opacity… 与 fills / strokes / effects / layoutGrids);② **样式档** `figma_style_variables_apply`(数组档叫 **paints** / effects / layoutGrids —— 节点上的 fills / strokes 在样式上叫 paints,子字段固定 color;排版档 fontFamily / fontSize / … 仅 TEXT 样式);③ **组件属性档** `figma_component_properties_set`(值传 `{type, value:{type:"VARIABLE_ALIAS", id}}`,**只此一家**能这么写)。选哪档就一个问句:**改一次要带动多大一片** —— 一个节点(①)/ 所有引用这条样式的节点(②)/ 所有实例的这个属性(③)。',
      '- **验证走各自的读面,别拿一端的证据宣布另一端生效**:①回读节点 `boundVariables`;②回读 `figma_style_variables_list`(样式档的绑定**只有这里能看到** —— `assets.styles` 只给 id + 名称,节点上的 `boundVariables` 不含样式内部的绑定;`figma_style_variables_apply` 的回包已带写完立刻回读的 `styles[].boundVariables`);③回读 `componentProperties[].boundVariables.value`。',
      '- ⚠ **两类东西绑不了**:变体属性(`VARIANT` —— 变量类型表里没有它)与 `SLOT` 组件属性(读得到、写侧引擎抛 `cannotSetSlotProperty`);样式档里也没有节点字段(圆角、宽高、透明度绑不到样式上,它们本来就属于节点)。',
      '- **改值与删除的口子**:同名同类型再调一次 `figma_variables_create` 就是就地更新(没有独立的改值 op);变量删除走 `figma_variables_remove`(删完空集合会留着,集合与模式的生命周期未接),样式删除走 `jsd_delete_style`。',
      ...styleFace,
      ...shared,
    ].join('\n');
  }
  if (platform === 'mastergo') {
    return [
      '- **MG:变量**包含**样式** —— 不是「变量喂样式」。`mg_variables_create` 的 type 里有八项复合样式(PAINT / TEXT / EFFECT / GRID / STROKE_WIDTH / CORNER_RADIUS / PADDING / SPACING),建出来**本身就是一条样式**。⇒「一组固定视觉,还要随模式切」在 MG 上是**一条变量**、不是一条样式;两条路都通,选错的症状是**在另一半清单里找不到它**:复合样式变量只进 `assets.variables`,不进 `assets.styles`。',
      '- ⚠ **样式与变量共用一套 id 空间,类别词汇还逐字重名**(它的 `getStyleById` 连变量都查得出来)。删除**必须分入口**:变量走 `mg_variables_remove`,样式走 `jsd_delete_style` —— 拿样式入口删变量会**回包成功、变量真没了**(真机 2026-10-14)。名字在两份清单里撞车时,先确认它在哪一面再动。',
      '- **样式面八类都通,但落点分两面**:本平台的 `StyleType` 就是那八项(`:1810`),`jsd_create_style` 全收(后四类 STROKE_WIDTH / CORNER_RADIUS / PADDING / SPACING **只此一家**有工厂 —— 另两家没有,传过去会被写前点名拒)。⚠ 真机 2026-10-14:**`assets.styles` 与 `assets.variables` 是同一批资源的两个视角,列出来的内容不互补、也不可预测** —— 后四类走 `jsd_create_style` 建出来进了 `assets.variables`;而 `mg_variables_create type=PAINT` 建的复合样式变量反过来只出现在 `assets.styles`,`mg_list_variables` 按集合筛、按类型筛都列不出它。⇒ **别拿「哪份清单里有它」当判据**:要确认就用回包的 id 直接读(`getVariableById` / `getStyleById` 共用同一套 id,都解析得出来),要删就按错误提示换入口(两边都会点名拒,不会误删)。',
      '- ⚠ `mg_variables_create` 的 type 只有 **11 项**:typings 的 `VariableType` 列了 SPACING,引擎实建抛 `Unsupported variable type: SPACING`(官方文档也没有它)—— 要 SPACING 走 `jsd_create_style kind=SPACING`。',
      '- ⚠ 复合样式类型的变量**不进 `mg.variables.getVariables()` 列表**(按集合筛、按类型筛都列不出;`getVariableById(id)` 读得到)。op 的回读因此按 id 查,两条都读不到才落 `pendingReadback` —— 看到它**不要重试**,拿 id 走样式侧确认即可。',
      '- ⚠ 这四类的**样式侧枚举面没接**(`getLocalStrokeWidthStyles` 等 MG:1517-1520 未投影成契约成员)—— 但它们会出现在 `assets.variables` 里,所以不是找不到,是**在另一份清单里找**。',
      '- **组件属性 ↔ 变量:读得到、写不了**。`componentProperties[].variableId` 是 MG 给的绑定证据(仅**组件侧**那张表、仅 TEXT/BOOLEAN 属性可能存在),但 `setProperties` 只收 `string|boolean`,平台没有任何写入口 ⇒ 别在这里传 `{type,value:{type:"VARIABLE_ALIAS",…}}`,core 按方法参数登记表点名中止;要绑只能在设计器里手动做,插件这一侧只能验证它存不存在。',
      '- **模式切换没有入口**:`setVariableMode` / `setPageVariableMode` 未接 ⇒ 换主题要么在设计器里手动切模式,要么每个主题各建一套变量 —— 别拿「建了多个 mode」当它已经会跟着切。',
      ...styleFace,
      ...shared,
    ].join('\n');
  }
  if (platform === 'jsdesign') {
    return [
      '- **jsDesign:只有样式一层** —— typings 全文没有任何 variable 声明(`grep -in variable` 零命中),这是**平台没有这个面**,不是「本仓还没接」。⇒ 变量能做的「一个语义 token 随模式/主题变」在这里没有对应物:色板、间距、排版一律落**样式**;深浅两套主题只能建成两套样式族按名字批量重刷(`jsd_find` 定位 → `jsd_batch` 改写),或抽成两个组件族 —— 别去试变量 op(daemon 拦成 `platform_unsupported`,白跑一趟往返)。',
      '- **组件属性只收字符串**:`setProperties` 的签名只有 `string`(布尔 / 换绑 / 文本属性的值形态一概不收)⇒ 状态差异不要押在组件属性上,走「族名 / 状态」命名的多主件;另:给**没有变体属性的实例**调 `jsd_set_instance_properties` 不是报错,是挂到 25s 转发超时(真机 2026-10-14)。',
      '- ⚠ 契约的样式类别是三家 `StyleType` 的**八项并集**,本平台只有四类(PAINT / TEXT / EFFECT / GRID,`plugin-api.d.ts:1137`)⇒ 传 STROKE_WIDTH / CORNER_RADIUS / PADDING / SPACING 会在写前被点名拒(不静默、不会建成别的类);间距与圆角要统一就落节点字段(`jsd_set_layout` / `jsd_set_cornerRadius`),或按「族 / 值」命名后 `jsd_find` + `jsd_batch` 批量刷。',
      '- **变体集造不出来**:`combineAsVariants` 是唯一产出路径且真机必崩,失败还会留下畸形集合与布尔运算残骸(用 `jsd_repair_nodes` 清)。已有的变体集照样能读、能切取值,缺的只是「用脚本新建一个」。',
      ...styleFace,
      ...shared,
    ].join('\n');
  }
  // 平台未探测:只给会漂移的那一条 —— 先探平台再选路
  return [
    '- **三平台的连线方式不同,先探平台再选路**(`jsd_ping` 的 capabilities / `jsd://platform/state`):Figma 是「变量 → 样式 → 节点」三层链,三端都有入口(样式档的绑定靠 `figma_style_variables_list` 才看得见);MasterGo 把样式塌进变量(八项复合样式类型,且与样式共用一套 id 空间、类别词汇逐字重名);即时设计只有样式一层(typings 里没有任何变量声明)。照搬别家做法的典型症状:去找本平台没有的入口,或在另一份清单里找已经建好的那一条。',
    ...(styleEnumerated == null
      ? [
          '- 样式能不能列清单同样按能力位判(`styleEnumeration`):未声明的平台上 `assets.styles` 恒空 —— **别把「列不出来」当「文档里没有」**,已有样式的 id 从节点上的 `*StyleId` 读。',
        ]
      : []),
    ...shared,
  ].join('\n');
}

/** 「本平台的组件属性读侧」—— 供 platformNote / 描述复用 */
export function componentFaceText(platform: PlatformKey | null): string {
  if (platform == null) {
    const readable = PLATFORMS.filter(
      (p) => platformDomainFact(p, 'components')?.read != null,
    );
    const notReadable = PLATFORMS.filter((p) => !readable.includes(p));
    return [
      `组件属性(componentProperties)读侧:${readable.map(label).join(' / ')} 读得到;`,
      `${notReadable.map(label).join(' / ')} 读不到(能力位未声明)。`,
      '它的布尔/文本/换绑路径要靠平台 op 建属性,定义入口见 platformOps 名单。',
    ].join('');
  }
  const fact = platformDomainFact(platform, 'components');
  return fact?.read == null
    ? `${label(platform)}读不到 componentProperties(能力位未声明),只能读 variantProperties。`
    : `${label(platform)}读得到 componentProperties 与 variantProperties(组件属性传带 \`#\` 后缀的完整键,变体属性传名字)。`;
}

/**
 * 「容器怎么排布」—— 自动布局与栅格参考线两条路都在,免得调用方只知道手摆 x/y。
 *
 * 数据取自两张既有声明表,本文件不另立事实:
 * - 宿主类型:`PROP_APPLICABILITY.layoutGrids`(与 core 写路径同一份,见 0022);
 * - 逐平台可落性:`LAYOUT_GRID_UNVERIFIABLE_PLATFORMS`(MG 复验记录,见 0022 的第四类登记)。
 * 「互斥」那句在 `shared/core/props/writers.ts` 的网格 warnings 里还有一份运行期措辞
 * (那条带各平台证据,摘不掉);本条是**事前**提示,两处判据同源。
 */
export function layoutHintText(platform: PlatformKey | null): string {
  const hosts = PROP_APPLICABILITY.layoutGrids.join(' / ');
  const gridStatus = (p: PlatformKey): string =>
    LAYOUT_GRID_UNVERIFIABLE_PLATFORMS.includes(p)
      ? `${label(p)}:\`layoutGrids\` 实测不收(节点级网格不落盘)—— 别重试,要栅格请在设计器里手动加`
      : `${label(p)}:\`layoutGrids\` 可写,写后走双读回读校验,没生效会在结果 warnings 里点名`;
  return [
    '排布有两条路,都可用:① **自动布局** —— `layoutMode=HORIZONTAL|VERTICAL` 配 ',
    '`itemSpacing/padding*/primary|counterAxisSizingMode|primary|counterAxisAlignItems`',
    '(节奏按上一条:归组摆好后用 jsd_set_layout);② **栅格参考线** —— `layoutGrids`(仅 ' +
      hosts +
      ')。',
    '两者互斥:引擎只在**非自动布局**的容器上收网格。',
    targets(platform).map(gridStatus).join(';'),
  ].join('');
}
