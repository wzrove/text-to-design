#!/usr/bin/env node
/**
 * 决策记录的引用解析与反查(仓内唯一实现)。
 *
 * 为什么要有这一份:`de446d4e` 之后主键有两套形态(旧四位数字号 + 8 位短 hex),
 * 解析规则原本只活在 `.agents/skills/software-design-patterns/scripts/new_decision.mjs`
 * 里 —— 技能是项目无关的,仓内代码不许反向依赖它(0009)。于是「注释里写的编号到底指
 * 哪条记录」这件事在本仓**没有任何程序化出口**:只能人肉 grep,而 grep `\b[0-9]{4}\b`
 * 会先撞上 97 个 `2026`(日期)、18 个 `1024`(体积)与一片 typings 行号,假命中比真引用还多。
 *
 * 判据因此换成「是不是已知标识」而不是「像不像编号」:标识集合来自目录里的真实文件名,
 * 年份/行号/体积常量都不在其中,一次过滤同时解决假命中与漏判。
 *
 * 引用记法(新改动一律用它,旧注释不追认):
 *   dec 0024          旧记录,四位号照用
 *   dec 25827d0c      短 id 同理,同一套解析
 * 归属规则:标识写**做出这次形状变更的那条记录**,不是「相关的那条」。
 *
 * CLI:
 *   node scripts/decision-refs.mjs check [--json]     全仓体检(供 tests/decision-refs.test.ts 与 CI)
 *   node scripts/decision-refs.mjs locate <file>      这个文件牵到的记录(带标题与状态)
 *   node scripts/decision-refs.mjs resolve <ident>    单个标识 → 记录路径
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs/design-decisions');
/** 扫引用的代码根(与 `pnpm run typecheck` 覆盖的范围一致) */
const CODE_ROOTS = [
  'packages/shared/src',
  'packages/ui/src',
  'packages/mcp-server/src',
  'tests',
];
const CODE_EXT = ['.ts', '.tsx', '.mjs'];

const SHORT_ID_RE = /^[0-9a-f]{8}$/;
const LEGACY_RE = /^0*(\d{1,4})(?=[-.\s]|$)/;
/** 显式引用:`dec 0024` / `dec 25827d0c` */
const DEC_REF_RE = /\bdec\s+([0-9a-f]{4,8})\b/g;
/** INDEX 表体行:行首必须是 `| [标识](文件名.md)` */
const INDEX_ROW_RE = /^\| \[([^\]]+)\]\(([^)]+\.md)\)/;

/** 从文件名取标识:`a1b2c3d4-标题.md` → `a1b2c3d4`,`0007-标题.md` → `0007` */
export function identOf(filename) {
  const stem = filename.split('.md')[0];
  const short = /^([0-9a-f]{8})-/.exec(stem);
  if (short) return short[1];
  const match = LEGACY_RE.exec(stem);
  return match ? String(Number(match[1])).padStart(4, '0') : null;
}

/** 把一个标识写法归一(两种形态都认,旧号允许省略前导零) */
export function normalizeIdent(value) {
  const v = String(value).trim().toLowerCase();
  if (SHORT_ID_RE.test(v)) return v;
  const match = /^0*(\d{1,4})$/.exec(v);
  return match ? String(Number(match[1])).padStart(4, '0') : null;
}

/** 记录目录 → { 标识 → 文件 } 的索引;`dupes` 是同号多条(歧义已成事实,须迁号) */
export function buildIndex(directory = DOCS) {
  const byIdent = new Map();
  const dupes = [];
  const unnamed = [];
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.md') || name.startsWith('INDEX')) continue;
    const ident = identOf(name);
    if (ident == null) {
      unnamed.push(name);
      continue;
    }
    const list = byIdent.get(ident) ?? [];
    list.push(name);
    byIdent.set(ident, list);
  }
  for (const [ident, list] of byIdent)
    if (list.length > 1) dupes.push([ident, list]);
  return { byIdent, dupes, unnamed };
}

