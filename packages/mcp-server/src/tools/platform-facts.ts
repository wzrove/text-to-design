import {
  DOMAIN_CAPABILITY,
  type KnowledgeDomain,
  PLATFORM_KNOWLEDGE,
  PLATFORM_LABEL,
  PLATFORMS,
  type PlatformKey,
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
    const head = claimed
      ? `${label(platform)}声明了原位合并(inPlaceVariants) ⇒ 直接调用即可:并入集合的就是实例所指的 COMPONENT 本身,已有实例链接不断、页面不残留冗余原件,不需要先克隆。`
      : `${label(platform)}未声明原位合并(inPlaceVariants),合成路径在本平台做不出来 —— 别重试、也别去改组件结构。替代路径:${fallbackOf(platform, 'variants')}。`;
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
        : `读侧读 ${fact.read} —— 属性名需与读到的键完全一致`,
    );
    if (fact.fallback != null) parts.push(`替代路径:${fact.fallback}`);
  }
  return parts.join(';');
}

/**
 * 「本平台的变量面」—— 工具描述与配方共用。
 *
 * 三平台**缺的形态不一样**,不能一句话糊过去:Figma 读写都通;有的平台 typings 里
 * 有整套变量 API 但本仓一个 op 都没接(可以接,只是没接);有的平台连 API 都没有
 * (接不了)。把后两者说成一回事,会让调用方以为换个版本就能用。
 */
export function variableFaceText(platform: PlatformKey | null): string {
  if (platform != null) {
    const fact = platformDomainFact(platform, 'variables');
    if (fact == null) return `${label(platform)}的变量面未登记。`;
    if (fact.write.length > 0) {
      return `${label(platform)}有变量面:读路径 \`${fact.read}\`,写入口 ${fact.write.map((w) => `\`${w}\``).join(' → ')}。`;
    }
    if (fact.nativeUnwired.length > 0) {
      return `${label(platform)}的 typings 里有变量 API(${fact.nativeUnwired.length} 类入口),但本仓**没接**:现在没有可用写入口 —— 属「可以接、只是还没接」,不是平台没有。`;
    }
    return `${label(platform)}**没有变量能力面**(typings 里没有任何变量声明),别去找变量 op。`;
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
  return [
    `变量三平台差别最大:读写都通的,读 \`${PLATFORM_KNOWLEDGE.figma.variables.read}\`、写走两个 op(${withWrite.map(label).join(' / ') || '(无)'});`,
    `typings 有 API 但本仓未接的(${unwired.map(label).join(' / ') || '无'})—— 属「可以接」;`,
    `连 API 都没有的(${absent.map(label).join(' / ') || '无'})—— 属「接不了」。`,
    '别把后两者当一回事:前者换个版本就能接,后者得换平台。',
  ].join('');
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
    : `${label(platform)}读得到 componentProperties 与 variantProperties(属性名需与读到的键完全一致)。`;
}
