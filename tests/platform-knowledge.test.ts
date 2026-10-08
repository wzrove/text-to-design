import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  componentFaceText,
  componentWriteText,
  variableFaceText,
  variantStrategyText,
} from '../packages/mcp-server/src/tools/platform-facts';
import {
  DOMAIN_CAPABILITY,
  type DomainFact,
  HOST_CAPABILITY_SPEC,
  KNOWLEDGE_DOMAINS,
  METHOD_PARAM_VALUE_KINDS,
  PLATFORM_KNOWLEDGE,
  PLATFORM_METHOD_PARAM_DOMAIN,
  PLATFORMS,
  type PlatformKey,
  platformMethodParamAcceptedKinds,
} from '../packages/shared/src/dicts';

/**
 * 平台事实表与它的投影的不变式(决策见 docs/design-decisions/0032)。
 *
 * 为什么守这些:这张表的**全部价值**在于「一处写、多处用」—— 一旦某个消费方开始
 * 自己写字面量,漂移就回来了(症状是调用方照提示词做事、宿主却不收;0007 明令根除)。
 * 所以这里守的不是「表里填得对不对」(那靠 typings 断言 + 代码审查),而是:
 * - 结构完整:三域 × 三平台**一格不漏**,`null` 也必须是**显式**的(漏格 = 缺事实);
 * - 证据可追溯:每条 evidence 指向真实存在的仓内文件,或写清 typings 的包名 + 行号;
 * - 与 claim 一致:变体域的「有没有替代路径」必须与插件侧 `meta.ts` 的 capabilities 对得上
 *   (表里写「有替代路径」而平台其实 claim 了 inPlaceVariants,说明两处已经漂了);
 * - 投影不串平台:按单平台渲染的文案里**不许出现其它平台的名字**(这正是 prompts
 *   从前「两平台分支全量内联」的病根);
 * - 投影不吐 undefined:表里缺项时渲染会漏出 `undefined` 三个字,那比没有这句话更糟。
 */

const ROOT = new URL('..', import.meta.url).pathname;

/** 一条域事实的全部字段(用于「不许写成 undefined」的巡检) */
const FACT_KEYS = [
  'read',
  'readShape',
  'write',
  'nativeUnwired',
  'fallback',
  'evidence',
] as const satisfies readonly (keyof DomainFact)[];

/** 插件侧能力声明(claim 的唯一真源):从源码文本里抽,避免把沙箱代码当模块引入 */
const META_FILES: Record<PlatformKey, string> = {
  jsdesign: 'packages/ui/src/code/jsdesign/meta.ts',
  figma: 'packages/ui/src/code/figma/meta.ts',
  mastergo: 'packages/ui/src/code/mastergo/meta.ts',
};

function claimedCapabilities(platform: PlatformKey): string[] {
  const text = readFileSync(`${ROOT}${META_FILES[platform]}`, 'utf8');
  const match = /capabilities:\s*\[([^\]]*)\]/s.exec(text);
  if (match == null) {
    throw new Error(`${META_FILES[platform]} 里没找到 capabilities 数组`);
  }
  return [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map(
    (m) => m[1] as string,
  );
}

/**
 * 证据串里抽出仓内路径:取第一个空白分隔的词,再去掉尾部的 `:行号`。
 * 以 `@` 开头的是 typings 事实(指向 node_modules 里的第三方包),不做文件校验。
 */
function repoPathOf(evidence: string): string | null {
  if (evidence.startsWith('@')) return null;
  const firstToken = evidence.split(/\s+/)[0] ?? '';
  const end = firstToken.indexOf(':');
  return end === -1 ? firstToken : firstToken.slice(0, end);
}

/** typings 证据必须能追溯:带 `@x.y.z` 版本,且带行号或明说是「零命中」 */
function typingsEvidenceTraceable(evidence: string): boolean {
  const hasVersion = /@\d+\.\d+\.\d+/.test(evidence);
  const hasLineOrAbsence = /[：:]\d/.test(evidence) || /零命中/.test(evidence);
  return hasVersion && hasLineOrAbsence;
}

