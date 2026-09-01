import { readFileSync, writeFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  exportResultSchema,
  exportSchema,
  fillImageSchema,
  listFontsResultSchema,
  updatedResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { LONG_IO_TIMEOUT_MS } from '../config';
import { bridgeTool, type ToolHandle } from '../core/registry';

/** 原始数据类:导出/填充图片/字体列表 */
export function registerRawTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const exportTool = bridgeTool({
    name: 'jsd_export',
    title: '导出节点为图片',
    description: `导出节点为 PNG/JPG/SVG/PDF;savePath 落盘与 includeDataUrl 返回 base64 可并存,参数见 inputSchema。`,
    inputSchema: exportSchema,
    outputSchema: exportResultSchema,
    // 画布只读;但会写本地文件,不标 readOnly
    annotations: { readOnlyHint: false, destructiveHint: false },
    timeout: LONG_IO_TIMEOUT_MS,
    run: async (args, bridge_, signal) => {
      const { ids, format, scale, savePath, includeDataUrl } = args as {
        ids: string[];
        format?: string;
        scale?: number;
        savePath?: string;
        includeDataUrl?: boolean;
      };
      const data = (await bridge_.request(
        'export',
        { ids, format, scale },
        { signal, timeout: LONG_IO_TIMEOUT_MS },
      )) as Record<string, unknown>;
      const exportsMap = (data.exports ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const results: Record<string, unknown>[] = [];
      for (const [nid, item] of Object.entries(exportsMap)) {
        const bytes = item.bytes as Buffer;
        const mimeType = item.mimeType as string;
        const out: Record<string, unknown> = {
          id: nid,
          name: item.name,
          format: item.format,
          mimeType,
          size: bytes.byteLength,
        };
        if (savePath) {
          writeFileSync(savePath, bytes);
          out.path = savePath;
        }
        if (includeDataUrl) {
          out.dataUrl = `data:${mimeType};base64,${bytes.toString('base64')}`;
        }
        results.push(out);
      }
      return { exports: results };
    },
    // 多 id 反馈:点名「请求了但没导出」的节点(导出失败/节点已失效时插件静默跳过)
    extraContent: (data, args) => {
      const ids = (args.ids as string[] | undefined) ?? [];
      const exports = (data as { exports: { id: string }[] }).exports ?? [];
      const blocks: { type: 'text'; text: string }[] = [];
      if (exports.length > 0)
        blocks.push({ type: 'text', text: `已导出 ${exports.length} 个节点` });
      if (ids.length > 0) {
        const got = new Set(exports.map((e) => e.id));
        const missing = ids.filter((id) => !got.has(id));
        if (missing.length > 0) {
          blocks.push({
            type: 'text',
            text: `导出失败(节点可能已失效): ${missing.join(', ')}。可用 jsd_find 复核`,
          });
        }
      }
      return blocks;
    },
  });

  const fillImage = bridgeTool({
    name: 'jsd_fill_image',
    title: '本地图片填充节点',
    description: '读取本地图片文件填充到指定节点(IMAGE fill)',
    inputSchema: fillImageSchema,
    outputSchema: updatedResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
    timeout: LONG_IO_TIMEOUT_MS,
    run: async (args, bridge_, signal) => {
      const { ids, sourcePath } = args as {
        ids: string[];
        sourcePath: string;
      };
      let bytes: Buffer;
      try {
        bytes = readFileSync(sourcePath);
      } catch (e) {
        throw new Error(
          `读取文件失败: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      return bridge_.request(
        'fill_image',
        { ids, bytes: new Uint8Array(bytes) },
        { signal, timeout: LONG_IO_TIMEOUT_MS },
      );
    },
  });

  const listFonts = bridgeTool({
    name: 'jsd_list_fonts',
    title: '列出可用字体',
    description: '列出当前环境可用字体族',
    method: 'list_fonts',
    outputSchema: listFontsResultSchema,
    annotations: { readOnlyHint: true },
  });

  return [
    exportTool(server, bridge),
    fillImage(server, bridge),
    listFonts(server, bridge),
  ];
}
