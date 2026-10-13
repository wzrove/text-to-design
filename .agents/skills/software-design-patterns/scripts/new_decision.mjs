#!/usr/bin/env node
/**
 * Create a new design-decision record and update the index.
 *
 * Usage:
 *     node scripts/new_decision.mjs "用 Strategy 替换支付渠道分支"
 *     node scripts/new_decision.mjs "..." --dir docs/design-decisions
 *     node scripts/new_decision.mjs "..." --supersedes 0003
 *     node scripts/new_decision.mjs --status 0003 已采纳
 *     node scripts/new_decision.mjs --status a1b2c3d4 已采纳
 *
 * 零依赖,只用 Node 内置模块(与仓库根 scripts/*.mjs 同一取向:不引第三方 CLI 库)。
 *
 * 标识分两套并存（用户 2026-10-11 定案,见决策记录 de446d4e）：
 * - 旧记录：4 位数字号,文件名与引用一律不动；
 * - 新记录：`randomUUID` 前 8 位十六进制。多人各自从同一基线开分支时,
 *   `max+1` 必然撞号,而 id 由随机数决定,跨分支不共享计数器所以不会撞。
 * 占号用 `O_CREAT|O_EXCL`(`fs` flag `wx`)：同一分钟内两人各跑一次也只有一个赢家。
 */
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// 与 references/decision-log.md 的候选顺序一致,新增项目级目录时两处同步改。
const CANDIDATE_DIRS = [
  'docs/design-decisions',
  'docs/adr',
  'docs/decisions',
  'ADR',
];
const TEMPLATE = join(HERE, '..', 'assets', 'decision-record-template.md');
// assets/decision-record-template.md 的状态取值,是封闭词表：写错状态会让日志无法被扫。
const VALID_STATUSES = ['提议', '已采纳', '已被取代', '已废弃'];
const INDEX_HEADER =
  '# 设计决策索引\n\n' +
  '| 编号 | 标题 | 状态 | 影响范围 | 最后更新 |\n|---|---|---|---|---|\n';
const LEGACY_RE = /^0*(\d{1,4})(?=[-.\s]|$)/;
const SHORT_ID_RE = /^[0-9a-f]{8}$/;
// 行首既可能是裸号 `| 0039 |`,也可能是带链接的 `| [0039](0039-xxx.md) |`：
// 只认前者会让新行一律掉到文件末尾（实测踩过）,所以链接形态必须匹配。
const ROW_RE = /^\|\s*\[?(\d+|[0-9a-f]{8})\]?(?:\]\([^)]*\))?\s*\|/;
const STATUS_RE = /^(-\s*\*\*状态：\*\*\s*).*$/m;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 把用户写的各种形态归一成 id 字符串：`7`/`0007`/`0007-标题.md` -> `0007`；短 id 原样。 */
function normalizeIdent(value) {
  const v = String(value).trim().toLowerCase();
  if (SHORT_ID_RE.test(v)) return v;
  const match = LEGACY_RE.exec(v);
  return match ? String(Number(match[1])).padStart(4, '0') : null;
}

/** 从文件名取标识：`a1b2c3d4-标题.md` -> `a1b2c3d4`,`0007-标题.md` -> `0007`。 */
function identOf(filename) {
  const stem = filename.split('.md')[0];
  const short = /^([0-9a-f]{8})-/.exec(stem);
  if (short) return short[1];
  return normalizeIdent(stem);
}

