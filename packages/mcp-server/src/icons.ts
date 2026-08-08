import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Fuse from 'fuse.js';
import ALIASES from './aliases.json' with { type: 'json' };

const ALIAS_MAP = ALIASES as Record<string, string>;

const require = createRequire(import.meta.url);

type ElementNode = [name: string, attrs: Record<string, string>];

export type IconDef = {
  name: string;
  nodes: ElementNode[];
  keywords: string[];
};

/** 归一化:小写 + 去非字母数字(home 带不带连字符等价) */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NODES: Record<string, ElementNode[]> = JSON.parse(
  readFileSync(require.resolve('lucide-static/icon-nodes.json'), 'utf8'),
);
const TAGS: Record<string, string[]> = JSON.parse(
  readFileSync(require.resolve('lucide-static/tags.json'), 'utf8'),
);

/** 废弃名 → 正式名,由 scripts/gen-aliases.ts 从 lucide-static/icons/ 自动生成 */

const ICONS = new Map<string, IconDef>();
for (const [name, nodes] of Object.entries(NODES)) {
  ICONS.set(name, { name, nodes, keywords: TAGS[name] ?? [] });
}

export const ICON_COUNT = ICONS.size;

/** tag 精确反向索引:仅收录 icon 自己列出的 tag */
const BY_TAG = new Map<string, { name: string; idx: number }[]>();
for (const [name, tags] of Object.entries(TAGS)) {
  tags.forEach((tag, idx) => {
    const list = BY_TAG.get(tag) ?? [];
    list.push({ name, idx });
    BY_TAG.set(tag, list);
  });
}

const fuseName = new Fuse([...ICONS.values()], {
  keys: [{ name: 'name', weight: 1 }],
  threshold: 0.45,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: true,
});

/** 公共前缀长度(用于 Fuse 命中可信度门槛) */
function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * 意图解析。只依赖数据 + Fuse:
 *   1. canonical 精确
 *   2. 别名表精确(旧名 home→house、alert-circle→circle-alert,由 Lucide 废弃文件生成)
 *   3. Fuse name 场(前缀/拼写模糊天然吸收),可信门槛:极近(score≤0.05)或共享≥3 前导
 *   4. tag 精确翻牌(处理 magnifier→search 这类"词只在 tag 里")
 *   5. Fuse 宽松兜底(拼写失误,要求更宽松共享门槛)
 * 落空返回 null。
 */
export function findIcon(raw: string): IconDef | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;

  // A. canonical 精确
  if (ICONS.has(q)) return ICONS.get(q)!;

  // A2. 废弃名别名精确(优先于模糊,避免 alert-circle 被 Fuse 误召回)
  const aliased = ALIAS_MAP[q];
  if (aliased) {
    const def = ICONS.get(aliased);
    if (def) return def;
  }

  // B. Fuse name 场;中低分(0.05<score≤0.3)要求共享≥3 前导,滤掉弱误召回
  const qn = norm(q);
  const nameHits = fuseName
    .search(q, { limit: 8 })
    .filter(
      (r) =>
        r.score! <= 0.05 ||
        (r.score! <= 0.3 && commonPrefix(qn, norm(r.item.name)) >= 3),
    );
  if (nameHits.length) return nameHits[0].item;

  // C. tag 精确翻牌:位置越前越核心,名字越短越对
  const tagHits = BY_TAG.get(q);
  if (tagHits?.length) {
    const best = tagHits
      .slice()
      .sort(
        (a, b) => a.idx - b.idx || norm(a.name).length - norm(b.name).length,
      )[0];
    return ICONS.get(best.name) ?? null;
  }

  // D. Fuse 宽松兜底(拼写失误不满足 B 门时),要求共享≥2 前导,防弱误召回
  const loose = fuseName
    .search(q, { limit: 8 })
    .filter((r) => commonPrefix(qn, norm(r.item.name)) >= 2)[0];
  return loose ? loose.item : null;
}

/** 按相关度返回候选,仅供错误提示 */
export function suggestIcons(raw: string, limit = 20): IconDef[] {
  const q = raw.trim();
  if (!q) return [];

  const out = new Map<string, IconDef>();
  if (ICONS.has(q)) out.set(q, ICONS.get(q)!);
  const aliased = ALIAS_MAP[q];
  if (aliased && !out.has(aliased)) {
    const d = ICONS.get(aliased);
    if (d) out.set(d.name, d);
  }
  for (const { name } of BY_TAG.get(q) ?? []) {
    const d = ICONS.get(name);
    if (d) out.set(d.name, d);
    if (out.size >= limit) break;
  }
  for (const r of fuseName.search(q, { limit })) out.set(r.item.name, r.item);
  return [...out.values()].slice(0, limit);
}

/**
 * 生成完整 SVG。保留 Lucide 默认 stroke 风格:
 * viewBox 0 0 24 24, fill=none, stroke=color, stroke-width=strokeWidth,round 端点。
 * 允许 LLM 传 size/color/strokeWidth 调整样式。
 */
export function iconToSvg(
  def: IconDef,
  size = 24,
  color = '#000000',
  strokeWidth = 2,
): string {
  const body = def.nodes
    .map(([el, attrs]) => {
      const pairs = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${el} ${pairs}/>`;
    })
    .join('\n  ');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `  width="${size}" height="${size}" viewBox="0 0 24 24"`,
    `  fill="none" stroke="${color}" stroke-width="${strokeWidth}"`,
    `  stroke-linecap="round" stroke-linejoin="round">`,
    `  ${body}`,
    `</svg>`,
  ].join('\n');
}
