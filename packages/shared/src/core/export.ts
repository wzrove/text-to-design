import type {
  ListFontsResult,
  RawExportFile,
  SerializedNode,
} from '../schemas';
import type { DesignHost } from './host';
import { serializeNode } from './serialize';
import { findNode } from './utils';

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
  const nodes = findNode(host, params.ids);
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
  const nodes = findNode(host, params.ids);
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
  const families = [...new Set(fonts.map((f) => f.fontName.family))].sort();
  return { families, count: families.length };
}
