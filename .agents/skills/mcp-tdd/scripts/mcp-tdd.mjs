#!/usr/bin/env node
/**
 * mcp-tdd — text-to-design MCP 测试驱动开发台账 CLI
 *
 * 零依赖 ESM。台账默认落在 <repo-root>/docs/mcp-errors/。
 * 用法见 `node scripts/mcp-tdd.mjs help`,或 .agents/skills/mcp-tdd/SKILL.md。
 *
 * 设计要点(不要随手改,改了会破坏去重语义):
 * 1. 事件流 errors.jsonl 只追加、不重写 —— 便于 git diff / review。
 * 2. 报错身份由 fingerprint(tool + 归一化文案的 sha1 前 12 位)决定,
 *    与节点 id、坐标、耗时等可变片段无关。
 * 3. 已闭环指纹在 handled.json 里 —— 命中即"不再记录"(只累加抑制计数)。
 *    唯一例外:回归阶段(--stage regress)再次命中,说明修复没生效,
 *    记一条 state=regressed 并高声告警,不允许静默吞掉。
 */

import { createHash } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- 路径解析

/** 脚本位于 <root>/.agents/skills/mcp-tdd/scripts/,上溯 4 层即仓库根 */
function repoRoot() {
  if (process.env.MCP_TDD_ROOT) return resolve(process.env.MCP_TDD_ROOT);
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '..');
}

const ROOT = repoRoot();
const LEDGER = join(ROOT, 'docs', 'mcp-errors');
const EVENTS = join(LEDGER, 'errors.jsonl');
const HANDLED = join(LEDGER, 'handled.json');
const RUNS_DIR = join(LEDGER, 'runs');
const CASES_DIR = join(LEDGER, 'cases');
const CURSOR = join(LEDGER, '.log-cursor.json');
const README = join(LEDGER, 'README.md');
const ARCHIVE_DIR = join(LEDGER, 'archive');
const ARCHIVE_EVENTS_DIR = join(ARCHIVE_DIR, 'events');
const ARCHIVE_HANDLED = join(ARCHIVE_DIR, 'handled.json');
const ARCHIVE_INDEX = join(ARCHIVE_DIR, 'INDEX.json');
const DEFAULT_LOG =
  process.env.TEXT_TO_DESIGN_MCP_LOG ?? '/tmp/text-to-design-mcp.log';

// ---------------------------------------------------------------- 小工具

const now = () => new Date().toISOString();

/** ISO → 文件名安全的时间戳(20260918T022633Z) */
const stamp = (iso = now()) => iso.replace(/[-:]|\.\d+/g, '');

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readEvents() {
  if (!existsSync(EVENTS)) return [];
  const out = [];
  for (const line of readFileSync(EVENTS, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // 坏行跳过,不阻塞 list
    }
  }
  return out;
}

function readHandled() {
  const db = readJson(HANDLED, { version: 1, entries: {} });
  if (!db.entries) db.entries = {};
  return db;
}

/**
 * 归档库(已闭环但已终结的指纹)。**必须参与去重判定** —— 否则 archive 会把
 * 「已修好的 bug 不再记录」这条闸门拆掉:同一个 bug 归档后再冒出来会被当新错误
 * 重新记账,清单又被噪音填满。归档是搬走,不是注销。
 */
function readArchive() {
  const db = readJson(ARCHIVE_HANDLED, { version: 1, entries: {} });
  if (!db.entries) db.entries = {};
  return db;
}

function rel(p) {
  return p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;
}

/** 极简 argv 解析:--key value / --key=value / --flag / 位置参数 */
function parseArgs(argv) {
  const out = { _: [] };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      rest.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq !== -1) {
      const k = a.slice(2, eq);
      const v = a.slice(eq + 1);
      out[k] = k in out ? [].concat(out[k], v) : v;
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = key in out ? [].concat(out[key], next) : next;
      i += 1;
    }
  }
  return { flags: out, rest };
}

