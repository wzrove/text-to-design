import type {
  ListFontsResult,
  ListStylesResult,
  RawExportFile,
  SerializedNode,
} from '../schemas';
import { listStylesAsync, resolveNodes } from './access';
import type { DesignHost } from './host';
import { serializeNode } from './serialize';

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
  const image = host.createImage(params.bytes);
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

export async function listFonts(host: DesignHost): Promise<ListFontsResult> {
  const fonts = await host.listAvailableFontsAsync();
  // 按 family 归并出可用的 style:写 fontName 要求 family + style 精确匹配,
  // 只回 family 列表等于让调用方猜字型("Bold" / "Medium" / "Semibold" / "Bold Italic"?),
  // 猜错不报错、静默退回默认字重(实测中文 family 的 Bold 就是这样被吃掉的)。
  // 这里把 (family, style) 组合如实摊开,写之前就有据可依。
  const byFamily = new Map<string, Set<string>>();
  for (const f of fonts) {
    const family = f?.fontName?.family;
    if (typeof family !== 'string' || family === '') continue;
    const styles = byFamily.get(family) ?? new Set<string>();
    const style = f.fontName.style;
    if (typeof style === 'string' && style !== '') styles.add(style);
    byFamily.set(family, styles);
  }
  const detail = [...byFamily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, styles]) => ({ family, styles: [...styles].sort() }));
  const families = detail.map((d) => d.family);
  return { families, fonts: detail, count: families.length };
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
