import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 决策记录引用的不变式(记法与解析见 `scripts/decision-refs.mjs` 的头注释)。
 *
 * 为什么走子进程而不是 import 模块:解析规则只允许**一份实现**(技能脚本里的
 * `new_decision.mjs` 不能被仓内代码 import —— dec 0009 的技能依赖单向化)。CLI 就是那份实现,
 * 测试吃它的 `--json` 输出,顺带把「人用的那条命令」也验一遍。
 *
 * 守的四件事:
 * 1. 每条 `dec <标识>` 都解析得到真实记录 —— 注释里的指针不许悬空;
 * 2. 标识唯一 + 文件名一律以标识开头 —— 撞号(如当年合并撞出的两条 `0039`)当场红;
 * 3. 每条记录至少进一个索引表 —— 「写了记录忘了加行」是纯人祸,但至今没人守;
 * 4. **裸标识引用只许降不许增**(棘轮):判据用「是否等于某个已知标识」而不是
 *    「像不像四位编号」—— 后者会把 97 个 `2026`(日期)、18 个 `1024`(体积)与一片
 *    typings 行号一起算成引用,假命中比真引用还多,门禁直接失去意义。
 */

interface CheckReport {
  problems: string[];
  records: number;
  marked: number;
  unresolved: number;
  bareTotal: number;
  missingFromIndex: string[];
}

/**
 * `check` 在有问题时把退出码置 1(给 CI 用),而**报告仍然打在 stdout** ——
 * 用 execFileSync 会在非零退出时直接抛,拿不到 `problems` 的内容,断言反而说不清是哪条坏了。
 * 故这里用 spawnSync,只读输出、由断言自己判红。
 */
function run(args: string[]): string {
  const result = spawnSync('node', ['scripts/decision-refs.mjs', ...args], {
    // `new URL(...).pathname` 在 Windows 上给 `/D:/...`,拼进 cwd 会 ENOENT
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
  });
  return result.stdout;
}

/**
 * 棘轮基线:仓内注释里**没写 `dec` 前缀**的裸标识引用条数。
 * 旧注释不追认(247 处里混着行号与年份,一次性改写既改不动旧记录正文、又淹死 diff),
 * 但新增引用必须走 `dec <标识>` —— 数值只许变小。降下来之后请把这里一起改小。
 */
const BARE_REF_BASELINE = 435;

describe('决策记录引用', () => {
  const report = JSON.parse(run(['check', '--json'])) as CheckReport;

  it('体检无问题:引用不悬空、标识不撞号、记录都进索引', () => {
    expect(report.problems).toEqual([]);
    expect(report.unresolved).toBe(0);
    expect(report.missingFromIndex).toEqual([]);
  });

  it('两种主键形态都能被同一条命令解析(短 id 不是二等公民)', () => {
    const legacy = run(['resolve', '0024']);
    const short = run(['resolve', '25827d0c']);
    expect(legacy).toContain('docs/design-decisions/0024-');
    expect(short).toContain('docs/design-decisions/25827d0c-');
    // 旧号可省略前导零,短 id 大小写不敏感 —— 两个方向的宽松都由同一函数兜住
    expect(run(['resolve', '24'])).toContain('0024-');
    expect(run(['resolve', '25827D0C'])).toContain('25827d0c-');
  });

  it('dec 记法确实在用(全为 0 说明这条纪律没落地)', () => {
    expect(report.marked).toBeGreaterThan(0);
  });

  it('裸标识引用不超基线(新增引用必须写 dec <标识>)', () => {
    expect(
      report.bareTotal,
      `注释里新增了裸标识引用(${report.bareTotal} > ${BARE_REF_BASELINE})。` +
        '新改动一律写 `dec 0024` / `dec 25827d0c` —— 不带前缀的四位串与年份、' +
        '体积常量、typings 行号无法区分,机器就再也指不回记录了。',
    ).toBeLessThanOrEqual(BARE_REF_BASELINE);
  });
});