function listify(v) {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function out(s) {
  process.stdout.write(`${s}\n`);
}

function die(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

// ---------------------------------------------------------------- 指纹

/**
 * 归一化报错文案 —— 抹掉可变片段,保留可判别的语义骨架。
 * 例:
 *   没有找到组件: 23:1456                     → 没有找到组件: <id>
 *   参数校验失败(jsd_set_fill_color): color: ... → 参数校验失败(<tool>): color: ...
 *   请求超时: r431 jsd_export 耗时=30021ms      → 请求超时: <id> <tool> 耗时=<n>ms
 */
export function normalize(message, tool) {
  let s = String(message ?? '').trim();
  if (tool) {
    // 工具名单独进指纹分量,文案里出现的位置统一成占位
    s = s.split(tool).join('<tool>');
  }
  s = s
    .replace(/`[^`]*`/g, '<v>') // `code`
    .replace(/「[^」]*」/g, '<v>') // 「名称」
    .replace(/"[^"]{0,120}"/g, '<v>') // "字符串"(含 JSON 片段)
    .replace(/'[^']{0,120}'/g, '<v>')
    .replace(/\b\d+:\d+\b/g, '<id>') // 设计软件节点 id 23:1456
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>') // uuid / 长十六进制
    .replace(/\br\d+\b/g, '<id>') // transport 请求号 r431
    .replace(/\b\d{4,}\b/g, '<n>') // 端口、耗时、偏移
    .replace(/\s+/g, ' ')
    .trim();
  return s || String(message ?? '').trim();
}

export function fingerprint(message, tool) {
  const h = createHash('sha1')
    .update(`${tool ?? '(daemon)'}\u0000${normalize(message, tool)}`)
    .digest('hex');
  return h.slice(0, 12);
}

// ---------------------------------------------------------------- init

const LEDGER_README = `# MCP 报错台账(mcp-tdd)

由 \`.agents/skills/mcp-tdd\` 维护。**改台账请走 CLI,不要手改 jsonl** —— 指纹与状态
由脚本维护,手改会破坏去重。

本台账是 jsDesign MCP 报错的**唯一记账通道**。结论写这里,不写 md:
平台限制的现行口径在技能的 \`references/platform-limits.md\`,修复理由在 \`docs/design-decisions/\`。
现象**不用编号** —— 报错认指纹(\`list\` 的「骨架」行),平台限制认现象描述,修复理由认决策记录。

**整个目录不入库**(仓库根 \`.gitignore\` 里写着 \`docs/mcp-errors/\`):台账是本机数据 ——
闭环库 / 用例 / run 元信息只对跑过它的那台机器有意义。新克隆的仓库不需要它 ——
\`init\`(以及任何命令)会自动重建目录与本 README。

文件构成:

| 文件 | 作用 | 可否手改 |
| --- | --- | --- |
| \`errors.jsonl\` | 追加式事件流,每条 = 一次报错观察(**本机数据**) | 否(只由 \`record\`/\`scan-log\` 追加;\`archive\` 会搬走已终结的部分) |
| \`handled.json\` | 已闭环指纹库,= 去重闸门 | 否(用 \`handle\`/\`unhandle\`/\`archive\`) |
| \`cases/<caseId>.json\` | 可重放的设计任务用例(回归依据) | 可(用例本身是测试资产) |
| \`runs/<runId>.json\` | 一次设计任务的元信息 | 否 |
| \`.log-cursor.json\` | daemon 日志采集位点 | 否 |
| \`REPORT.md\` | \`report\` 生成的当前未决报错快照 | 否(会被覆盖) |
| \`archive/handled.json\` | 已归档的闭环条目(**不是删除**,见下节) | 否(只由 \`archive\`) |
| \`archive/events/<YYYY-MM>.jsonl\` | 已归档事件,按事件月份分片 | 否 |
| \`archive/INDEX.json\` | 归档账本:分片 → 指纹数 / 事件数 / 时间范围 | 否 |

## 归档

事件流只追加、闭环库只增 —— 这保证证据链完整,代价是主库无限增长。\`archive\` 把**已经终结**
的那部分搬走,主库只留活跃项:

\`\`\`bash
node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs archive --dry-run          # 先看要搬什么
node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs archive --older-than 30d  # 默认就是 30d
\`\`\`

**判据(三条全满足才搬)**:在 \`handled.json\` 里、\`handledAt\` 早于阈值、\`handledAt\` 之后
没有任何事件。→ \`regressed\` 的指纹**永不归档**。

**归档 ≠ 遗忘**,这是它必须走 CLI 而不是手删文件的原因:去重闸门会同时查归档库 ——

- 归档过的指纹再冒出来(\`--stage record\`):仍然 \`suppressed\`,只是多带 \`archived: true\`;
- **在回归阶段复发(\`--stage regress\`)**:不能静默吞掉。条目会被搬回主库并记一条
  \`state=regressed\`,与从未归档过的指纹行为完全一致。归档不是「把这笔账注销」。

\`list --archived\` 查归档内容;主库的 \`list\`/\`--all\` 不含归档项。

## 状态语义

| 状态 | 判定 | 含义 |
| --- | --- | --- |
| \`open\` | 有事件、不在 \`handled.json\` | 未处理,待排查 |
| \`regressed\` | 在 \`handled.json\`,但 \`handledAt\` 之后又出现事件 | 修复未生效或已回退,**优先处理** |
| \`handled\` | 在 \`handled.json\` 且无更新事件 | 已闭环,后续同指纹不再记录(仅累加抑制计数) |

## 闭环判定(verdict)

\`handle\` 时必须给一个判定,决定这条错误"算谁的问题":

| verdict | 含义 | 闭环方式 |
| --- | --- | --- |
| \`product-bug\` | MCP 代码缺陷(默认) | 改代码 → 回归通过 → handle |
| \`usage-error\` | 调用方参数/前置条件写错,非缺陷 | 修正用例 → handle |
| \`environment\` | 插件离线、端口占用等环境问题 | 不修代码,记录并提示用户 |

只有 \`product-bug\` 需要回归证据。\`handle\` 会拿 \`--verified-by <runId>\` 去
\`runs/<runId>.json\` 与事件流里核对:run 不存在、或该指纹在回归 run 里复发,**直接拒绝**;
回归 run 里夹带别的报错则告警放行。无法回归时用 \`--force --note "原因"\`,
条目会带 \`forced: true\` 供日后 review。

## 设计决策互链

\`handle --decision <NNNN>\` 把闭环挂到设计决策记录上(位置按项目约定,依次找
\`docs/design-decisions\` / \`docs/adr\` / \`docs/decisions\` / \`ADR\`)。挂上之后两边互为索引:
\`list --decision 0007\` 查这条决策关联的报错死没死;决策记录的「验证」段填回归 runId
与指纹,而不是只写原则。

**已闭环过、且在回归阶段真复发的指纹 \`--decision\` 是强制的** —— 复发说明上次的修法没消
根因,继续当单点 bug 改只会再复发一次。\`unhandle\` 后重闭环(修正误判)不算,确无结构问题时
用 \`--force --note "原因"\` 显式豁免。

## 事件字段

\`\`\`json
{
  "id": "err-20260918T022633Z-a1b2c3",
  "fingerprint": "9f2c1ab34de5",
  "tool": "jsd_set_fill_color",
  "message": "参数校验失败(jsd_set_fill_color): color: 非法",
  "normalized": "参数校验失败(<tool>): color: 非法",
  "channel": "agent | log",
  "stage": "record | regress",
  "caseId": "case-20260918-0001",
  "runId": "run-20260918T022633Z",
  "args": {},
  "state": "open | regressed",
  "ts": "2026-09-18T02:26:33.092Z"
}
\`\`\`
`;

/** 静默确保台账存在(所有命令前置调用);不要在这里 print ——
 *  机器可读命令(run-start/record)的 stdout 只允许有一行结果 */
function ensure() {
  if (existsSync(EVENTS) && existsSync(HANDLED) && existsSync(README)) return;
  mkdirSync(RUNS_DIR, { recursive: true });
  mkdirSync(CASES_DIR, { recursive: true });
  mkdirSync(ARCHIVE_EVENTS_DIR, { recursive: true });
  if (!existsSync(EVENTS)) writeFileSync(EVENTS, '');
  if (!existsSync(HANDLED)) writeJson(HANDLED, { version: 1, entries: {} });
  if (!existsSync(README)) writeFileSync(README, LEDGER_README);
}

/** 显式初始化:唯一会 print 台账信息的命令 */
function cmdInit() {
  ensure();
  out(`台账就绪: ${rel(LEDGER)}`);
  out(`  events : ${rel(EVENTS)}`);
  out(`  handled: ${rel(HANDLED)}`);
  out(`  cases  : ${rel(CASES_DIR)}/`);
  out(`  archive: ${rel(ARCHIVE_DIR)}/`);
}

// ---------------------------------------------------------------- run

/**
 * runId 必须唯一 —— 同一秒内起两次 run 是常态(起 run → 立刻 run-end → 起回归 run),
 * 而 stamp() 只到秒。撞名会让后写的元信息**覆盖**前一次,于是
 * --verified-by 指向的"回归 run"里躺着上一轮的报错,证据链张冠李戴。
 * 撞了就顺延编号,格式与既有台账保持一致。
 */
function nextRunId() {
  const base = `run-${stamp()}`;
  if (!existsSync(join(RUNS_DIR, `${base}.json`))) return base;
  let i = 2;
  while (existsSync(join(RUNS_DIR, `${base}-${i}.json`))) i += 1;
  return `${base}-${i}`;
}

function cmdRunStart(flags) {
  ensure();
  const caseId = flags.case ?? null;
  if (caseId) assertCase(caseId);
  const runId = nextRunId();
  writeJson(join(RUNS_DIR, `${runId}.json`), {
    runId,
    caseId,
    goal: flags.goal ?? '',
    startedAt: now(),
    finishedAt: null,
    status: 'running',
    platform: flags.platform ?? null,
    errorCount: 0,
  });
  out(runId);
}

function cmdRunEnd(flags) {
  const runId = required(flags.run, '--run');
  const file = join(RUNS_DIR, `${runId}.json`);
  const meta = readJson(file, null);
  if (!meta) die(`未找到 run: ${runId}`);
  const events = readEvents().filter((e) => e.runId === runId);
  meta.finishedAt = now();
  meta.status = flags.status ?? 'done';
  meta.errorCount = events.length;
  meta.fingerprints = [...new Set(events.map((e) => e.fingerprint))];
  writeJson(file, meta);
  out(
    `run 收口: ${runId} 状态=${meta.status} 事件=${meta.errorCount} 独立指纹=${meta.fingerprints.length}`,
  );
  if (meta.fingerprints.length) {
    out(`待处理指纹: ${meta.fingerprints.join(', ')}`);
    out(`下一步: node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs list`);
  } else {
    out('本 run 无报错 —— 若刚修完东西,这轮即回归通过。');
  }
}

// ---------------------------------------------------------------- record

function cmdRecord(flags) {
  ensure();
  if (flags.error === undefined || flags.error === true) {
    die('缺少 --error "报错文案"');
  }
  const tool = typeof flags.tool === 'string' ? flags.tool : '(unknown)';
  const message = String(flags.error);
  const caseId = flags.case ?? null;
  const runId = flags.run ?? `run-adhoc-${stamp()}`;
  const stage = flags.stage === 'regress' ? 'regress' : 'record';
  const channel = flags.channel === 'log' ? 'log' : 'agent';
  const fp = fingerprint(message, tool);

  const db = readHandled();
  const entry = db.entries[fp];

  if (entry) {
    if (stage === 'regress') {
      // 回归中复发:修复没生效,必须暴露
      appendEvent({
        fp,
        tool,
        message,
        caseId,
        runId,
        stage,
        channel,
        flags,
        state: 'regressed',
      });
      process.stderr.write(
        `!! 回归失败: ${fp} 在 ${runId} 复发 —— 原判定于 ${entry.handledAt} 修复。已重新置为 regressed。\n`,
      );
      out(
        JSON.stringify({ action: 'regressed', fingerprint: fp, tool, runId }),
      );
      return;
    }
    // 普通阶段命中已闭环指纹:按约定"不再记录",只累加抑制计数
    entry.suppressedCount = (entry.suppressedCount ?? 0) + 1;
    entry.lastSuppressedAt = now();
    writeJson(HANDLED, db);
    out(
      JSON.stringify({
        action: 'suppressed',
        fingerprint: fp,
        tool,
        reason: 'already-handled',
        handledAt: entry.handledAt,
        suppressedCount: entry.suppressedCount,
      }),
    );
    return;
  }

  // 归档库命中:去重语义与主库一致,但两条分支的落点不同 ——
  //  · 普通阶段:计数累加在归档条目上,不回迁(主库保持瘦);
  //  · 回归阶段:这是**真复发**,必须搬回主库并按 regressed 暴露。
  //    若这里也静默 suppressed,archive 就成了"把账注销"的后门。
  const adb = readArchive();
  const archived = adb.entries[fp];
  if (archived) {
    if (stage === 'regress') {
      const back = unarchiveFingerprint(fp);
      db.entries[fp] = archived;
      writeJson(HANDLED, db);
      appendEvent({
        fp,
        tool,
        message,
        caseId,
        runId,
        stage,
        channel,
        flags,
        state: 'regressed',
      });
      process.stderr.write(
        `!! 回归失败: ${fp} 在 ${runId} 复发 —— 它此前已闭环并归档(原判定于 ${archived.handledAt}),` +
          `已连同 ${back} 条历史事件整块搬回主库重开。\n`,
      );
      out(
        JSON.stringify({
          action: 'regressed',
          fingerprint: fp,
          tool,
          runId,
          archived: true,
        }),
      );
      return;
    }
    archived.suppressedCount = (archived.suppressedCount ?? 0) + 1;
    archived.lastSuppressedAt = now();
    writeJson(ARCHIVE_HANDLED, adb);
    out(
      JSON.stringify({
        action: 'suppressed',
        fingerprint: fp,
        tool,
        reason: 'already-handled-archived',
        archived: true,
        handledAt: archived.handledAt,
        suppressedCount: archived.suppressedCount,
      }),
    );
    return;
  }

  // 同 run 内同指纹只留一条,避免循环调用刷屏
  const dup = readEvents().find(
    (e) => e.fingerprint === fp && e.runId === runId,
  );
  if (dup) {
    out(
      JSON.stringify({
        action: 'duplicate',
        fingerprint: fp,
        tool,
        firstEventId: dup.id,
        runId,
      }),
    );
    return;
  }

  const ev = appendEvent({
    fp,
    tool,
    message,
    caseId,
    runId,
    stage,
    channel,
    flags,
    state: 'open',
  });
  out(
    JSON.stringify({
      action: 'recorded',
      id: ev.id,
      fingerprint: fp,
      tool,
      runId,
      stage,
    }),
  );
}

function appendEvent({
  fp,
  tool,
  message,
  caseId,
  runId,
  stage,
  channel,
  flags,
  state,
}) {
  const ts = now();
  const ev = {
    id: `err-${stamp(ts)}-${fp.slice(0, 6)}`,
    fingerprint: fp,
    tool,
    message,
    normalized: normalize(message, tool),
    channel,
    stage,
    caseId,
    runId,
    args: flags.args ? safeJson(flags.args) : null,
    sourceRef:
      typeof flags['source-ref'] === 'string' ? flags['source-ref'] : null,
    state,
    ts,
  };
  appendFileSync(EVENTS, `${JSON.stringify(ev)}\n`);
  // run 元信息里的 errorCount 由 run-end 统一结算,这里不动
  return ev;
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return String(s);
  }
}

// ---------------------------------------------------------------- list

/** 聚合:指纹 → 最新事件、出现次数、状态 */
export function aggregate() {
  const events = readEvents();
  const db = readHandled();
  const byFp = new Map();
  for (const ev of events) {
    const cur = byFp.get(ev.fingerprint);
    if (!cur) {
      byFp.set(ev.fingerprint, {
        fingerprint: ev.fingerprint,
        tool: ev.tool,
        normalized: ev.normalized,
        message: ev.message,
        firstSeen: ev.ts,
        lastSeen: ev.ts,
        count: 1,
        runIds: [ev.runId],
        caseIds: ev.caseId ? [ev.caseId] : [],
        args: ev.args,
        lastEvent: ev,
      });
      continue;
    }
    cur.count += 1;
    cur.lastSeen = ev.ts;
    cur.message = ev.message;
    cur.lastEvent = ev;
    if (!cur.runIds.includes(ev.runId)) cur.runIds.push(ev.runId);
    if (ev.caseId && !cur.caseIds.includes(ev.caseId))
      cur.caseIds.push(ev.caseId);
    if (!cur.args && ev.args) cur.args = ev.args;
  }
  const rows = [];
  for (const row of byFp.values()) {
    const h = db.entries[row.fingerprint];
    if (!h) {
      row.status = 'open';
    } else if (row.lastSeen > h.handledAt) {
      row.status = 'regressed';
      row.handledAt = h.handledAt;
    } else {
      row.status = 'handled';
      row.handledAt = h.handledAt;
    }
    row.handled = h ?? null;
    rows.push(row);
  }
  rows.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
  return {
    rows,
    handledOnly: Object.values(db.entries),
    eventsCount: events.length,
  };
}

const STATUS_ORDER = { regressed: 0, open: 1, handled: 2 };

/**
 * `--all` 的默认显示上限。已闭环行随任务无限累积,而它们几乎从不被逐条阅读;
 * 一次 `--all` 打印几千行会把上下文吃掉一半,还挤掉真正要看的未决项。
 * 未决/复发不设默认上限(漏一条就是漏一个 bug),只有显式的 --limit 才截断。
 */
const ALL_DEFAULT_LIMIT = 50;

function parseLimit(v, fallback) {
  if (v === undefined) return fallback;
  if (v === true) die('--limit 需要数值(0 = 不限)');
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    die(`--limit 需要 ≥0 的整数(0 = 不限),收到 ${v}`);
  }
  return n;
}

function cmdList(flags) {
  if (flags.archived) {
    cmdListArchived(flags);
    return;
  }
  const { rows, handledOnly } = aggregate();
  // --decision 隐含 --all:问的是"这条决策关联的报错死没死",已闭环的行才是答案本身,
  // 只打未决等于什么都不打。
  const want = flags.all || flags.decision !== undefined ? 'all' : 'open';
  let shown =
    want === 'all'
      ? rows
      : rows.filter((r) => r.status === 'open' || r.status === 'regressed');

  if (flags.decision !== undefined) {
    const id =
      flags.decision === true ? null : normalizeDecisionId(flags.decision);
    shown = shown.filter((r) =>
      id ? r.handled?.decision === id : Boolean(r.handled?.decision),
    );
  }

  shown.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.lastSeen < b.lastSeen ? 1 : -1),
  );

  const total = shown.length;
  const limit = parseLimit(flags.limit, want === 'all' ? ALL_DEFAULT_LIMIT : 0);
  const hidden = limit > 0 ? Math.max(0, total - limit) : 0;
  if (limit > 0) shown = shown.slice(0, limit);

  if (flags.json) {
    out(
      JSON.stringify(
        { mode: want, limit, total, hidden, rows: shown },
        null,
        2,
      ),
    );
    return;
  }

  const nOpen = rows.filter((r) => r.status === 'open').length;
  const nReg = rows.filter((r) => r.status === 'regressed').length;
  const nHandled = handledOnly.length;
  const nArchived = Object.keys(readArchive().entries).length;
  out(
    `未决 ${nOpen} · 回归复发 ${nReg} · 已闭环 ${nHandled} · 事件总数 ${readEvents().length}` +
      (nArchived ? ` · 已归档 ${nArchived}(list --archived)` : ''),
  );
  if (!shown.length) {
    if (flags.decision !== undefined) out('没有挂到该决策的指纹。');
    else out(want === 'all' ? '台账为空。' : '无未决报错。');
    return;
  }
  out('');
  for (const r of shown) {
    const mark =
      r.status === 'regressed' ? 'REGRESSED' : r.status.toUpperCase();
    out(`[${mark}] ${r.fingerprint}  ×${r.count}  ${r.tool}`);
    out(`  首次 ${r.firstSeen}  最近 ${r.lastSeen}`);
    out(`  骨架 ${r.normalized}`);
    if (r.caseIds.length) out(`  用例 ${r.caseIds.join(', ')}`);
    if (r.handled?.decision) out(`  决策 ${r.handled.decision}`);
    if (r.status === 'regressed') out(`  原闭环于 ${r.handledAt}`);
    if (r.args) out(`  样例入参 ${JSON.stringify(r.args)}`);
    out('');
  }
  if (hidden) {
    out(
      `(另有 ${hidden} 条未显示 —— --limit ${total - hidden + 1} 起继续,或 --limit 0 看全部)`,
    );
  }
  out(
    '处理一个: node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs handle --fingerprint <fp> --fix "..."',
  );
}

