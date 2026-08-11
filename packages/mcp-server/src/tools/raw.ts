import { readFileSync, writeFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  exportResultSchema,
  exportSchema,
  listFontsResultSchema,
  updatedResultSchema,
} from 'text-to-design-shared';
import { z } from 'zod';
import type { Bridge } from '../bridge';
import { err, structured } from '../core/response';

const fillImageSchema = z.object({
  ids: z.array(z.string()).describe('要填充图片的节点 id 列表'),
  sourcePath: z.string().describe('本地图片文件绝对路径,如 /tmp/poster.png'),
});

/** 原始数据类:导出/填充图片/字体列表 */
export function registerRawTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'jsd_export',
    {
      description: `导出节点为图片/文件。

参数说明:
- format:导出格式 PNG/JPG/SVG/PDF,默认 PNG
- scale:缩放倍率(PNG/JPG),默认 1
- savePath:落盘到本地文件路径(如 /tmp/icon.png),推荐在不支持图像的模型时使用
- includeDataUrl:是否同时返回 base64 dataURL(供支持图像的模型直接查看)

两种输出方式可并存:传 savePath 落盘 + 不传 includeDataUrl 则仅落盘;传 includeDataUrl 则返回 base64。`,
      inputSchema: exportSchema,
      outputSchema: exportResultSchema,
    },
    async ({ ids, format, scale, savePath, includeDataUrl }) => {
      try {
        const data = (await bridge.request('export', {
          ids,
          format,
          scale,
        })) as Record<string, unknown>;
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
        return structured({ exports: results }, exportResultSchema);
      } catch (e) {
        return err(e, exportResultSchema);
      }
    },
  );

  server.registerTool(
    'jsd_fill_image',
    {
      description:
        '将本地图片文件字节填充到指定节点(IMAGE fill)。MCP server 读取本地文件,经二进制通道传给插件,插件调用 createImage 后填入节点',
      inputSchema: fillImageSchema,
      outputSchema: updatedResultSchema,
    },
    async ({ ids, sourcePath }) => {
      try {
        let bytes: Buffer;
        try {
          bytes = readFileSync(sourcePath);
        } catch (e) {
          return err(
            new Error(
              `读取文件失败: ${e instanceof Error ? e.message : String(e)}`,
            ),
            updatedResultSchema,
          );
        }
        const data = await bridge.request('fill_image', {
          ids,
          bytes: new Uint8Array(bytes),
        });
        return structured(data, updatedResultSchema);
      } catch (e) {
        return err(e, updatedResultSchema);
      }
    },
  );

  server.registerTool(
    'jsd_list_fonts',
    {
      description: '列出当前环境可用字体族',
      outputSchema: listFontsResultSchema,
    },
    async () => {
      try {
        const data = await bridge.request('list_fonts', {});
        return structured(data, listFontsResultSchema);
      } catch (e) {
        return err(e, listFontsResultSchema);
      }
    },
  );
}
