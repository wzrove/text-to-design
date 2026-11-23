/**
 * Iconify 远程图标检索/取图。
 *
 * 只查 API、不落盘:daemon 是常驻进程,图标集全量数据动辄几十 MB,按需查询才划算。
 * 默认前缀只保留 MIT/Apache/ISC 等宽松许可集合 —— 设计稿里通常没有署名位,
 * CC-BY 的结果给了也用不了。调用方显式传 prefixes 时按它来。
 */
export const DEFAULT_ICONIFY_PREFIXES = [
  'lucide',
  'tabler',
  'mdi',
  'material-symbols',
  'ph',
  'iconoir',
  'carbon',
  'fluent',
  'mingcute',
] as const;

const API = 'https://api.iconify.design';
const PERMISSIVE = new Set([
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'Unlicense',
]);
const ID_RE = /^([a-z0-9-]+)[:/]([a-z0-9][a-z0-9._-]*)$/i;

export type IconifyId = { prefix: string; name: string };

export type IconStyle = 'line' | 'solid' | 'any';

export type IconifySearchOptions = {
  limit?: number;
  prefixes?: readonly string[];
  style?: IconStyle;
  signal?: AbortSignal;
};

export type IconifyIcon = {
  id: string;
  collection: string;
  license: string;
  palette: boolean;
  height?: number;
  style: 'line' | 'solid' | 'unknown';
  tags?: string;
};

export type IconifySearchResult = {
  query: string;
  icons: IconifyIcon[];
  total: number;
  truncated: boolean;
  licenseNotice?: string;
};

export class IconifyError extends Error {
  readonly kind: 'not_found' | 'network';

  constructor(kind: 'not_found' | 'network', message: string) {
    super(message);
    this.name = 'IconifyError';
    this.kind = kind;
  }
}

/** `prefix:name` / `prefix/name`;不认识返回 null */
export function parseIconifyId(raw: string): IconifyId | null {
  const m = ID_RE.exec(raw.trim());
  return m == null ? null : { prefix: m[1].toLowerCase(), name: m[2] };
}

function requestSignal(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(8000);
  return signal == null ? timeout : AbortSignal.any([signal, timeout]);
}

/** 名称后缀 + 集合 tag 推断线形;Iconify 的 tag 是集合级,变体只能看名称。 */
function inferStyle(
  name: string,
  tags: readonly string[] | undefined,
): 'line' | 'solid' | 'unknown' {
  if (/filled|fill|solid|bold|duotone|two-?tone/i.test(name)) return 'solid';
  if (tags?.some((t) => /uses stroke/i.test(t))) return 'line';
  return 'unknown';
}