// ---------------------------------------------------------------- 设计决策互链

/**
 * 台账 ↔ 设计决策记录的互链(与 software-design-patterns 技能约定同源)。
 *
 * 为什么要有:报错闭环回答"这条修没修掉",设计决策回答"为什么这么修、什么时候该回退"。
 * 两者分开记,"结构型修复"的结论就只剩一句 --fix 摘要,下次需求变更时无从复盘。
 * 目录位置沿用项目既有约定,四个候选逐个找 —— 技能侧允许项目自定义位置。
 */
const DECISION_DIRS = [
  'docs/design-decisions',
  'docs/adr',
  'docs/decisions',
  'ADR',
];

/** 编号规整成 4 位(与 new_decision.py 的 0001 编号一致) */
function normalizeDecisionId(v) {
  const s = String(v).trim();
  return /^\d+$/.test(s) ? s.padStart(4, '0') : s;
}

/** 找编号对应的决策记录文件;找不到返回 null(不阻断闭环,由调用方决定告警还是拒绝) */
function findDecision(id) {
  for (const d of DECISION_DIRS) {
    const dir = join(ROOT, d);
    if (!existsSync(dir)) continue;
    let hit;
    try {
      hit = readdirSync(dir).find(
        (f) => f.startsWith(`${id}-`) || f.startsWith(`${id}.`),
      );
    } catch {
      continue;
    }
    if (hit) return join(dir, hit);
  }
  return null;
}

