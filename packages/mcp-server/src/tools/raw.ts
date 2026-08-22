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
    description: `导出节点为图片/文件。

参数说明:
- format:导出格式 PNG/JPG/SVG/PDF,默认 PNG
- scale:缩放倍率(PNG/JPG),默认 1
- savePath:落盘到本地文件路径(如 /tmp/icon.png),推荐在不支持图像的模型时使用
- includeDataUrl:是否同时返回 base64 dataURL(供支持图像的模型直接查看)

两种输出方式可并存:传 savePath 落盘 + 不传 includeDataUrl 则仅落盘;传 includeDataUrl 则返回 base64。`,
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
  });

  const fillImage = bridgeTool({
    name: 'jsd_fill_image',
    title: '本地图片填充节点',
    description:
      '将本地图片文件字节填充到指定节点(IMAGE fill)。MCP server 读取本地文件,经二进制通道传给插件,插件调用 createImage 后填入节点',
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
