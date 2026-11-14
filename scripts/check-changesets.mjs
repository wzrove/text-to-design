#!/usr/bin/env node
/**
 * changeset 门禁:每条 changeset 只许点名可发布(非 private)包。
 *
 * 为什么要有这一步:`@changesets/assemble-release-plan` 把 private 包当 ignore
 * (`privatePackages.version` 缺省 false),同一 changeset 里既有 ignore 又有非 ignore 的包会直接
 * 抛 "Mixed changesets that contain both ignored and not ignored packages are not allowed" —— 而
 * 这时机是 release:version 阶段,主干已经合入、PR 门禁早已通过,发版流水线当场停住。
 * 2026-10-20 实踩:`.changeset/*` 里写了 `text-to-design-shared`(private,但源码被 bundle 进
 * 两个包的 dist)+ `text-to-design-ui`,version 步骤 exit 1。
 *
 * 正确写法(见 scripts/new-changeset.mjs):shared 的改动 → 给两个可发布包各出一次 patch,
 * 不写 shared 自己。
 *
 * 第二道:--against <ref> 反查「改动集 → 应有 changeset」。
 * 上面那道只看已写进 .changeset/ 的条目;改了 shared/ 却没写 changeset 时目录是空的,
 * 整套检查直接通过 —— 而 shared 会被 vite bundle 进两个包的 dist,发版时
 * publish.mjs 的 isPublished 挡板判定「版本未变」跳过,新逻辑就随旧版本号发出去了
 * (与 2026-09-29 事故同一条路径,只是这次门禁拦不住)。
 *
 * CLI: node scripts/check-changesets.mjs [--json] [--against <ref>]
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_DIRS = ['packages'];
const BUMPS = new Set(['patch', 'minor', 'major']);
const RELEASE_LINE = /^["']?([^"':]+)["']?\s*:\s*(patch|minor|major)\s*$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** name → private:整条依赖 private 集合来自 package.json,不硬编码包名 */
/** config.ignore 里的包同样被 changesets 当 ignore,混进同一条也炸 */
function ignoredPackages(root) {
  try {
    return new Set(
      readJson(join(root, '.changeset', 'config.json')).ignore ?? [],
    );
  } catch {
    return new Set();
  }
}

export function workspacePackages(root = ROOT) {
  const manifests = [readJson(join(root, 'package.json'))];
  for (const dir of WORKSPACE_DIRS) {
    let entries = [];
    try {
      entries = readdirSync(join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        manifests.push(readJson(join(root, dir, entry.name, 'package.json')));
      } catch {
        /* 没有 package.json 的目录不是 workspace 包 */
      }
    }
  }
  return new Map(manifests.map((pkg) => [pkg.name, Boolean(pkg.private)]));
}

/** 取出 frontmatter 里的 release 行;空 changeset 合法,返回 [] */
function releasesOf(source) {
  const end = source.indexOf('\n---', 3);
  if (!source.startsWith('---') || end === -1) return [];
  const releases = [];
  for (const line of source.slice(3, end).split('\n')) {
    const match = RELEASE_LINE.exec(line.trim());
    if (match) releases.push({ name: match[1].trim(), type: match[2] });
  }
  return releases;
}

/**
 * 目录前缀 → 它的改动必须落到哪些可发布包上。
 *
 * shared/ 是 private 包,但它被 bundle 进两个包的 dist(见 new-changeset.mjs 的注释),
 * 所以它一有改动,两个包都得有新版本号,否则用户拿不到。
 * 这份映射与 new-changeset.mjs 的 PUBLISHABLE 是同一条规则的两处实现 —— 两边要一起改。
 */
const COVERAGE = [
  { dir: 'packages/mcp-server/', owners: ['text-to-design-mcp'] },
  { dir: 'packages/ui/', owners: ['text-to-design-ui'] },
  {
    dir: 'packages/shared/',
    owners: ['text-to-design-mcp', 'text-to-design-ui'],
  },
];

/** git diff --name-only <ref>...HEAD;ref 不存在(浅克隆 / 无 origin)返回 null 表示跳过 */
function changedSince(root, ref) {
  try {
    return execFileSync('git', ['diff', '--name-only', `${ref}...HEAD`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
}

export function checkChangesets(root = ROOT) {
  const packages = workspacePackages(root);
  const ignored = ignoredPackages(root);
  const dir = join(root, '.changeset');
  const problems = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    const where = `.changeset/${file}`;
    for (const { name, type } of releasesOf(
      readFileSync(join(dir, file), 'utf8'),
    )) {
      if (!BUMPS.has(type))
        problems.push(`${where}:${name} 的版本档 "${type}" 不合法`);
      if (!packages.has(name)) {
        problems.push(`${where}:${name} 不是本仓的包(名字写错?)`);
      } else if (packages.get(name) || ignored.has(name)) {
        problems.push(
          `${where}:${name} 是 private 包,changesets 会把它当 ignore —— 混进同一条 changeset 会让 version 直接失败。改成给可发布包出 changeset`,
        );
      }
    }
  }
  return { problems, packages: [...packages.entries()] };
}

/**
 * 反向门禁:这批改动碰了某条 COVERAGE 前缀,但没有任何 changeset 点名它该有的包。
 *
 * 空 changeset 合法(它只是「本次不发版」的声明),所以这里只认「点名」不看条数;
 * 名字写错/private 包混入由 checkChangesets 正面兜。
 */
export function checkCoverage(root = ROOT, ref) {
  const files = changedSince(root, ref);
  if (files == null) return { problems: [], skipped: true };
  const dir = join(root, '.changeset');
  let names = [];
  try {
    names = readdirSync(dir)
      .filter((file) => file.endsWith('.md') && file !== 'README.md')
      .flatMap((file) =>
        releasesOf(readFileSync(join(dir, file), 'utf8')).map((r) => r.name),
      );
  } catch {
    names = [];
  }
  const released = new Set(names);
  const problems = [];
  for (const { dir: prefix, owners } of COVERAGE) {
    if (!files.some((file) => file.startsWith(prefix))) continue;
    const missing = owners.filter((owner) => !released.has(owner));
    if (missing.length === 0) continue;
    problems.push(
      `改动命中 ${prefix},但 .changeset/ 里没有 ${missing.join(' / ')} 的条目 —— ` +
        '它会被 bundle 进 dist,没有新版本号用户就拿不到(用 pnpm chset 生成)',
    );
  }
  return { problems, skipped: false };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { problems, packages } = checkChangesets();
  const againstAt = process.argv.indexOf('--against');
  let coverage = { problems: [], skipped: true };
  if (againstAt !== -1) {
    const ref = process.argv[againstAt + 1];
    if (ref == null || ref === '' || ref.startsWith('--')) {
      console.error('--against 需要 <ref>(如 origin/main 或 github.base_ref)');
      process.exit(2);
    }
    coverage = checkCoverage(ROOT, ref);
    if (coverage.skipped) {
      console.error(`取不到 ${ref} 的改动集(浅克隆 / ref 不存在),反向门禁跳过`);
    }
    problems.push(...coverage.problems);
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ problems, packages, coverage }, null, 2));
  } else if (problems.length === 0) {
    console.log(
      `changeset 检查通过(${packages.filter(([, priv]) => !priv).length} 个可发布包 / ${packages.length} 个 workspace 包)`,
    );
  } else {
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    console.error(`\n${problems.length} 处 changeset 问题`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
