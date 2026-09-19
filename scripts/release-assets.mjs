import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REPO = process.env.RELEASE_REPO ?? 'wzrove/text-to-design';
const BEFORE = process.env.TAGS_BEFORE ?? resolve(ROOT, 'tags-before.txt');
const OUT = resolve(process.env.RUNNER_TEMP ?? '/tmp', 'release-assets');

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function gitTags() {
  return execFileSync('git', ['tag'], { stdio: 'pipe' })
    .toString()
    .split('\n')
    .filter(Boolean);
}

function releaseExists(tag) {
  try {
    execFileSync('gh', ['release', 'view', tag, '--repo', REPO], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

// tags 在 release 流程里由 publish.mjs 创建,只对本次新增的 tag 建 Release ——
// 避免给历史缺失 tag 批量补建(首次跑会刷一屏 Release)
const before = new Set(
  readFileSync(BEFORE, 'utf8').split('\n').filter(Boolean),
);
const fresh = gitTags().filter((tag) => !before.has(tag));

if (fresh.length === 0) {
  console.log('\n没有新 tag,跳过 Release 创建');
  process.exit(0);
}

// tag 只带版本号,回查它属于哪个包才能定位 dist
const packages = readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => resolve(ROOT, 'packages', entry.name))
  .filter((dir) => existsSync(resolve(dir, 'package.json')))
  .map((dir) => ({
    dir,
    ...JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')),
  }))
  .filter((pkg) => !pkg.private);

mkdirSync(OUT, { recursive: true });

for (const tag of fresh) {
  const pkg = packages.find((p) => p.version === tag.replace(/^v/, ''));

  let assets = [];
  if (!pkg) {
    console.log(`\n${tag} 没有匹配的包,只建 Release`);
  } else if (!existsSync(resolve(pkg.dir, 'dist'))) {
    console.log(`\n${pkg.name} 没有 dist,只建 Release`);
  } else {
    const zip = resolve(OUT, `${pkg.name}-${tag}.zip`);
    rmSync(zip, { force: true });
    // 压缩包内顶层目录固定为 dist,与 README 的「解压后有一个 dist 文件夹」一致
    run('zip', ['-q', '-r', zip, 'dist'], { cwd: pkg.dir });
    assets = [zip];
  }

  if (releaseExists(tag)) {
    if (assets.length === 0) continue;
    run('gh', [
      'release',
      'upload',
      tag,
      ...assets,
      '--clobber',
      '--repo',
      REPO,
    ]);
    continue;
  }

  run('gh', [
    'release',
    'create',
    tag,
    ...assets,
    '--generate-notes',
    '--repo',
    REPO,
  ]);
}
