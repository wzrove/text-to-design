import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const staticDir = resolve(require.resolve('lucide-static/package.json'), '..');

const NODES: Record<string, unknown> = JSON.parse(
  readFileSync(`${staticDir}/icon-nodes.json`, 'utf8'),
);

const dir = `${staticDir}/icons/`;
const all = readdirSync(dir)
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.replace(/\.svg$/, ''));

const canonical = new Set(Object.keys(NODES));
const deprecated = all.filter((n) => !canonical.has(n));

const bodyOf = (s: string) =>
  s
    .replace(/^.*?>\s*/s, '')
    .replace(/\s*<\/svg>.*$/s, '')
    .replace(/class="[^"]*"\s*/g, '')
    .replace(/\s+/g, ' ');

const byBody = new Map<string, string>();
for (const c of canonical) {
  byBody.set(bodyOf(readFileSync(`${dir}${c}.svg`, 'utf8')), c);
}

const ALIAS: Record<string, string> = {};
for (const name of deprecated) {
  const body = bodyOf(readFileSync(`${dir}${name}.svg`, 'utf8'));
  const target = byBody.get(body);
  if (target) ALIAS[name] = target;
}

const outPath = resolve(import.meta.dirname, '../src/aliases.json');
writeFileSync(
  outPath,
  `${JSON.stringify(
    Object.keys(ALIAS)
      .sort()
      .reduce(
        (acc, k) => {
          acc[k] = ALIAS[k];
          return acc;
        },
        {} as Record<string, string>,
      ),
    null,
    2,
  )}\n`,
);

const resolved = Object.keys(ALIAS).length;
const unresolved = deprecated.length - resolved;
console.log(
  `aliases: ${resolved} resolved, ${unresolved} unresolved (total deprecated ${deprecated.length})`,
);
