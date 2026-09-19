import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 技能文档的体积不变式(选 skill 做开发时,这些文件会**整份进上下文**)。
 *
 * 为什么守这个:`.agents/skills/**` 不是仓库代码,没有编译期约束,靠"写的人自觉控制长度"
 * 的结果就是 mcp-tdd/SKILL.md 长到 18 KB、archive 长到 59 KB —— 而 SKILL.md 是**触发即全量
 * 加载**的:两个技能一起用,光说明文档就先吃掉约 8–9k token,还是每题都付。更糟的是
 * `docs/design-decisions/INDEX.md`,它在设计模式工作流第 1 步**必读**,每条决策都要先付一次。
 *
 * 所以把"体积"变成断言。超限时正确的动作是**把内容移进按需加载的 references**
 * (SKILL.md 只留主流程 + 指针),不是删掉规则、也不是调高这里的阈值。
 *
 * 各文件的性质不同,上限也不同:
 * - SKILL.md:触发即读,上限最紧。两个加起来还有一条合计线(固定成本就是这么来的);
 * - INDEX.md:每次设计决策都读,但条目会随时间线性增长 —— 最容易失控,故单独设线;
 * - platform-limits.md / gotchas.md / fix-playbook.md:按需读,但"撞一个坑补一行"是
 *   写进技能的纪律,必然增长,给它们留出增量空间即可;
 * - 单条决策记录:只在查决策时按需打开一条,不设上限(但 INDEX.md 必须保持精简)。
 *
 * 台账(docs/mcp-errors/)不在这里守:它整目录不入库,且只被 CLI 聚合,不进上下文。
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 触发即全量加载,最紧的一档 */
const SKILL_BUDGET: Record<string, number> = {
  '.agents/skills/mcp-tdd/SKILL.md': 14 * 1024,
  '.agents/skills/software-design-patterns/SKILL.md': 10 * 1024,
};

/** 两个技能同时生效时的合计固定成本 */
const SKILL_TOTAL_BUDGET = 24 * 1024;

/** 按需加载、但会随时间累积的文件 */
const REFERENCE_BUDGET: Record<string, number> = {
  'docs/design-decisions/INDEX.md': 15 * 1024,
  '.agents/skills/mcp-tdd/references/platform-limits.md': 20 * 1024,
  '.agents/skills/mcp-tdd/references/fix-playbook.md': 14 * 1024,
  '.agents/skills/mcp-tdd/references/gotchas.md': 12 * 1024,
};

const SKILL_DIRS = [
  '.agents/skills/mcp-tdd',
  '.agents/skills/software-design-patterns',
];

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

function sizeOf(rel: string): number {
  return statSync(join(ROOT, rel)).size;
}