describe('平台事实表:结构完整', () => {
  it('三域 × 三平台一格不漏,且缺席写成显式 null / 空数组', () => {
    const problems: string[] = [];
    for (const platform of PLATFORMS) {
      for (const domain of KNOWLEDGE_DOMAINS) {
        const fact: DomainFact = PLATFORM_KNOWLEDGE[platform][domain];
        if (fact == null) {
          problems.push(`${platform}.${domain}:整格缺失`);
          continue;
        }
        // 字段本身由类型守(接口无可选),这里守的是「将来有人改成可选字段却没补数据」:
        // 那时 undefined 会一路漏进渲染,变成文案里的 `undefined` 三个字
        for (const key of FACT_KEYS) {
          const value: unknown = fact[key];
          if (value === undefined) {
            problems.push(
              `${platform}.${domain}.${key}:写了 undefined(缺席要写 null / [])`,
            );
          }
        }
        if (fact.evidence.length === 0) {
          problems.push(`${platform}.${domain}.evidence:没有证据`);
        }
        // read 非空时 readShape 必须给出(形态差异是真实事实:三平台一个是 map 一个 array)
        if ((fact.read == null) !== (fact.readShape == null)) {
          problems.push(
            `${platform}.${domain}:read 与 readShape 必须同时给或同时空`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('域 → 能力位映射指向真实存在的能力位', () => {
    for (const domain of KNOWLEDGE_DOMAINS) {
      expect(Object.keys(HOST_CAPABILITY_SPEC)).toContain(
        DOMAIN_CAPABILITY[domain],
      );
    }
  });

  it('集合级管理入口只出现在 variants 域(它是变体集独有的作用对象)', () => {
    const misused: string[] = [];
    for (const platform of PLATFORMS) {
      for (const domain of KNOWLEDGE_DOMAINS) {
        const ops = PLATFORM_KNOWLEDGE[platform][domain].setLevelOps;
        if (ops == null) continue;
        if (domain !== 'variants') {
          misused.push(`${platform}.${domain} 登记了 setLevelOps`);
        }
        if (ops.length === 0) {
          misused.push(
            `${platform}.${domain} 的 setLevelOps 是空数组(没接就别登记)`,
          );
        }
        // 集合级入口与实例/合并入口是两件事,不该互相串(串了调用方会拿错入口去干错的活)
        const overlap = ops.filter((op) =>
          PLATFORM_KNOWLEDGE[platform][domain].write.includes(op),
        );
        if (overlap.length > 0) {
          misused.push(
            `${platform}.${domain} 的 setLevelOps 与 write 重复:${overlap.join('、')}`,
          );
        }
      }
    }
    expect(misused).toEqual([]);
  });

  it('每条证据都能追溯:仓内文件真实存在,或写清 typings 包名与行号', () => {
    const problems: string[] = [];
    for (const platform of PLATFORMS) {
      for (const domain of KNOWLEDGE_DOMAINS) {
        for (const evidence of PLATFORM_KNOWLEDGE[platform][domain].evidence) {
          const path = repoPathOf(evidence);
          if (path == null) {
            if (!typingsEvidenceTraceable(evidence)) {
              problems.push(
                `${platform}.${domain}:typings 证据要带版本与行号(或明说零命中)→ ${evidence}`,
              );
            }
            continue;
          }
          if (!existsSync(`${ROOT}${path}`)) {
            problems.push(
              `${platform}.${domain}:证据指向不存在的文件 → ${path}`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('平台事实表:与插件侧 claim 一致', () => {
  /**
   * 变体域的「有没有替代路径」**必须**与 `inPlaceVariants` 的 claim 对得上:
   * 能原位合并的平台不存在「替代路径」可记(主路径就通),不能合并的平台才需要记兜底。
   * 这条同时守住表里那些**举例**的平台名(装配期文案会列「某某平台做不到」)——
   * 哪天某个平台补上了原位合并,这里先红,提醒同时改表与 meta。
   *
   * 组件域不做同样比对:MG **读得到** componentProperties(门面投影)却没 claim 能力位,
   * 两者本来就不同义,强行相等会变成错的断言。
   */
  it('变体域有替代路径 ⇔ 该平台未 claim inPlaceVariants', () => {
    const mismatched: string[] = [];
    for (const platform of PLATFORMS) {
      const claims = claimedCapabilities(platform);
      const claimed = claims.includes(DOMAIN_CAPABILITY.variants);
      const hasFallback =
        PLATFORM_KNOWLEDGE[platform].variants.fallback != null;
      if (claimed === hasFallback) {
        mismatched.push(
          `${platform}: claim=${claimed} 但 fallback=${hasFallback ? '有' : '无'}`,
        );
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('组件域读路径非空 ⇔ 能力位在 typings 里确有对应声明(反例已登记)', () => {
    // 三平台里读侧的差别只有一处:jsDesign 读不到(typings 零命中,已由 sync-guarantee 反向断言)
    const readable = PLATFORMS.filter(
      (p) => PLATFORM_KNOWLEDGE[p].components.read != null,
    );
    expect(readable).toEqual(['figma', 'mastergo']);
  });
});

describe('契约方法参数取值域(第四类登记)', () => {
  it('只登记收窄项:Figma 三种值形态全收 ⇒ 不登记', () => {
    expect(PLATFORM_METHOD_PARAM_DOMAIN.figma).toBeUndefined();
  });

  it('登记的 deny 非空且真收窄(不是把全部形态都deny 掉)', () => {
    for (const platform of PLATFORMS) {
      const deny = PLATFORM_METHOD_PARAM_DOMAIN[platform]?.setProperties?.deny;
      if (deny == null) continue;
      expect(
        deny.length,
        `${platform} 的 deny 是空的(应收窄才有意义)`,
      ).toBeGreaterThan(0);
      const accepted = platformMethodParamAcceptedKinds(
        platform,
        'setProperties',
      );
      expect(
        accepted?.length,
        `${platform} 把全部值形态都 deny 了,方法就没法用了`,
      ).toBeGreaterThan(0);
    }
  });

  it('acceptedKinds 与 deny 互补,平台未知时不作承诺', () => {
    for (const platform of PLATFORMS) {
      const deny =
        PLATFORM_METHOD_PARAM_DOMAIN[platform]?.setProperties?.deny ?? [];
      const accepted = platformMethodParamAcceptedKinds(
        platform,
        'setProperties',
      );
      expect(accepted).not.toBeNull();
      expect([...(accepted ?? [])].sort()).toEqual(
        METHOD_PARAM_VALUE_KINDS.filter((k) => !deny.includes(k)).sort(),
      );
    }
    expect(platformMethodParamAcceptedKinds(null, 'setProperties')).toBeNull();
  });
});

describe('投影:平台文案不串平台', () => {
  /** 别的平台名(用于「不该出现」的断言) */
  function otherPlatformNames(platform: PlatformKey): string[] {
    const labels: Record<PlatformKey, string> = {
      jsdesign: '即时设计',
      figma: 'Figma',
      mastergo: 'MasterGo',
    };
    return PLATFORMS.filter((p) => p !== platform).map((p) => labels[p]);
  }

  it('按单平台渲染的变体分流句不含其它平台名', () => {
    for (const platform of PLATFORMS) {
      const text =
        variantStrategyText(platform, true) +
        variantStrategyText(platform, false);
      for (const other of otherPlatformNames(platform)) {
        expect(text, `${platform} 的分流句里出现了 ${other}`).not.toContain(
          other,
        );
      }
    }
  });

  it('按单平台渲染的变量面 / 组件面 / 值形态句不含其它平台名', () => {
    for (const platform of PLATFORMS) {
      const text = [
        variableFaceText(platform),
        componentFaceText(platform),
        componentWriteText(platform),
      ].join('\n');
      for (const other of otherPlatformNames(platform)) {
        expect(text, `${platform} 的文案里出现了 ${other}`).not.toContain(
          other,
        );
      }
    }
  });

  it('装配期(platform=null)反过来必须讲全三平台', () => {
    const labels = ['即时设计', 'Figma', 'MasterGo'];
    const text = [
      variantStrategyText(null, null),
      variableFaceText(null),
      componentFaceText(null),
      componentWriteText(null),
    ].join('\n');
    for (const label of labels) {
      expect(text, `装配期文案漏了 ${label}`).toContain(label);
    }
  });

  it('渲染结果不吐 undefined(表里缺项会以这三个字漏出来)', () => {
    for (const platform of [null, ...PLATFORMS]) {
      const text = [
        variantStrategyText(platform, platform == null ? null : true),
        variantStrategyText(platform, platform == null ? null : false),
        variableFaceText(platform),
        componentFaceText(platform),
        componentWriteText(platform),
      ].join('\n');
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('[object');
    }
  });
});