/**
 * 逐行取注释部分:只有注释里的编号才是引用,代码字面量里的不是。
 * ⚠ 判据必须是「这行**以**注释符开头」:早先用 `^\s*\*?\s?(.*)$` 这种可选前缀,
 * 结果整份文件都被当注释收进来(连 `run(['resolve','0039'])` 里的字符串也算引用),
 * 棘轮基线因此虚高、还分不清「代码里的号」与「注释里的引用」。
 */
function commentTextOf(source) {
  const out = [];
  let inBlock = false;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (inBlock) {
      out.push(line.replace(/^\*+ ?/, '').replace(/ ?\*\/$/, ''));
      if (line.endsWith('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('/*')) {
      inBlock = !line.endsWith('*/');
      out.push(line.replace(/^\/\*+ ?/, '').replace(/ ?\*\/$/, ''));
      continue;
    }
    if (line.startsWith('//')) {
      out.push(line.replace(/^\/\/+ ?/, ''));
    }
  }
  return out.join('\n');
}

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (CODE_EXT.some((ext) => entry.name.endsWith(ext))) acc.push(full);
  }
  return acc;
}

/** 全仓引用扫描:`dec` 标注的(必须可解析)与裸标识(棘轮基线,不追认也不许增) */
export function scanRefs(root = ROOT) {
  const { byIdent } = buildIndex();
  const files = [];
  for (const rel of CODE_ROOTS)
    if (existsSync(join(root, rel))) walk(join(root, rel), files);
  const marked = [];
  const bare = [];
  const unresolved = [];
  for (const full of files.sort()) {
    const text = commentTextOf(readFileSync(full, 'utf8'));
    for (const m of text.matchAll(DEC_REF_RE)) {
      const ident = normalizeIdent(m[1]);
      const hit = ident != null && byIdent.has(ident);
      marked.push({ file: relative(root, full), ident: m[1], resolved: hit });
      if (!hit) unresolved.push({ file: relative(root, full), raw: m[1] });
    }
    // 裸标识:整词命中已知标识、且前面不是 `dec `(已计入标注引用)
    for (const ident of byIdent.keys()) {
      const re = new RegExp(
        `(?<!dec\\s)(?<![0-9a-f])${ident}(?![0-9a-f-])`,
        'g',
      );
      const n = (text.match(re) ?? []).length;
      for (let i = 0; i < n; i += 1)
        bare.push({ file: relative(root, full), ident });
    }
  }
  return { marked, bare, unresolved, bareTotal: bare.length };
}

/** 记录 ↔ 索引的覆盖:每条记录至少在主索引或年档里有一行(两处都有=拆档期允许) */
export function indexCoverage(root = ROOT) {
  const { byIdent } = buildIndex(join(root, 'docs/design-decisions'));
  const listed = new Map();
  for (const file of ['INDEX.md', 'INDEX-2026.md']) {
    const full = join(root, 'docs/design-decisions', file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, 'utf8').split('\n')) {
      const m = INDEX_ROW_RE.exec(line);
      if (m == null) continue;
      const ident = normalizeIdent(m[1]);
      if (ident == null) continue;
      const rows = listed.get(ident) ?? [];
      rows.push(file);
      listed.set(ident, rows);
    }
  }
  const missing = [...byIdent.keys()].filter((ident) => !listed.has(ident));
  return { listed, missing };
}

/** 状态行(正文第三条 bullet),供 locate 的读数 */
function statusOf(file) {
  const text = readFileSync(file, 'utf8');
  const m = text.match(/\*\*状态：?\*\*\s*([^\n]*)/);
  return m ? (m[1] ?? '').trim() : '';
}

function _titleOf(name) {
  return name.split('.md')[0].replace(/^[0-9a-f-]+-/, '');
}

