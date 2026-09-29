import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CHANGESET_DIR = resolve(ROOT, '.changeset');
const PUBLISHABLE = [
  { dir: 'packages/mcp-server', name: 'text-to-design-mcp' },
  { dir: 'packages/ui', name: 'text-to-design-ui' },
];
/**
 * `packages/shared` 是 `private` 包,但它的源码会被两个可发布包**打各自的 dist 打进去**
 * (vite 把源码 bundle,不是运行时依赖)。所以只改 shared 也必须给这两个包出 changeset ——
 * 否则新逻辑发出去了却没有新版本号,用户拿不到(2026-09-29 实踩:能力位改动只生成了 ui 的
 * changeset,而线格式 schema 就在 mcp 的 dist 里)。
 */
const SHARED_DIR = 'packages/shared/';
const BUMPS = new Set(['patch', 'minor', 'major']);

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const staged = run('git', ['diff', '--cached', '--name-only'])
  .split('\n')
  .filter(Boolean);
const files = staged.length
  ? staged
  : run('git', ['diff', '--name-only', 'HEAD~1', 'HEAD'])
      .split('\n')
      .filter(Boolean);

const touchedShared = files.some((f) => f.startsWith(SHARED_DIR));
const touched = touchedShared
  ? PUBLISHABLE
  : PUBLISHABLE.filter(({ dir }) => files.some((f) => f.startsWith(`${dir}/`)));

if (touched.length === 0) {
  console.error(
    `未检测到可发布包的改动(${PUBLISHABLE.map(({ dir }) => dir).join(' / ')},以及会被打进它们 dist 的 ${SHARED_DIR}),不生成 changeset`,
  );
  process.exit(1);
}

const [description = '', explicitBump = ''] = process.argv.slice(2);
const bump = BUMPS.has(explicitBump)
  ? explicitBump
  : /(^|\s)(feat|feature)/i.test(description)
    ? 'minor'
    : 'patch';

const message =
  description || run('git', ['log', '-1', '--format=%s']) || 'changeset';
const file = resolve(CHANGESET_DIR, `auto-${Date.now().toString(36)}.md`);

mkdirSync(CHANGESET_DIR, { recursive: true });
writeFileSync(
  file,
  `---\n${touched.map(({ name }) => `"${name}": ${bump}`).join('\n')}\n---\n\n${message}\n`,
  'utf8',
);

console.log(`已生成 ${file}`);
console.log(
  `  包: ${touched.map(({ name }) => name).join(', ')} | 版本: ${bump}`,
);
if (touchedShared) {
  console.log(
    `  (命中 ${SHARED_DIR} —— 它的源码会进两个包的 dist,故两个包一起出)`,
  );
}
console.log('  提交时一起 git add 即可');
