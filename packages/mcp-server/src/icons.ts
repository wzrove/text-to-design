import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Fuse from 'fuse.js';
import ALIASES from './aliases.json' with { type: 'json' };
import { debug } from './logger';

const ALIAS_MAP = ALIASES as Record<string, string>;

/** 归一化形态 → 别名表里的原始键(见 findIcon 的 A2 段:容忍 alert circle / alertCircle) */
const ALIAS_BY_NORM = new Map<string, string>();
for (const key of Object.keys(ALIAS_MAP)) {
  const n = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!ALIAS_BY_NORM.has(n)) ALIAS_BY_NORM.set(n, key);
}

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

/**
 * 实际加载的 lucide-static 版本。
 *
 * 为什么要把版本带进报错:别名表 `aliases.json` 是构建期从**当时的** lucide-static
 * 生成的,而依赖声明是 `^1.30.0` —— 终端用户解到的版本可以与构建机不同,别名目标
 * (`alert-circle` → `circle-alert`)就可能落空,表现为「以往能用的图标名突然找不到」。
 * 上报里带上版本,下一次同类记录不必再靠猜是版本问题还是代码问题。
 */
export const LUCIDE_VERSION: string = (() => {
  try {
    return String(
      JSON.parse(
        readFileSync(require.resolve('lucide-static/package.json'), 'utf8'),
      ).version,
    );
  } catch {
    return 'unknown';
  }
})();

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
  const exact = ICONS.get(q);
  if (exact) return exact;

  // A2. 废弃名别名精确(优先于模糊,避免 alert-circle 被 Fuse 误召回)
  // 目标不存在时**继续往下走**,不直接落空:别名表随构建机 lucide-static 版本生成,
  // 而运行时解到的版本可能更新(旧名被彻底删掉)→ 目标缺失。此时模糊层仍有救;
  // 曾经的写法在这里 return null,表现为「名在别名表里却报未知图标」。
  // 别名表的键是废弃名的**原始形态**(alert-circle),但调用方常写成 alert circle /
  // alertCircle。归一化后再查一次:否则这类输入会漏到模糊层,召回 message-circle-*
  // 之类完全无关的名字(附件里那条报错的候选正是这么来的)。
  const aliasKey = ALIAS_MAP[q] != null ? q : (ALIAS_BY_NORM.get(norm(q)) ?? q);
  const aliased = ALIAS_MAP[aliasKey];
  if (aliased) {
    const def = ICONS.get(aliased);
    if (def) return def;
    debug(
      `图标别名目标缺失:${q} → ${aliased}(当前 lucide-static ${LUCIDE_VERSION})`,
    );
  }

  // B. Fuse name 场;中低分(0.05<score≤0.3)要求共享≥3 前导,滤掉弱误召回
  const qn = norm(q);
  const nameHits = fuseName.search(q, { limit: 8 }).filter((r) => {
    const score = r.score ?? 1;
    return (
      score <= 0.05 ||
      (score <= 0.3 && commonPrefix(qn, norm(r.item.name)) >= 3)
    );
  });
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

/** 两个字符串的编辑距离(只用于给候选排序,规模在几十字符内) */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * 按相关度返回候选,仅供错误提示。
 *
 * 报错里的候选是调用方的**下一步尝试**,所以排序本身就是修复的一部分:
 * ① 词能逐个命中别的图标名/别名的先排(输入 `oil-can` 时 `fuel`/`barrel` 这类
 *    「同一个物件的另一个叫法」远比 `file-scan` 有用 —— 逐词命中正是这种语义相邻);
 * ② 再按归一化编辑距离(拼错时有救);
 * ③ 同分保留 Fuse 的命中序。
 * 实测(error_reports 2026-11-17):输入 `oil-can`,原候选首项是 `tool-case`,而
 * `fuel` 压根没进候选池 —— 顺序与召回面都不对,提示等于没给。
 */
export function suggestIcons(raw: string, limit = 20): IconDef[] {
  const q = raw.trim();
  if (!q) return [];

  const out = new Map<string, IconDef>();
  const exact = ICONS.get(q);
  if (exact) out.set(q, exact);
  const aliased = ALIAS_MAP[q];
  if (aliased && !out.has(aliased)) {
    const d = ICONS.get(aliased);
    if (d) out.set(d.name, d);
  }
  // 词级召回:多词名(oil-can)按词拆开,每段当作一次独立查询 —— oil 在 lucide 里
  // 没有对应图标,但 can 会召回 spray-can / candy-can 一族,配合编辑距离提供语义邻居。
  const words = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
  for (const w of words) {
    for (const { name } of BY_TAG.get(w) ?? []) {
      const d = ICONS.get(name);
      if (d) out.set(d.name, d);
    }
    for (const r of fuseName.search(w, { limit })) out.set(r.item.name, r.item);
  }
  for (const { name } of BY_TAG.get(q) ?? []) {
    const d = ICONS.get(name);
    if (d) out.set(d.name, d);
    if (out.size >= limit) break;
  }
  // fuse 召回放宽到 limit*4:排序要靠距离,候选池太小会把真正的近邻挤掉
  for (const r of fuseName.search(q, { limit: limit * 4 }))
    out.set(r.item.name, r.item);

  const qn = norm(q);
  const wordHit = (def: IconDef): number => {
    let n = 0;
    for (const w of words) {
      if (def.keywords.includes(w)) n += 2;
      else if (norm(def.name).includes(w)) n += 3;
    }
    return n;
  };
  const ranked = [...out.values()].map((def, idx) => ({
    def,
    idx,
    word: wordHit(def),
    dist: editDistance(qn, norm(def.name)),
  }));
  ranked.sort((a, b) => b.word - a.word || a.dist - b.dist || a.idx - b.idx);
  return ranked.slice(0, limit).map((r) => r.def);
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
