import type { z } from 'zod';
import { FONT_PAGE_DEFAULT, FONT_PAGE_MAX } from '../dicts/font';
import type {
  ListFontsResult,
  ListStylesResult,
  listFontsSchema,
  RawExportFile,
  SerializedNode,
} from '../schemas';
import { listStylesAsync, resolveNodes } from './access';
import type { DesignHost } from './host';
import { serializeNode } from './serialize';

/**
 * 入参类型就地派生(而非从根出口取 `ListFontsParams`):
 * 根出口的 `ListFontsParams` 是同一份 schema 的投影,core 反向依赖根出口会成环。
 */
type ListFontsParams = z.infer<typeof listFontsSchema>;

export async function exportNodes(
  host: DesignHost,
  params: {
    ids: string[];
    format?: 'PNG' | 'JPG' | 'SVG' | 'PDF';
    scale?: number;
  },
): Promise<{ exports: Record<string, RawExportFile> }> {
  const format = params.format ?? 'PNG';
  const scale = params.scale ?? 1;
  const nodes = await resolveNodes(host, params.ids);
  if (nodes.length === 0) {
    throw new Error('没有找到要导出的节点');
  }
  const settings =
    format === 'PNG' || format === 'JPG'
      ? { format, constraint: { type: 'SCALE', value: scale } }
      : { format };
  const out: Record<string, RawExportFile> = {};
  for (const n of nodes) {
    const bytes = await n.exportAsync(settings);
    out[n.id] = {
      id: n.id,
      name: n.name,
      format,
      scale,
      mimeType:
        format === 'SVG'
          ? 'image/svg+xml'
          : format === 'PDF'
            ? 'application/pdf'
            : `image/${format.toLowerCase()}`,
      bytes,
    };
  }
  return { exports: out };
}

export async function fillImageNode(
  host: DesignHost,
  params: { ids: string[]; bytes: Uint8Array },
): Promise<{ updated: SerializedNode[] }> {
  if (!params.bytes || params.bytes.byteLength === 0) {
    throw new Error('无效的图片字节数据');
  }
  const image = await host.createImageFromBytesAsync(params.bytes);
  const nodes = await resolveNodes(host, params.ids);
  if (nodes.length === 0) {
    throw new Error('没有找到要填充图片的节点');
  }
  for (const n of nodes) {
    if ('fills' in n) {
      n.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
    }
  }
  return { updated: nodes.map((n) => serializeNode(n)) };
}

/**
 * 字体清单(**分页**):按家族名过滤 + 分页,不整表返回。
 *
 * 按 family 归并出可用的 style:写 `fontName` 要求 family + style 精确匹配,
 * 只回 family 列表等于让调用方猜字型("Bold" / "Medium" / "Semibold" / "Bold Italic"?),
 * 猜错不报错、静默退回默认字重(实测中文 family 的 Bold 就是这样被吃掉的)。
 * 这里把 (family, style) 组合如实摊开,写之前就有据可依。
 *
 * 为什么要分页(2026-09-24 真机实测):MasterGo 的字体库约 1900 个家族,整表回包
 * 321,995 字符 —— 一次只读调用就吃掉整个上下文预算。过滤与分页都做在 core(而不是
 * 各平台 adapter),三平台共享同一套语义;默认页大小见 `dicts/font.ts`。
 * 结果里的 `total` / `truncated` 必须给全:只给一页而不说还有多少,调用方会以为
 * 「字体就这些」——那正是分页最容易制造的新误解。
 */
export async function listFonts(
  host: DesignHost,
  params: ListFontsParams = {},
): Promise<ListFontsResult> {
  const fonts = await host.listAvailableFontsAsync();
  const byFamily = new Map<string, Set<string>>();
  for (const f of fonts) {
    const family = f?.fontName?.family;
    if (typeof family !== 'string' || family === '') continue;
    const styles = byFamily.get(family) ?? new Set<string>();
    const style = f.fontName.style;
    if (typeof style === 'string' && style !== '') styles.add(style);
    byFamily.set(family, styles);
  }

  const needle = params.family?.trim().toLowerCase() ?? '';
  const matched = [...byFamily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(
      ([family]) => needle === '' || family.toLowerCase().includes(needle),
    );

  // limit 缺省取默认页;显式传值超过上限时按上限截断(结果用 truncated 说明)
  const limit = Math.min(
    Math.max(1, Math.trunc(params.limit ?? FONT_PAGE_DEFAULT)),
    FONT_PAGE_MAX,
  );
  const offset = Math.max(0, Math.trunc(params.offset ?? 0));
  const page = matched.slice(offset, offset + limit);
  const detail = page.map(([family, styles]) => ({
    family,
    styles: [...styles].sort(),
  }));
  return {
    families: detail.map((d) => d.family),
    fonts: detail,
    count: detail.length,
    total: matched.length,
    offset,
    truncated: offset + detail.length < matched.length,
  };
}

/**
 * 本地样式枚举:两平台 API 同构(PAINT/TEXT/EFFECT/GRID),getter 缺失时跳过。
 * dynamic-page 下同步 getter 会抛,故走 Access 层的异步入口(0011)。
 */
export async function listStyles(host: DesignHost): Promise<ListStylesResult> {
  const styles: ListStylesResult['styles'] = [];
  for (const s of await listStylesAsync(host)) {
    styles.push({
      id: s.id,
      name: s.name,
      type: s.type as ListStylesResult['styles'][number]['type'],
    });
  }
  return { styles, count: styles.length };
}
