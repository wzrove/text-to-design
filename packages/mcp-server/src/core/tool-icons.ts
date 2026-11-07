import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Icon } from '@modelcontextprotocol/server';

/**
 * 目录图标:让模型与人在 `tools/list` / `prompts/list` / `resources/list` 里
 * **一眼分辨**工具归属,而不是只靠名称前缀。
 *
 * 图形一律取 **lucide-static**(与 `jsd_create_icon` 同一套图标库),不在本文件
 * 手绘 SVG:手绘的形状没人维护,与画布里的图标风格也对不上。
 *
 * ## 为什么内联 data URI,不外链
 *
 * 协议对 Icon.src 只要求字符串,但外链意味着客户端要能访问我们的地址 ——
 * 这是个只跑在本机的 daemon,没有任何公网可达的静态资源位。lucide 单个图标
 * 原始 SVG 约 300 字节,去掉注释与 class 后 <200 字节,内联优于一次外链请求。
 *
 * ## 为什么重新拼外壳而不是原样塞整个文件
 *
 * 原始文件带 ISC 许可证注释、`class="lucide lucide-x"`、`stroke="currentColor"`。
 * 前两个在 data URI 里是纯浪费;`currentColor` 在客户端没有上下文时各家解析
 * 不同(有的取黑、有的取透明),所以这里把 stroke 换成确定的 hex。
 */

const require = createRequire(import.meta.url);

/** 读 lucide 原始 SVG,降噪后返回子元素(不含 `<svg>` 外壳) */
function lucideBody(name: string): string {
  const raw = readFileSync(
    require.resolve(`lucide-static/icons/${name}.svg`),
    'utf8',
  );
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 组装成 MCP Icon。lucide 固定 24×24 viewBox、2px 描边 —— 与画布侧
 * `jsd_create_icon` 的默认参数一致,两边看起来是同一套图标。
 */
function lucideIcon(name: string, color: string): Icon {
  const body = lucideBody(name);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"` +
    ` fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${body}</svg>`;
  return {
    src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    mimeType: 'image/svg+xml',
    sizes: ['24x24'],
  };
}

/** 同色系:动作类走中性蓝,结构/组件走紫青,导出走绿,编排走琥珀 */
const C = {
  create: '#2563EB',
  read: '#64748B',
  modify: '#0EA5E9',
  structure: '#7C3AED',
  component: '#0891B2',
  run: '#F59E0B',
  output: '#059669',
  meta: '#334155',
} as const;

/**
 * 每个族一个 lucide 名。选型按「这个族在干什么」,不按字形顺眼:
 * - create    → square-plus(加方框 = 建节点)
 * - read      → search(查)
 * - modify    → pencil(改)
 * - structure → network(结构树)
 * - component → component(组件)
 * - run       → zap(执行 / 编排)
 * - output    → download(导出落盘)
 * - meta      → plug(连接 / 平台)
 * - recipe    → book-open(操作手册,不是动作)
 * - canvas    → layers(画布图层堆叠)
 */
const FAMILY_ICON = {
  create: 'square-plus',
  read: 'search',
  modify: 'pencil',
  structure: 'network',
  component: 'component',
  run: 'zap',
  output: 'download',
  meta: 'plug',
  recipe: 'book-open',
  canvas: 'layers',
} as const;

export type IconFamily = keyof typeof FAMILY_ICON;

const CACHE = new Map<IconFamily, Icon[]>();

function familyIcons(family: IconFamily): Icon[] {
  const hit = CACHE.get(family);
  if (hit != null) return hit;
  const color =
    family === 'recipe' || family === 'canvas' ? C.structure : C[family];
  const list = [lucideIcon(FAMILY_ICON[family], color)];
  CACHE.set(family, list);
  return list;
}

/**
 * 按工具名归类。前缀比工具名清单稳:新增 `jsd_create_xxx` 自动落到 create 族。
 *
 * 精确名优先 —— `jsd_export` / `jsd_batch` / `jsd_ping` 不以动作前缀开头,
 * 靠前缀会被兜底吃掉。
 */
const EXACT: Record<string, IconFamily> = {
  jsd_ping: 'meta',
  jsd_export: 'output',
  jsd_batch: 'run',
};

const PREFIX: [string, IconFamily][] = [
  ['jsd_create_', 'create'],
  ['jsd_set_', 'modify'],
  ['jsd_move_', 'modify'],
  ['jsd_resize_', 'modify'],
  ['jsd_rename_', 'modify'],
  ['jsd_fill_', 'modify'],
  ['jsd_delete_', 'modify'],
  ['jsd_find', 'read'],
  ['jsd_get_', 'read'],
  ['jsd_list_', 'read'],
  ['jsd_select_', 'read'],
  ['jsd_group_', 'structure'],
  ['jsd_ungroup_', 'structure'],
  ['jsd_reparent_', 'structure'],
  ['jsd_flatten_', 'structure'],
  ['jsd_outline_', 'structure'],
  ['jsd_repair_', 'structure'],
  ['jsd_combine_', 'component'],
  ['jsd_swap_', 'component'],
  ['jsd_detach_', 'component'],
  ['jsd_apply_', 'component'],
  ['jsd_copy_', 'component'],
  ['jsd_sync_', 'component'],
  ['jsd_import_', 'component'],
];

/** 未命中任何族时的兜底(不返回空 —— 图标缺失会让客户端退回纯文字) */
const FALLBACK: IconFamily = 'meta';

export function iconFamilyForTool(name: string): IconFamily {
  const exact = EXACT[name];
  if (exact != null) return exact;
  for (const [prefix, family] of PREFIX) {
    if (name.startsWith(prefix)) return family;
  }
  return FALLBACK;
}

export function iconForTool(name: string): Icon[] {
  return familyIcons(iconFamilyForTool(name));
}

/** 配方类(prompt / 配方资源)统一入口 */
export function promptIcon(): Icon[] {
  return familyIcons('recipe');
}

/** 画布状态类资源(选中 / 字体 / 样式 / 页面 / 节点 / 平台)统一入口 */
export function resourceIcon(): Icon[] {
  return familyIcons('canvas');
}
