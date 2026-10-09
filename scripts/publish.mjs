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

function gitRevParse(ref) {
  try {
    return execFileSync('git', ['rev-parse', ref], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const HEAD = gitRevParse('HEAD');

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

  // tag 必须带包名:两个包版本线独立,共用 v<version> 会互相占坑
  // (ui@0.7.0 撞 mcp@0.7.0 的 v0.7.0 后 tag 被静默跳过,发布成功却无 tag)
  const tag = `${name}@${version}`;
  const taggedAt = gitRevParse(`refs/tags/${tag}`);

  // 顺序要紧:先问「这个版本发出去没有」,再问「tag 对不对」。
  // 只有另一个包升版时,没升的那个版本号不变、tag 自然落在旧提交上 —— 那是**正常**的,
  // 若先查 tag 就会把它误判成复用而中断整轮发布(mcp 已发、ui 卡死的半发布状态即由此来)。
  const published = isPublished(name, version);

  if (published) {
    console.log(`\nskip ${name}@${version} (已发布,版本未变)`);
  } else {
    // 到这里是「真要发」:tag 已存在却指向别的提交 = 同名版本装着不同内容,
    // 必须报错而不是静默跳过(那样会发成功却没 tag,见上方命名空间说明)
    if (taggedAt && taggedAt !== HEAD) {
      throw new Error(
        `tag ${tag} 已指向 ${taggedAt},当前 HEAD 为 ${HEAD} —— 命名空间被复用,拒绝静默跳过`,
      );
    }
    // pnpm publish 会把 catalog:/workspace: 协议替换为真实版本号,npm publish 不支持
    run('pnpm', ['publish', '--access', 'public', '--no-git-checks'], {
      cwd: resolve(ROOT, dir),
    });
    console.log(`\npublished ${name}@${version}`);
  }

  if (!taggedAt) {
    run('git', ['tag', tag]);
    console.log(`created tag ${tag}`);
  }
}