function exists(rel: string): boolean {
  try {
    statSync(join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

describe('技能文档体积', () => {
  it('受管的文件都还在(防路径写错后静默通过)', () => {
    const missing = [
      ...Object.keys(SKILL_BUDGET),
      ...Object.keys(REFERENCE_BUDGET),
    ].filter((rel) => !exists(rel));
    expect(
      missing,
      `这些文件不存在,阈值形同虚设:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('SKILL.md 不超过各自上限', () => {
    const over: string[] = [];
    for (const [rel, limit] of Object.entries(SKILL_BUDGET)) {
      const size = sizeOf(rel);
      if (size > limit) {
        over.push(`${rel} ${kb(size)} > ${kb(limit)}`);
      }
    }
    expect(
      over,
      `SKILL.md 触发即全量进上下文。超限时把稳定的表格/清单移进 references,\n` +
        `SKILL.md 只留主流程 + 指针(见 .agents/skills/mcp-tdd/SKILL.md「参考文件」):\n${over.join('\n')}`,
    ).toEqual([]);
  });

  it('两个 SKILL.md 合计不超过固定成本线', () => {
    const total = Object.keys(SKILL_BUDGET).reduce(
      (sum, rel) => sum + sizeOf(rel),
      0,
    );
    expect(
      total,
      `两个技能同时生效时的固定成本 ${kb(total)} 已超 ${kb(SKILL_TOTAL_BUDGET)}`,
    ).toBeLessThanOrEqual(SKILL_TOTAL_BUDGET);
  });

  it('按需加载的累积型文件不超过上限', () => {
    const over: string[] = [];
    for (const [rel, limit] of Object.entries(REFERENCE_BUDGET)) {
      const size = sizeOf(rel);
      if (size > limit) over.push(`${rel} ${kb(size)} > ${kb(limit)}`);
    }
    expect(
      over,
      `这些文件按"撞一个坑补一行"增长,超限时先做滚动归档(见各自的治理阈值说明):\n${over.join('\n')}`,
    ).toEqual([]);
  });

  it('每个技能的 references 顶层文件都被 SKILL.md 引到', () => {
    const orphans: string[] = [];
    for (const dir of SKILL_DIRS) {
      const skill = readFileSync(join(ROOT, dir, 'SKILL.md'), 'utf8');
      const refsDir = join(ROOT, dir, 'references');
      if (!exists(`${dir}/references`)) continue;
      for (const name of readdirSync(refsDir)) {
        const rel = `${dir}/references/${name}`;
        // 子目录里的模式文件由 pattern-index.md 这类索引文件代管,只查顶层
        if (statSync(join(ROOT, rel)).isDirectory()) continue;
        if (!name.endsWith('.md')) continue;
        if (!skill.includes(`references/${name}`)) orphans.push(rel);
      }
    }
    expect(
      orphans,
      `这些文件没写进 SKILL.md 的加载路径 —— 等于写了没人读,或该删:\n${orphans.join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * 现象编号的**废止**守卫。
 *
 * 2026-09-19 前,每个已知现象有一个 `P` + 数字的编号,释义存在
 * `.agents/skills/mcp-tdd/references/timeline.md`。那套编号坏在三处:编号不表达
 * 「什么时候该回退」;同一现象要在字典 / 平台限制清单 / 决策记录里各写一遍,必然漂移;
 * 字典编号与代码编号还差一位,读代码的人先要搞清自己在哪套编号里。
 * 于是字典删除,源码注释、报错文案、测试名、changeset 里的引用一并摘掉 ——
 * 摘的时候保留了编号背后的事实描述,删的只是号码本身。
 *
 * 这条断言防回潮:号码一旦重新出现在源码或技能文档里,就是在重建那份双真相。
 * 要引用某个现象:写文件名 + 函数名,或决策记录编号 `NNNN`。
 * 历史文档(`docs/design-decisions/`、`docs/design-review-*`、`docs/optimization-plan-*`)
 * **不在扫描范围**:按仓库约定「历史只增不改」,已落地的记录保留原文。
 */
const PNUM = /\bP\d{1,2}\b/g;

/** 扫描范围:会进 llm 上下文、或会被用户看到的文本 */
const GUARD_DIRS = ['packages', '.changeset', '.agents'];

function guardFiles(): string[] {
  const files: string[] = [];
  for (const dir of GUARD_DIRS) {
    if (!exists(dir)) continue;
    for (const entry of readdirSync(join(ROOT, dir), { recursive: true })) {
      const rel = `${dir}/${String(entry).replace(/\\/g, '/')}`;
      if (rel.split('/').some((s) => s === 'dist' || s === 'node_modules')) {
        continue;
      }
      if (/\.(ts|tsx|md)$/.test(rel)) files.push(rel);
    }
  }
  if (exists('AGENTS.md')) files.push('AGENTS.md');
  return files;
}

describe('现象编号已废止', () => {
  it('源码与技能文档里不再出现 P 编号', () => {
    const hits: string[] = [];
    for (const rel of guardFiles()) {
      for (const [i, line] of readFileSync(join(ROOT, rel), 'utf8')
        .split('\n')
        .entries()) {
        if (PNUM.test(line)) {
          hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
        }
        PNUM.lastIndex = 0;
      }
    }
    expect(
      hits,
      '这套编号已经废止(字典文件也删了),号码本身不承载任何信息 ——\n' +
        '要引用某个现象请写文件名 + 函数名,或决策记录编号 NNNN:\n' +
        `${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('已删的编号字典没有被顺手带回来', () => {
    const resurrected = [
      '.agents/skills/mcp-tdd/references/timeline.md',
      '.agents/skills/mcp-tdd/scripts/buglog.sh',
    ].filter((rel) => exists(rel));
    expect(
      resurrected,
      `这些文件已随编号体系删除,不该再出现:\n${resurrected.join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * 两个技能的依赖方向:**单向** —— mcp-tdd → software-design-patterns。
 *
 * 为什么值得守:`software-design-patterns` 是可移植的通用技能(模式库 + 决策日志机制),
 * 拷到别的仓库也该能用。一旦它开始引用本仓的缺陷跟踪工具(台账 CLI、指纹、`handle --decision`),
 * 它就从「通用技能」退化成「本仓的一个零件」,复用性归零,而且两边会开始互相抄同一份约定
 * ——正是「同一事实手写多份必然漂移」的老毛病。
 *
 * 所以:判门槛与回填归调用方(mcp-tdd),交接口径由 mcp-tdd 单方面持有,
 * 见 `mcp-tdd/references/bookkeeping.md` 的「转投设计决策」。
 */
const PORTABLE_SKILL = '.agents/skills/software-design-patterns';

describe('技能依赖方向', () => {
  it('software-design-patterns 不引用 mcp-tdd(保持可移植)', () => {
    const hits: string[] = [];
    for (const entry of readdirSync(join(ROOT, PORTABLE_SKILL), {
      recursive: true,
    })) {
      const rel = `${PORTABLE_SKILL}/${String(entry).replace(/\\/g, '/')}`;
      if (!/\.(md|py|json)$/.test(rel)) continue;
      for (const [i, line] of readFileSync(join(ROOT, rel), 'utf8')
        .split('\n')
        .entries()) {
        if (/mcp[-_]tdd|mcp_tdd/i.test(line)) {
          hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
        }
      }
    }
    expect(
      hits,
      '这个技能要能独立拷到别的仓库使用,不该知道本仓的缺陷跟踪工具。\n' +
        '判门槛与证据回填是调用方的事 —— 交接口径由 mcp-tdd 侧的\n' +
        '`references/bookkeeping.md`「转投设计决策」单方面持有:\n' +
        `${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('mcp-tdd 指向 software-design-patterns(升级路径可发现)', () => {
    const skill = readFileSync(
      join(ROOT, '.agents/skills/mcp-tdd/SKILL.md'),
      'utf8',
    );
    expect(
      skill.includes('software-design-patterns'),
      '单向依赖的另一半:mcp-tdd 必须写清「什么时候转过去」,否则复发闸门会变成拦路虎 ——\n' +
        '被拒收的人不知道该去哪儿出决策。见 SKILL.md 的「闸门」一节。',
    ).toBe(true);
    // 闸门段还要能引到完整契约,否则细节只能靠人猜
    const bookkeeping = readFileSync(
      join(ROOT, '.agents/skills/mcp-tdd/references/bookkeeping.md'),
      'utf8',
    );
    expect(
      bookkeeping.includes('software-design-patterns'),
      '交接契约(编号规则 / 证据回填 / 退出条件回退)应落在 `references/bookkeeping.md`。',
    ).toBe(true);
  });
});