/** Filesystem-safe file-name fragment; keeps CJK, drops separators. */
function slug(title) {
  let name = title.trim().replace(/[\s　]+/g, '-');
  name = name.replace(/[<>:"/\\|?*]/g, '-');
  name = name.replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return name || 'decision';
}

function resolveDir(explicit) {
  if (explicit) return explicit;
  for (const candidate of CANDIDATE_DIRS) {
    if (existsSync(candidate)) return candidate;
  }
  return CANDIDATE_DIRS[0];
}

/** 随机短 id + 独占创建：撞号（跨分支同 id 落到同一目录）就换一个重试。 */
function claimRecord(directory, title) {
  for (let i = 0; i < 20; i++) {
    const ident = randomUUID().replace(/-/g, '').slice(0, 8);
    const path = join(directory, `${ident}-${slug(title)}.md`);
    try {
      // flag 'wx' = O_CREAT|O_EXCL|O_WRONLY：已存在就抛 EEXIST
      closeSync(openSync(path, 'wx'));
    } catch (e) {
      if (e.code === 'EEXIST') continue;
      throw e;
    }
    return path;
  }
  throw new Error('连续 20 次短 id 都撞上了,检查目录里是不是已有同名文件');
}

function findRecord(directory, ident) {
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.md') || name.startsWith('INDEX')) continue;
    if (identOf(name) === ident) return join(directory, name);
  }
  return null;
}

/** Flip a record's 状态 line. Returns the record path, or null if not found. */
function setRecordStatus(directory, ident, status) {
  const record = findRecord(directory, ident);
  if (record === null) return null;
  const text = readFileSync(record, 'utf8');
  const updated = text.replace(STATUS_RE, (_m, head) => head + status);
  if (updated !== text) writeFileSync(record, updated, 'utf8');
  return record;
}

function render(template, ident, title, supersedes) {
  const related = supersedes ? `取代 ${supersedes}` : 'N/A';
  // replaceAll:模板里 `{YYYY-MM-DD}` 出现两处(日期行 + 变更历史行),
  // 用 replace 只换第一处,变更历史那行会留下没展开的占位符
  return template
    .replaceAll('{序号}. {标题}', `${ident}. ${title}`)
    .replaceAll('{序号}', ident)
    .replaceAll('{标题}', title)
    .replaceAll('{YYYY-MM-DD}', today())
    .replaceAll('{被取代的记录号，或 N/A}', related);
}

function rowIdent(line) {
  const match = ROW_RE.exec(line);
  if (!match) return null;
  const raw = match[1];
  return SHORT_ID_RE.test(raw) ? raw : String(Number(raw)).padStart(4, '0');
}

/** Rewrite the 状态 cell of one index row. false if INDEX/row missing. */
function setIndexStatus(directory, ident, status) {
  const index = join(directory, 'INDEX.md');
  if (!existsSync(index)) return false;
  const lines = readLines(index);
  for (let i = 0; i < lines.length; i++) {
    if (rowIdent(lines[i]) !== ident) continue;
    const eol = /\r?\n$/.exec(lines[i])?.[0] ?? '\n';
    const cells = lines[i].replace(/\r?\n$/, '').split('|');
    // ['', 编号, 标题, 状态, 影响范围, 最后更新, '']
    if (cells.length < 6) return false;
    // 状态列是「词表值 + ≤12 字标注」(口径见决策 89d02d1b)。目标词表值与现值相同时
    // 保留已有标注 —— 否则 `--status x 已采纳` 会把「已采纳（scratch 已验）」的取证
    // 状态一笔抹掉,那是删证据而不是改状态。
    const current = cells[3].trim();
    if (current !== status && current.startsWith(`${status}（`)) return true;
    cells[3] = ` ${status} `;
    lines[i] = `${cells.join('|')}${eol}`;
    writeFileSync(index, lines.join(''), 'utf8');
    return true;
  }
  return false;
}

/**
 * Insert the row inside the table body — never after later sections.
 *
 * 数字行按号插到该在的位置；短 id 行没有可比顺序,一律追加到表尾。
 * 行首写成 `[标识](文件名)`：INDEX 的编号列一直是可达链接,裸标识会让该行
 * 在表里看起来像没登记（手工补的旧行全是链接形态）。
 */
function updateIndex(directory, ident, title, filename) {
  const index = join(directory, 'INDEX.md');
  if (!existsSync(index)) writeFileSync(index, INDEX_HEADER, 'utf8');
  const row = `| [${ident}](${filename}) | ${title} | 提议 | 待补充 | ${today()} |\n`;
  const lines = readLines(index);

  let insertAt = null;
  let lastRow = null;
  const numeric = !SHORT_ID_RE.test(ident);
  for (let i = 0; i < lines.length; i++) {
    const raw = rowIdent(lines[i]);
    if (raw === null) continue;
    lastRow = i;
    if (numeric && !SHORT_ID_RE.test(raw) && Number(raw) > Number(ident))
      insertAt = i;
  }
  if (insertAt === null) {
    // 没有更大的号：落在最后一行之表尾,仍在后续小节之前。
    insertAt = lastRow === null ? lines.length : lastRow + 1;
  }
  lines.splice(insertAt, 0, row);
  writeFileSync(index, lines.join(''), 'utf8');
}

/** 保留每行原有的换行符,读写往返不改变文件其余字节。 */
function readLines(path) {
  const text = readFileSync(path, 'utf8');
  const parts = text.split(/(\r?\n)/);
  const lines = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push(parts[i] + (parts[i + 1] ?? ''));
  }
  return lines;
}