// ---------------------------------------------------------------- handle

const VERDICTS = new Set(['product-bug', 'usage-error', 'environment']);

/**
 * 回归证据门禁(product-bug 必过)。
 * 拿 runId 去 runs/<id>.json 与事件流里核,不合格直接拒绝 ——
 * 「改完必须回归」这条铁律由代码兜住,不靠模型自觉。
 * 返回 {verifiedBy, forced},写进闭环条目供日后 review。
 */
function checkRegressionEvidence(fp, flags, verdict) {
  const verifiedBy = flags['verified-by'];
  if (verdict !== 'product-bug') {
    return { verifiedBy: verifiedBy ?? null, forced: false };
  }
  if (!verifiedBy) {
    if (flags.force !== true) {
      die(
        `缺少 --verified-by <回归runId>。product-bug 必须附回归证据(铁律 5):\n` +
          `  RRID=$(node $S run-start --case <caseId> --goal "回归 ${fp}")\n` +
          `  照 case-show 的步骤重放,每条结果 record --stage regress --run "$RRID"\n` +
          `  再 node $S handle ... --verified-by "$RRID"\n` +
          `确实无法回归时用 --force --note "原因"(条目会留 forced 标记)。`,
      );
    }
    process.stderr.write(
      '!! --force:跳过回归证据门禁。该条目标记为 forced,后续 review 请核对 --note。\n',
    );
    return { verifiedBy: null, forced: true };
  }

  const runId = String(verifiedBy);
  const meta = readJson(join(RUNS_DIR, `${runId}.json`), null);
  if (!meta) {
    die(
      `--verified-by 指向的 run 不存在: ${runId}(先 run-start 起一个回归 run)`,
    );
  }
  const runEvents = readEvents().filter((e) => e.runId === runId);
  if (runEvents.some((e) => e.fingerprint === fp)) {
    die(
      `回归未通过:${fp} 在 ${runId} 中再次出现,不能闭环(铁律 6)。\n` +
        '回到阶段 2 重新定位根因 —— 上次的修法没消掉它。',
    );
  }
  const noise = [
    ...new Set(
      runEvents.filter((e) => e.fingerprint !== fp).map((e) => e.fingerprint),
    ),
  ];
  if (noise.length) {
    process.stderr.write(
      `!! 警告:回归 run ${runId} 里还有 ${noise.length} 条其它报错(${noise.join(', ')})。\n` +
        '   修复可能引入了新问题,建议先处理这些指纹再闭环这一条。\n',
    );
  }
  if (!meta.finishedAt) {
    process.stderr.write(
      `!! 警告:回归 run ${runId} 尚未 run-end,统计可能不完整。\n`,
    );
  }
  return { verifiedBy: runId, forced: false };
}

