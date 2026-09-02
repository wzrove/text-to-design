import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLISHABLE = ['packages/mcp-server', 'packages/ui'];

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function isPublished(name, version) {
  try {
    execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

for (const dir of PUBLISHABLE) {
  const pkgPath = resolve(ROOT, dir, 'package.json');
  const {
    name,
    version,
    private: isPrivate,
  } = JSON.parse(readFileSync(pkgPath, 'utf8'));

  if (isPrivate) {
    console.log(`\nskip ${name} (private)`);
    continue;
  }

  const tag = `v${version}`;
  const tagged = (() => {
    try {
      execFileSync('git', ['rev-parse', `refs/tags/${tag}`], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();

  if (isPublished(name, version)) {
    console.log(`\nskip ${name}@${version} (已发布)`);
  } else {
    // pnpm publish 会把 catalog:/workspace: 协议替换为真实版本号,npm publish 不支持
    run('pnpm', ['publish', '--access', 'public', '--no-git-checks'], {
      cwd: resolve(ROOT, dir),
    });
    console.log(`\npublished ${name}@${version}`);
  }

  if (!tagged) {
    run('git', ['tag', tag]);
    console.log(`created tag ${tag}`);
  }
}