function report() {
  const index = buildIndex();
  const refs = scanRefs();
  const coverage = indexCoverage();
  const problems = [];
  if (index.unnamed.length > 0)
    problems.push(`文件名不以标识开头:${index.unnamed.join('、')}`);
  for (const [ident, list] of index.dupes)
    problems.push(
      `同号争一个标识(歧义已成事实):${ident} → ${list.join(' / ')};后到的迁短 id(见 de446d4e)`,
    );
  if (refs.unresolved.length > 0)
    for (const u of refs.unresolved)
      problems.push(`${u.file} 里的 \`dec ${u.raw}\` 解析不到任何记录`);
  if (coverage.missing.length > 0)
    problems.push(`记录没进任何索引表:${coverage.missing.join('、')}`);
  return { problems, refs, coverage, index };
}

function main(argv) {
  const cmd = argv[0] ?? 'check';
  if (cmd === 'locate') {
    const target = resolve(ROOT, argv[1] ?? '');
    const rel = relative(ROOT, target);
    const { byIdent } = buildIndex();
    const text = commentTextOf(readFileSync(target, 'utf8'));
    const idents = new Set();
    for (const m of text.matchAll(DEC_REF_RE)) {
      const ident = normalizeIdent(m[1]);
      if (ident != null) idents.add(ident);
    }
    for (const ident of byIdent.keys())
      if (
        new RegExp(`(?<!dec\\s)(?<![0-9a-f])${ident}(?![0-9a-f-])`).test(text)
      )
        idents.add(ident);
    const rows = [...idents].sort().map((ident) => {
      const name = (byIdent.get(ident) ?? [])[0] ?? '(未落盘)';
      return `${ident}  ${name}\n         状态:${statusOf(join(DOCS, name))}`;
    });
    console.log(`${rel} 牵到 ${rows.length} 条记录:`);
    for (const row of rows) console.log(`  ${row}`);
    return;
  }
  if (cmd === 'resolve') {
    const ident = normalizeIdent(argv[1] ?? '');
    const { byIdent } = buildIndex();
    const hit = ident == null ? null : byIdent.get(ident);
    if (hit == null) {
      console.error(`解析不到:${argv[1]}`);
      process.exitCode = 1;
      return;
    }
    // 输出路径一律 POSIX 分隔符:`join` 在 Windows 上给 `docs\design-decisions\…`,
    // 既不便粘贴,也让吃 stdout 的断言要按平台分支(测试守的就是这条命令的输出)。
    for (const name of hit)
      console.log(join('docs/design-decisions', name).split(sep).join('/'));
    return;
  }
  const out = report();
  if (argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          problems: out.problems,
          records: out.index.byIdent.size,
          marked: out.refs.marked.length,
          unresolved: out.refs.unresolved.length,
          bareTotal: out.refs.bareTotal,
          missingFromIndex: out.coverage.missing,
        },
        null,
        2,
      ),
    );
  } else {
    for (const p of out.problems) console.log(`✗ ${p}`);
    console.log(
      `记录 ${out.index.byIdent.size} 条;dec 标注 ${out.refs.marked.length} 处(未解析 ${out.refs.unresolved.length});裸标识引用 ${out.refs.bareTotal} 处(棘轮基线,只许降不许增)`,
    );
  }
  if (out.problems.length > 0) process.exitCode = 1;
}

// `process.argv[1]` 是**调用时怎么写**的路径(相对或绝对),而 `import.meta.url` 恒为绝对
// file: URL —— 两边不归一成绝对路径就永远不相等,main 静默不执行(CLI 无输出、测试的
// `JSON.parse('')` 直接炸)。故这里 resolve 后比对,不用 `file://${argv[1]}` 拼字符串。
const invokedPath = process.argv[1] != null ? resolve(process.argv[1]) : '';
if (invokedPath !== '' && fileURLToPath(import.meta.url) === invokedPath)
  main(process.argv.slice(2));