function cmdHandle(flags) {
  const fp = required(flags.fingerprint, '--fingerprint');
  const verdict = String(flags.verdict ?? 'product-bug');
  if (!VERDICTS.has(verdict)) {
    die(`--verdict 只接受: ${[...VERDICTS].join(' | ')}(收到 ${verdict})`);
  }
  const db = readHandled();
  const events = readEvents().filter((e) => e.fingerprint === fp);
  if (!events.length) die(`台账中无此指纹: ${fp}(先 list 确认)`);
  const first = events[0];
  const last = events[events.length - 1];
  const files = listify(flags.file);
  const prev = db.entries[fp];
  const { verifiedBy, forced } = checkRegressionEvidence(fp, flags, verdict);

  const decision = flags.decision ? normalizeDecisionId(flags.decision) : null;
  const decisionFile = decision ? findDecision(decision) : null;
  if (decision && !decisionFile) {
    process.stderr.write(
      `!! --decision ${decision} 在 ${DECISION_DIRS.join(' / ')} 下找不到对应记录。\n` +
        '   编号仍会写进台账,但日后无从核对 —— 先按 .agents/skills/software-design-patterns\n' +
        '   出结论并落一份决策记录,或去掉这个参数(单点 bug 本来就不需要决策)。\n',
    );
  }

  // 结构型修复的硬闸门:已闭环的指纹在回归阶段真复发过,说明上次的修法没消根因,
  // 再按"单点 bug"改下去只会第三次复发 —— 必须先有设计决策。
  // 判据用**事件流里的 regress 记录**而不是"重闭环次数":unhandle 后重闭环
  // (修正误判)不该被要求补决策,只有真复发算。
  const regressedEvents = prev
    ? events.filter((e) => e.stage === 'regress' && e.ts > prev.handledAt)
    : [];
  if (
    verdict === 'product-bug' &&
    regressedEvents.length &&
    !decision &&
    flags.force !== true
  ) {
    die(
      `${fp} 已闭环过,且回归阶段复发 ${regressedEvents.length} 次 —— 上次的修法没消根因,\n` +
        '  这不是单点 bug。按约定先走设计决策:读 .agents/skills/software-design-patterns,\n' +
        '  出结论后用 python3 .agents/skills/software-design-patterns/scripts/new_decision.py "<标题>"\n' +
        '  建记录,再回来 handle ... --decision <NNNN>。\n' +
        '  确认确无结构问题(如两次都是互不相关的偶发)时用 --force --note "原因" 豁免。',
    );
  }

  db.entries[fp] = {
    fingerprint: fp,
    tool: last.tool,
    normalized: last.normalized,
    sampleMessage: last.message,
    firstSeen: first.ts,
    handledAt: now(),
    caseId: flags.case ?? last.caseId ?? null,
    verdict,
    fix: {
      summary: flags.fix ?? '',
      files,
      commit: flags.commit ?? null,
    },
    decision,
    decisionPath: decisionFile ? rel(decisionFile) : null,
    verifiedBy,
    forced,
    note: flags.note ?? '',
    suppressedCount: prev?.suppressedCount ?? 0,
    reopenedCount: prev ? (prev.reopenedCount ?? 0) + 1 : 0,
  };
  writeJson(HANDLED, db);
  out(
    `已闭环 ${fp} (${last.tool}) 判定=${verdict}` +
      (verifiedBy ? ` 回归=${verifiedBy}` : '') +
      (decision ? ` 决策=${decision}` : '') +
      (prev ? ` — 这是第 ${db.entries[fp].reopenedCount} 次重闭环` : ''),
  );
  out('后续同指纹不再记录。回归阶段若复发会自动置为 regressed 并告警。');
}

function cmdUnhandle(flags) {
  const fp = required(flags.fingerprint, '--fingerprint');
  const db = readHandled();
  if (!db.entries[fp]) die(`不在已闭环库: ${fp}`);
  delete db.entries[fp];
  writeJson(HANDLED, db);
  out(`已撤销闭环判定: ${fp}`);
}

// ---------------------------------------------------------------- cases

function assertCase(caseId) {
  const f = join(CASES_DIR, `${caseId}.json`);
  if (!existsSync(f)) die(`未找到用例: ${rel(f)}`);
  return readJson(f, null);
}

function nextCaseId() {
  mkdirSync(CASES_DIR, { recursive: true });
  const day = stamp().slice(0, 8);
  let i = 1;
  while (
    existsSync(
      join(CASES_DIR, `case-${day}-${String(i).padStart(4, '0')}.json`),
    )
  ) {
    i += 1;
  }
  return `case-${day}-${String(i).padStart(4, '0')}`;
}

function cmdCaseNew(flags) {
  ensure();
  const id = nextCaseId();
  const cs = {
    id,
    title: required(flags.title, '--title'),
    intent: flags.intent ?? '',
    expect: flags.expect ?? '',
    createdAt: now(),
    platform: flags.platform ?? null,
    status: 'active',
    steps: [],
  };
  writeJson(join(CASES_DIR, `${id}.json`), cs);
  out(join(CASES_DIR, `${id}.json`));
  out(
    `加步骤: node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs case-step --case ${id} --tool jsd_ping --args '{}'`,
  );
}

function cmdCaseStep(flags) {
  const caseId = required(flags.case, '--case');
  const cs = assertCase(caseId);
  const tool = required(flags.tool, '--tool');
  cs.steps.push({
    n: cs.steps.length + 1,
    tool,
    args: flags.args ? safeJson(flags.args) : {},
    note: flags.note ?? '',
  });
  writeJson(join(CASES_DIR, `${caseId}.json`), cs);
  out(`${caseId} 现有 ${cs.steps.length} 步`);
}

function listCaseFiles() {
  if (!existsSync(CASES_DIR)) return [];
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
}

function cmdCaseShow(flags) {
  if (flags.case) {
    printCase(assertCase(required(flags.case, '--case')));
    return;
  }
  const ids = listCaseFiles();
  if (!ids.length) {
    out('无用例。');
    return;
  }
  for (const id of ids) {
    const cs = readJson(join(CASES_DIR, `${id}.json`), null);
    if (cs) out(`${cs.id}  ${cs.status}  ${cs.steps.length}步  ${cs.title}`);
  }
}

function printCase(cs) {
  out(`${cs.id} — ${cs.title}`);
  if (cs.intent) out(`意图: ${cs.intent}`);
  if (cs.expect) out(`期望: ${cs.expect}`);
  out(`状态: ${cs.status}  平台: ${cs.platform ?? '(未记)'}`);
  out('');
  out('重放步骤(逐条以 MCP 工具原样执行,入参照抄):');
  for (const s of cs.steps) {
    out(`  ${s.n}. ${s.tool}`);
    out(`     args = ${JSON.stringify(s.args)}`);
    if (s.note) out(`     note = ${s.note}`);
  }
  out('');
  out('重放纪律:每条结果都过一遍 record(--stage regress --run <回归runId>);');
  out('任何一条 isError 都要记,哪怕是"预期内"的新错误。');
}

// ---------------------------------------------------------------- archive

/**
 * 归档:把**已经终结**的那部分搬出主库。事件流只追加、闭环库只增是刻意的
 * (证据链完整),代价是主库无限增长 —— 于是 `list --all` 被迫默认截断 50 条。
 *
 * 三条判据全满足才搬:在 handled.json 里 · handledAt 早于阈值 · 此后无任何事件。
 * 因此 regressed 的指纹**永不归档**(它还活着)。
 *
 * 与去重闸门的关系见 readArchive() 的注释:归档是搬走,不是注销。
 * 写入顺序固定为「先归档分片 → 再收缩主库」,中途失败最坏是重复一份,不会丢。
 */