async function fetchChecked(
  url: string,
  signal: AbortSignal | undefined,
  accept: string,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal: requestSignal(signal),
      headers: { accept },
    });
  } catch (e) {
    throw new IconifyError(
      'network',
      `Iconify 请求失败:${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (res.status === 404)
    throw new IconifyError('not_found', 'Iconify 图标不存在');
  if (!res.ok)
    throw new IconifyError('network', `Iconify 返回 HTTP ${res.status}`);
  return res;
}

type CollectionMeta = {
  name?: string;
  height?: number;
  palette?: boolean;
  tags?: string[];
  license?: { title?: string; spdx?: string };
};

type SearchPayload = {
  icons?: string[];
  total?: number;
  collections?: Record<string, CollectionMeta>;
};

/** 搜索候选。结果已过滤到请求的前缀内,并带出集合许可。 */
export async function searchIconify(
  query: string,
  opts: IconifySearchOptions = {},
): Promise<IconifySearchResult> {
  const limit = Math.max(1, Math.min(64, Math.round(opts.limit ?? 16)));
  const style = opts.style ?? 'any';
  const prefixes =
    opts.prefixes == null || opts.prefixes.length === 0
      ? [...DEFAULT_ICONIFY_PREFIXES]
      : [...new Set(opts.prefixes.map((p) => p.toLowerCase()))];
  const allowed = new Set(prefixes);
  const params = new URLSearchParams({
    query: query.trim(),
    limit: String(limit),
    prefixes: prefixes.join(','),
  });
  const res = await fetchChecked(
    `${API}/search?${params.toString()}`,
    opts.signal,
    'application/json',
  );
  const data = (await res.json()) as SearchPayload;
  const collections = data.collections ?? {};
  const matched: IconifyIcon[] = [];
  for (const raw of data.icons ?? []) {
    const id = parseIconifyId(raw);
    if (id == null || !allowed.has(id.prefix)) continue;
    const meta = collections[id.prefix] ?? {};
    const license = meta.license?.spdx ?? meta.license?.title ?? 'unknown';
    const variant = inferStyle(id.name, meta.tags);
    if (style !== 'any' && variant !== style) continue;
    matched.push({
      id: `${id.prefix}:${id.name}`,
      collection: meta.name ?? id.prefix,
      license,
      palette: meta.palette === true,
      ...(typeof meta.height === 'number' ? { height: meta.height } : {}),
      style: variant,
      ...(meta.tags?.length ? { tags: meta.tags.join(', ') } : {}),
    });
  }
  // 按集合轮转再截断:API 先按集合聚簇,直接 slice 会让 fluent/material-symbols 的
  // 变体把 16 条名额占满,检索结果看起来只有一个图标集。
  const groups = new Map<string, IconifyIcon[]>();
  for (const icon of matched) {
    const prefix = icon.id.slice(0, icon.id.indexOf(':'));
    const list = groups.get(prefix);
    if (list == null) groups.set(prefix, [icon]);
    else list.push(icon);
  }
  const rounds = [...groups.values()];
  const icons: IconifyIcon[] = [];
  for (let round = 0; icons.length < limit && round < matched.length; round++) {
    for (const group of rounds) {
      const icon = group[round];
      if (icon == null) continue;
      icons.push(icon);
      if (icons.length >= limit) break;
    }
  }
  const total = typeof data.total === 'number' ? data.total : matched.length;
  const nonPermissive = icons.filter((i) => !PERMISSIVE.has(i.license));
  const licenseNotice =
    nonPermissive.length > 0
      ? `有 ${nonPermissive.length} 个结果需要署名(${[...new Set(nonPermissive.map((i) => i.license))].join(', ')});无法署名时换宽松许可集合。`
      : undefined;
  return {
    query: query.trim(),
    icons,
    total,
    truncated: total > icons.length || matched.length > icons.length,
    ...(licenseNotice == null ? {} : { licenseNotice }),
  };
}

/** 覆盖线形描边,让 Iconify 图标跟随项目线宽;填充图标无 stroke,不会受影响。 */
function applyStrokeWidth(svg: string, width: number): string {
  const w = String(Math.max(0, width));
  let changed = false;
  const out = svg.replace(
    /(stroke-width=")[^"]*(")/g,
    (_, a: string, b: string) => {
      changed = true;
      return `${a}${w}${b}`;
    },
  );
  if (changed) return out;
  return /(?:^|\s)stroke=/.test(svg)
    ? out.replace(/<svg\b/, `<svg stroke-width="${w}"`)
    : out;
}

/** 按 id 取最终 SVG;color/size 由 Iconify 直接生成到根属性。 */
export async function fetchIconifySvg(
  raw: string,
  opts: {
    size?: number;
    color?: string;
    strokeWidth?: number;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const id = parseIconifyId(raw);
  if (id == null)
    throw new IconifyError(
      'not_found',
      `无效 Iconify id:${raw}(格式 prefix:name)`,
    );
  const size = Math.max(1, Math.round(opts.size ?? 24));
  const params = new URLSearchParams({
    color: opts.color ?? '#000000',
    width: String(size),
    height: String(size),
  });
  const res = await fetchChecked(
    `${API}/${id.prefix}/${id.name}.svg?${params.toString()}`,
    opts.signal,
    'image/svg+xml',
  );
  const svg = await res.text();
  if (!svg.trimStart().startsWith('<svg'))
    throw new IconifyError('network', 'Iconify 返回的不是 SVG');
  return opts.strokeWidth == null
    ? svg
    : applyStrokeWidth(svg, opts.strokeWidth);
}