function runStatus(directory, identArg, status) {
  /** Promote / retire an existing record without creating a new one. */
  if (!VALID_STATUSES.includes(status)) {
    console.error(
      `error: 状态必须是 ${VALID_STATUSES.join(' / ')}，收到 '${status}'`,
    );
    return 1;
  }
  const ident = normalizeIdent(identArg);
  if (ident === null) {
    console.error(`error: 标识应为 4 位数字或 8 位短 id，收到 '${identArg}'`);
    return 1;
  }
  const record = setRecordStatus(directory, ident, status);
  if (record === null) {
    console.error(`error: 找不到记录 ${ident}（目录 ${directory}）`);
    return 1;
  }
  console.log(`status:  ${record} (状态 -> ${status})`);
  if (setIndexStatus(directory, ident, status)) {
    console.log(`index:   ${join(directory, 'INDEX.md')} (行状态已同步)`);
  } else {
    console.error(
      `warning: ${join(directory, 'INDEX.md')} 里没有 ${ident} 这一行，请手工补`,
    );
  }
  return 0;
}

function parseArgs(argv) {
  const out = {
    title: null,
    dir: null,
    supersedes: null,
    status: null,
    extra: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' || a === '--supersedes') {
      out[a.slice(2)] = argv[++i];
    } else if (a === '--status') {
      out.status = [argv[++i], argv[++i]];
    } else if (a.startsWith('--')) {
      out.extra.push(a);
    } else if (out.title === null) {
      out.title = a;
    } else {
      out.extra.push(a);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.extra.length > 0) {
    console.error(
      `error: 未知道的参数 ${args.extra.join(' ')}（可用：--dir / --supersedes / --status 标识 状态）`,
    );
    return 1;
  }
  if (args.status) {
    if (args.status.some((v) => v === undefined)) {
      console.error('error: --status 需要两个值：标识 状态');
      return 1;
    }
    if (args.title || args.supersedes) {
      console.error('error: --status 不能与标题或 --supersedes 同时使用');
      return 1;
    }
    return runStatus(resolveDir(args.dir), args.status[0], args.status[1]);
  }

  if (!args.title) {
    console.error('error: 缺少标题（或改用 --status 标识 状态）');
    return 1;
  }
  if (!existsSync(TEMPLATE)) {
    console.error(`error: template not found at ${TEMPLATE}`);
    return 1;
  }

  const directory = resolveDir(args.dir);
  mkdirSync(directory, { recursive: true });

  let supersedes = args.supersedes;
  if (supersedes != null) {
    supersedes = normalizeIdent(supersedes);
    if (supersedes === null) {
      console.error(
        `error: --supersedes expects a record id, got '${args.supersedes}'`,
      );
      return 1;
    }
  }

  const path = claimRecord(directory, args.title);
  const filename = basename(path);
  const ident = identOf(filename);
  writeFileSync(
    path,
    render(readFileSync(TEMPLATE, 'utf8'), ident, args.title, supersedes),
    'utf8',
  );
  updateIndex(directory, ident, args.title, filename);

  if (supersedes !== null) {
    const replaced = setRecordStatus(directory, supersedes, '已被取代');
    if (replaced === null) {
      console.error(
        `warning: record ${supersedes} not found; mark it 已被取代 by hand`,
      );
    } else {
      setIndexStatus(directory, supersedes, '已被取代');
      console.log(`superseded: ${replaced} (状态 -> 已被取代)`);
    }
  }
  console.log(`created: ${path}`);
  console.log(`index:   ${join(directory, 'INDEX.md')}`);
  console.log(
    'next: fill in 压力 / 候选与排除 / 结论 / 实施方案 / 成本与退出条件 / 验证 / 变更历史',
  );
  return 0;
}

process.exit(main());