const ARCHIVE_DEFAULT_MS = 30 * 86_400_000;
const DURATION_UNITS = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

function parseDuration(v, fallback) {
  if (v === undefined) return fallback;
  if (v === true) die('--older-than 需要时长,如 30d / 12h / 90m / 2w');
  const m = /^(\d+)([mhdw])$/.exec(String(v).trim());
  if (!m) die(`--older-than 需要 <数字><单位 m|h|d|w>(例:30d),收到 ${v}`);
  return Number(m[1]) * DURATION_UNITS[m[2]];
}

/** 从归档目录的实际内容重算账本(分片很少,整算比增量维护更不容易漂) */
function rebuildArchiveIndex() {
  const shards = [];
  let events = 0;
  if (existsSync(ARCHIVE_EVENTS_DIR)) {
    const files = readdirSync(ARCHIVE_EVENTS_DIR)
      .filter((f) => f.endsWith('.jsonl'))
      .sort();
    for (const f of files) {
      const lines = readFileSync(join(ARCHIVE_EVENTS_DIR, f), 'utf8')
        .split('\n')
        .filter((l) => l.trim());
      let first = null;
      let last = null;
      for (const l of lines) {
        let ts;
        try {
          ts = JSON.parse(l).ts;
        } catch {
          continue;
        }
        if (!first || ts < first) first = ts;
        if (!last || ts > last) last = ts;
      }
      events += lines.length;
      shards.push({
        shard: f,
        events: lines.length,
        firstSeen: first,
        lastSeen: last,
      });
    }
  }
  const index = {
    version: 1,
    lastArchivedAt: now(),
    fingerprints: Object.keys(readArchive().entries).length,
    events,
    shards,
  };
  writeJson(ARCHIVE_INDEX, index);
  return index;
}

/**
 * 撤销一次归档:把该指纹**整块**搬回主库(闭环条目 + 它的事件)。
 * 回归复发时调用 —— 归档是整块搬走的,撤销就得整块搬回,否则归档账本会留下
 * 「0 个指纹 · N 条事件」这种自相矛盾的计数。返回搬回的事件条数。
 */
function unarchiveFingerprint(fp) {
  const adb = readArchive();
  if (!adb.entries[fp]) return 0;
  delete adb.entries[fp];
  writeJson(ARCHIVE_HANDLED, adb);

  const back = [];
  if (existsSync(ARCHIVE_EVENTS_DIR)) {
    for (const f of readdirSync(ARCHIVE_EVENTS_DIR).filter((n) =>
      n.endsWith('.jsonl'),
    )) {
      const file = join(ARCHIVE_EVENTS_DIR, f);
      const kept = [];
      for (const l of readFileSync(file, 'utf8').split('\n')) {
        if (!l.trim()) continue;
        let ev;
        try {
          ev = JSON.parse(l);
        } catch {
          continue;
        }
        if (ev.fingerprint === fp) back.push(ev);
        else kept.push(JSON.stringify(ev));
      }
      if (kept.length) writeFileSync(file, `${kept.join('\n')}\n`);
      else unlinkSync(file);
    }
  }
  if (back.length) {
    appendFileSync(
      EVENTS,
      `${back.map((e) => JSON.stringify(e)).join('\n')}\n`,
    );
  }
  rebuildArchiveIndex();
  return back.length;
}

function cmdArchive(flags) {
  ensure();
  const olderMs = parseDuration(flags['older-than'], ARCHIVE_DEFAULT_MS);
  const cutoff = new Date(Date.now() - olderMs).toISOString();
  const db = readHandled();
  const events = readEvents();

  const lastSeenAt = new Map();
  for (const ev of events) {
    const prev = lastSeenAt.get(ev.fingerprint);
    if (!prev || ev.ts > prev) lastSeenAt.set(ev.fingerprint, ev.ts);
  }
  const movable = Object.values(db.entries).filter((e) => {
    if (!e.handledAt || e.handledAt >= cutoff) return false;
    const last = lastSeenAt.get(e.fingerprint);
    return !last || last <= e.handledAt;
  });
  const fpSet = new Set(movable.map((e) => e.fingerprint));
  const moved = fpSet.size
    ? events.filter((e) => fpSet.has(e.fingerprint))
    : [];
  const kept = fpSet.size
    ? events.filter((e) => !fpSet.has(e.fingerprint))
    : events;
  const activeHandled = Object.keys(db.entries).length - movable.length;

  if (flags['dry-run'] === true) {
    if (flags.json) {
      out(
        JSON.stringify(
          {
            action: 'archive-dry-run',
            cutoff,
            fingerprints: movable.map((e) => ({
              fingerprint: e.fingerprint,
              tool: e.tool,
              handledAt: e.handledAt,
            })),
            events: moved.length,
            wouldLeave: { events: kept.length, handled: activeHandled },
          },
          null,
          2,
        ),
      );
      return;
    }
    out(
      `--dry-run:将归档 ${movable.length} 个指纹 / ${moved.length} 条事件(阈值 handledAt < ${cutoff})`,
    );
    for (const e of movable) {
      out(`  ${e.fingerprint}  ${e.tool}  闭环于 ${e.handledAt}`);
    }
    out(`主库将剩: 事件 ${kept.length} 条 · 已闭环 ${activeHandled} 条`);
    out('未做任何写入。确认后去掉 --dry-run 执行。');
    return;
  }

  if (!fpSet.size) {
    out(
      flags.json
        ? JSON.stringify({
            action: 'archive',
            archived: 0,
            events: 0,
            reason: 'nothing-to-archive',
          })
        : '无可归档项(判据:已闭环 · handledAt 早于阈值 · 此后无事件;regressed 的指纹永不归档)。',
    );
    return;
  }

  // 先落归档分片:事件按 ts 月份分片,便于"只翻某段时间"
  const byMonth = new Map();
  for (const ev of moved) {
    const month = String(ev.ts ?? '').slice(0, 7) || 'unknown';
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(ev);
  }
  mkdirSync(ARCHIVE_EVENTS_DIR, { recursive: true });
  const written = [];
  for (const [month, evs] of [...byMonth].sort()) {
    appendFileSync(
      join(ARCHIVE_EVENTS_DIR, `${month}.jsonl`),
      `${evs.map((e) => JSON.stringify(e)).join('\n')}\n`,
    );
    written.push({ shard: `${month}.jsonl`, events: evs.length });
  }

  // 再收主库。注意:这里会重写 errors.jsonl,坏行(JSON 解析失败的)随之消失 ——
  // 它们本来就对 list/去重不可见,不算丢数据。
  const adb = readArchive();
  for (const e of movable) adb.entries[e.fingerprint] = e;
  writeJson(ARCHIVE_HANDLED, adb);
  writeFileSync(
    EVENTS,
    kept.length ? `${kept.map((e) => JSON.stringify(e)).join('\n')}\n` : '',
  );
  for (const fp of fpSet) delete db.entries[fp];
  writeJson(HANDLED, db);

  const index = rebuildArchiveIndex();
  if (flags.json) {
    out(
      JSON.stringify(
        {
          action: 'archive',
          archived: movable.length,
          events: moved.length,
          shards: written,
          total: { fingerprints: index.fingerprints, events: index.events },
          left: { events: kept.length, handled: activeHandled },
        },
        null,
        2,
      ),
    );
    return;
  }
  out(
    `归档完成: ${movable.length} 个指纹 / ${moved.length} 条事件 → ${rel(ARCHIVE_DIR)}/`,
  );
  for (const w of written) out(`  分片 events/${w.shard}  +${w.events}`);
  out(`  归档库累计: ${index.fingerprints} 个指纹 · ${index.events} 条事件`);
  out(`  主库剩余: 事件 ${kept.length} 条 · 已闭环 ${activeHandled} 条`);
  out(
    '归档不是注销:同指纹再出现仍 suppressed;若在回归阶段复发,条目会被搬回并置为 regressed。',
  );
}

