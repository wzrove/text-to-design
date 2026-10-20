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
 * CLI: node scripts/check-changesets.mjs [--json]
 */

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

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { problems, packages } = checkChangesets();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ problems, packages }, null, 2));
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