/** 归档库浏览(主库的 list / --all 不含归档项) */
function cmdListArchived(flags) {
  const db = readArchive();
  const entries = Object.values(db.entries).sort((a, b) =>
    a.handledAt < b.handledAt ? 1 : -1,
  );
  const index = readJson(ARCHIVE_INDEX, null);
  const total = entries.length;
  const limit = parseLimit(flags.limit, ALL_DEFAULT_LIMIT);
  const hidden = limit > 0 ? Math.max(0, total - limit) : 0;
  const shown = limit > 0 ? entries.slice(0, limit) : entries;

  if (flags.json) {
    out(
      JSON.stringify(
        { mode: 'archived', total, limit, hidden, index, rows: shown },
        null,
        2,
      ),
    );
    return;
  }
  out(
    `已归档 ${total} 个指纹 · ${index?.events ?? 0} 条事件` +
      (index?.lastArchivedAt ? ` · 最近归档 ${index.lastArchivedAt}` : ''),
  );
  if (!total) {
    out('归档库为空。跑 archive --dry-run 看有没有可归档的项。');
    return;
  }
  out('');
  for (const e of shown) {
    out(`[ARCHIVED] ${e.fingerprint}  ${e.tool}`);
    out(
      `  闭环 ${e.handledAt}  判定 ${e.verdict}${e.decision ? `  决策 ${e.decision}` : ''}`,
    );
    out(`  骨架 ${e.normalized}`);
    if (e.fix?.summary) out(`  修复 ${e.fix.summary}`);
    out('');
  }
  if (hidden) out(`(另有 ${hidden} 条未显示 —— --limit 0 看全部)`);
}

// ---------------------------------------------------------------- scan-log

const LOG_LINE = /^(\S+) \[(ERROR|WARN)\] \[text-to-design-mcp\] (.*)$/;

/**
 * 插件侧失败的镜像行:`响应: r23 component_op ok=false 耗时=60ms error=<原因>`。
 * 它与 1ms 后紧跟的 `工具 <jsd_x> 执行失败: <同一原因>` 是同一件事,但
 * ① 只有插件方法名(component_op),没有工具名;② 带请求号会打散指纹。
 * 所以默认丢弃,只保留工具级那行 —— 那行信息更全(有 jsd_* 工具名)。
 */
const RESPONSE_MIRROR = /^响应: \S+ \S+ ok=false .*?\berror=(.*)$/;

/** daemon 日志 → {tool, message};日志格式见 packages/mcp-server/src/logger.ts */
export function parseLogLine(line) {
  const m = LOG_LINE.exec(line);
  if (!m) return null;
  const [, ts, level, body] = m;

  const mirror = RESPONSE_MIRROR.exec(body);
  if (mirror) {
    return { ts, level, tool: '(daemon)', message: mirror[1], mirror: true };
  }
  const fail = /^工具 (\S+) 执行失败: (.*)$/.exec(body);
  if (fail) return { ts, level, tool: fail[1], message: fail[2] };
  const gate = /^工具 (\S+) 在当前平台不可用,已拦截$/.exec(body);
  if (gate) return { ts, level, tool: gate[1], message: body };
  return { ts, level, tool: '(daemon)', message: body };
}

function cmdScanLog(flags) {
  ensure();
  const file = flags.log ?? DEFAULT_LOG;
  if (!existsSync(file)) {
    out(JSON.stringify({ action: 'no-log', file, recorded: 0 }));
    return;
  }
  const onlyError = flags['include-warn'] ? /\[(ERROR|WARN)\]/ : /\[ERROR\]/;
  const st = statSync(file);
  const cursor = readJson(CURSOR, {});
  let offset =
    !flags.reset && cursor.file === file && cursor.size <= st.size
      ? cursor.size
      : 0;

  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(Math.max(0, st.size - offset));
  if (buf.length) readSync(fd, buf, 0, buf.length, offset);
  closeSync(fd);
  const chunk = buf.toString('utf8');
  const lines = chunk.split('\n');
  // 末行可能被截断:退回一个完整行边界
  const tailPartial = lines.pop() ?? '';
  const consumed = buf.length - Buffer.byteLength(tailPartial, 'utf8');
  offset += consumed;

  const hits = [];
  let mirrors = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!onlyError.test(line)) continue;
    const parsed = parseLogLine(line);
    if (!parsed) continue;
    if (parsed.mirror && !flags['keep-mirrors']) {
      mirrors += 1;
      continue;
    }
    hits.push(parsed);
  }

  writeJson(CURSOR, { file, size: offset, updatedAt: now() });

  const results = [];
  for (const h of hits) {
    // 复用 record 的去重/抑制逻辑
    const args = [
      'record',
      '--tool',
      h.tool,
      '--error',
      h.message,
      '--channel',
      'log',
      '--stage',
      flags.stage === 'regress' ? 'regress' : 'record',
    ];
    if (flags.run) args.push('--run', String(flags.run));
    if (flags.case) args.push('--case', String(flags.case));
    args.push('--source-ref', `log:${h.ts}`);
    results.push(runSub('record', args));
  }

  if (flags.json) {
    out(
      JSON.stringify(
        {
          action: 'scan-log',
          scanned: lines.length,
          hits: hits.length,
          skippedMirrors: mirrors,
          results,
        },
        null,
        2,
      ),
    );
    return;
  }
  const kind = flags['include-warn'] ? 'ERROR/WARN' : 'ERROR';
  out(
    `扫描 ${rel(file)}:新增 ${lines.length} 行,命中 ${hits.length} 条 ${kind}` +
      (mirrors ? `(另跳过 ${mirrors} 条插件响应镜像)` : ''),
  );
  if (!hits.length) out('无新增报错。');
  for (const h of hits) out(`  ${h.ts} ${h.tool}: ${h.message.slice(0, 120)}`);
}

// ---------------------------------------------------------------- report

function cmdReport(flags) {
  const { rows } = aggregate();
  const pending = rows
    .filter((r) => r.status !== 'handled')
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const handled = rows.filter((r) => r.status === 'handled');
  const L = [];
  L.push('# MCP 报错台账快照');
  L.push('');
  L.push(`生成时间: ${now()}`);
  L.push('');
  L.push(
    `- 未决 \`open\`: ${pending.filter((r) => r.status === 'open').length}`,
  );
  L.push(
    `- 回归复发 \`regressed\`: ${pending.filter((r) => r.status === 'regressed').length}`,
  );
  L.push(`- 已闭环(当前有效): ${handled.length}`);
  L.push(`- 闭环库总数(含复发): ${Object.keys(readHandled().entries).length}`);
  L.push(
    `- 已归档(搬出主库,仍受去重闸门保护): ${Object.keys(readArchive().entries).length}`,
  );
  L.push('');
  L.push('## 未决');
  L.push('');
  if (!pending.length) {
    L.push('_(空)_');
  } else {
    L.push('| 指纹 | 状态 | 工具 | 次数 | 最近 | 骨架 |');
    L.push('| --- | --- | --- | --- | --- | --- |');
    for (const r of pending) {
      L.push(
        `| \`${r.fingerprint}\` | ${r.status} | \`${r.tool}\` | ${r.count} | ${r.lastSeen} | ${r.normalized.replace(/\|/g, '\\|')} |`,
      );
    }
  }
  L.push('');
  L.push('## 已闭环');
  L.push('');
  if (!handled.length) {
    L.push('_(空)_');
  } else {
    L.push('| 指纹 | 工具 | 闭环时间 | 决策 | 修复摘要 |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const r of handled) {
      L.push(
        `| \`${r.fingerprint}\` | \`${r.tool}\` | ${r.handledAt} | ${r.handled?.decision ?? '—'} | ${(r.handled?.fix?.summary ?? '').replace(/\|/g, '\\|')} |`,
      );
    }
  }
  L.push('');
  const target = flags.out
    ? resolve(String(flags.out))
    : join(LEDGER, 'REPORT.md');
  writeFileSync(target, `${L.join('\n')}\n`);
  out(`报告已写出: ${rel(target)}`);
}

// ---------------------------------------------------------------- help

const HELP = `mcp-tdd — text-to-design MCP 测试驱动开发台账

用法: node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs <命令> [选项]

任务生命周期
  init                                     建台账目录与空文件(幂等)
  run-start --case <id> --goal "..."        开始一次设计任务,输出 runId
  run-end   --run <id> [--status done]      设计任务收口,结算报错数

报错记录(核心)
  record --run <id> --tool <jsd_x> --error "报错文案" \\
         [--case <id>] [--stage record|regress] [--channel agent|log] \\
         [--args '<json>'] [--source-ref "..."]
        → {"action":"recorded|duplicate|suppressed|regressed",...}
        suppressed = 该指纹已闭环,按约定不再记录
        regressed  = 已闭环指纹在回归阶段复发,需重新修

  scan-log [--run <id>] [--case <id>] [--stage regress] [--json]
           [--reset] [--include-warn] [--keep-mirrors]
        从 daemon 日志补采 ERROR 行(兜底通道,按位点增量)
        默认跳过「响应: … ok=false」镜像行 —— 每个都紧跟一条同原因的
        「工具 X 执行失败」行,后者带 jsd_* 工具名,信息更全
        --include-warn 连 [WARN] 一起抓(超时/插件未连接是 WARN 级)

台账
  list [--all] [--json] [--limit N] [--decision [NNNN]] [--archived]
        未决 / 复发 / 已闭环;--all 默认只显示 50 条(已闭环会无限累积),
        --limit 0 看全部,未决不受默认上限约束
        --decision <NNNN> 只看该设计决策关联的指纹(隐含 --all),
        不带值则只看挂了决策的行
        --archived 改看归档库(主库的 list / --all 不含归档项)
  handle --fingerprint <fp> [--case <id>] [--verdict <v>] [--fix "摘要"] \\
         [--file <path>]... [--commit <sha>] [--verified-by <回归runId>] \\
         [--decision <NNNN>] [--note "..."]
        --verdict: product-bug(默认,已改代码) | usage-error(调用方写错) | environment(环境/连接)
        product-bug 必带 --verified-by,且该回归 run 里同指纹不得复发(否则拒绝闭环);
        无法回归时用 --force --note "原因" 显式豁免,条目会留 forced 标记
        --decision 把闭环挂到设计决策记录上(docs/design-decisions/NNNN-*.md);
        已闭环过、且在回归阶段**真复发**的指纹强制要求它:复发说明上次没消根因,
        先走 software-design-patterns 出决策再回来闭环(确无结构问题用 --force 豁免)
  unhandle --fingerprint <fp>               撤销闭环判定(误判时用)
  report [--out <path>]                     生成 REPORT.md(含决策列)

归档(台账瘦身;不是注销 —— 去重闸门同时查归档库)
  archive [--older-than 30d] [--dry-run] [--json]
        把**已终结**的指纹搬出主库:事件 → archive/events/<YYYY-MM>.jsonl,
        闭环条目 → archive/handled.json,账本 → archive/INDEX.json
        判据(三条全满足):在 handled.json 里 · handledAt 早于阈值 · 此后无事件
        → regressed 的指纹永不归档。--dry-run 只打印不写盘
        归档过的指纹再出现:仍 suppressed(多带 archived:true);
        **在回归阶段复发**则搬回主库并置 regressed,与从未归档过的指纹行为一致

用例(回归依据)
  case-new  --title "..." [--intent "..."] [--expect "..."] [--platform jsdesign|figma|mastergo]
  case-step --case <id> --tool <jsd_x> --args '<json>' [--note "..."]
  case-show [--case <id>]                   打印可重放的步骤清单

约定
  - 台账位置: docs/mcp-errors/
  - 报错身份由指纹决定(工具名 + 归一化文案),与节点 id / 耗时无关
  - 退出码 0 = 命令执行成功(业务语义看 action 字段);2 = 用法错误
`;

// ---------------------------------------------------------------- 分发

const HANDLERS = {
  init: cmdInit,
  'run-start': cmdRunStart,
  'run-end': cmdRunEnd,
  record: cmdRecord,
  list: cmdList,
  handle: cmdHandle,
  unhandle: cmdUnhandle,
  archive: cmdArchive,
  'case-new': cmdCaseNew,
  'case-step': cmdCaseStep,
  'case-show': cmdCaseShow,
  'scan-log': cmdScanLog,
  report: cmdReport,
};

function required(v, name) {
  if (v === undefined || v === true) die(`缺少必填参数 ${name}`);
  return String(v);
}

/** 供 scan-log 内部复用 record;返回解析后的 action 对象 */
function runSub(name, argv) {
  const { flags } = parseArgs(argv);
  const before = process.stdout.write;
  let captured = '';
  process.stdout.write = (s) => {
    captured += s;
    return true;
  };
  try {
    HANDLERS[name](flags);
  } finally {
    process.stdout.write = before;
  }
  const line = captured.trim().split('\n').pop() ?? '';
  try {
    return JSON.parse(line);
  } catch {
    return { action: 'unknown', raw: captured.trim() };
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (
    !argv.length ||
    argv[0] === 'help' ||
    argv[0] === '--help' ||
    argv[0] === '-h'
  ) {
    out(HELP);
    return;
  }
  const name = argv[0];
  const handler = HANDLERS[name];
  if (!handler) die(`未知命令: ${name}\n\n${HELP}`);
  if (name !== 'init') ensure();
  const { flags } = parseArgs(argv.slice(1));
  handler(flags);
}

// Windows 兼容:process.argv[1] 是 `D:\...`(反斜杠),拼成 `file://D:/...`
// 与 import.meta.url 的 `file:///D:/...` 永不相等 —— 症状是整个 CLI 在 Windows 上
// **静默退出 0**(没有输出、也不建台账),看着像「命令不存在」。统一走 pathToFileURL
// 归一化后再比(顺带覆盖带空格/非 ASCII 的仓库路径)。
if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
