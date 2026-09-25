import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  exportResultSchema,
  exportSchema,
  fillImageSchema,
  listFontsResultSchema,
  listFontsSchema,
  updatedResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { LONG_IO_TIMEOUT_MS, MAX_INLINE_DATA_URL_BYTES } from '../config';
import { bridgeTool, type ToolHandle } from '../core/registry';
import type { McpI18n } from '../i18n';

/** 由 mimeType/format 推导落盘扩展名 */
function extFor(mimeType?: string, format?: unknown): string {
  const f = typeof format === 'string' ? format.toLowerCase() : '';
  if (f === 'png' || f === 'svg' || f === 'pdf') return f;
  if (f === 'jpg' || f === 'jpeg') return 'jpg';
  const m = (mimeType ?? '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('svg')) return 'svg';
  if (m.includes('pdf')) return 'pdf';
  return 'bin';
}

/** 原始数据类:导出/填充图片/字体列表 */
export function registerRawTools(
  server: McpServer,
  bridge: Bridge,
  i18n: McpI18n,
): ToolHandle[] {
  const exportTool = bridgeTool({
    name: 'jsd_export',
    title: 'export.title',
    description: 'export.description',
    inputSchema: exportSchema,
    outputSchema: exportResultSchema,
    // 画布只读;但会写本地文件,不标 readOnly
    annotations: { readOnlyHint: false, destructiveHint: false },
    timeout: LONG_IO_TIMEOUT_MS,
    followUp: {
      type: 'tool',
      tool: 'jsd_fill_image',
      description: 'export.description2',
    },
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
      const dataUrlOverflow: string[] = [];
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
          // 体积超上限时绝不内联 base64:内联数据会随工具结果进入会话历史
          // 并常驻内存,实测可撑爆宿主进程堆(OOM)。改为落盘后返回路径引用。
          if (bytes.byteLength > MAX_INLINE_DATA_URL_BYTES) {
            const target =
              savePath ??
              join(
                tmpdir(),
                `jsd-export-${nid.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now()}.${extFor(mimeType, item.format)}`,
              );
            if (!savePath) writeFileSync(target, bytes);
            out.path = target;
            dataUrlOverflow.push(
              `${nid}(实际 ${bytes.byteLength} 字节 > 上限 ${MAX_INLINE_DATA_URL_BYTES} 字节)已落盘:${target}`,
            );
          } else {
            out.dataUrl = `data:${mimeType};base64,${bytes.toString('base64')}`;
          }
        }
        results.push(out);
      }
      return { exports: results, dataUrlOverflow };
    },
    // 多 id 反馈:点名「请求了但没导出」的节点(导出失败/节点已失效时插件静默跳过)
    extraContent: (data, args) => {
      const ids = (args.ids as string[] | undefined) ?? [];
      const exports = (data as { exports: { id: string }[] }).exports ?? [];
      const overflows =
        (data as { dataUrlOverflow?: string[] }).dataUrlOverflow ?? [];
      const blocks: { type: 'text'; text: string }[] = [];
      if (exports.length > 0)
        blocks.push({ type: 'text', text: `已导出 ${exports.length} 个节点` });
      for (const o of overflows) {
        blocks.push({
          type: 'text',
          text: `⚠️ 图片超过内联上限,未返回 base64,${o}。需要图片内容请读取该文件路径,或调小 scale 后重试。`,
        });
      }
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
    title: 'fillImage.title',
    description: 'fillImage.description',
    inputSchema: fillImageSchema,
    outputSchema: updatedResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
    timeout: LONG_IO_TIMEOUT_MS,
    followUp: {
      type: 'tool',
      tool: 'jsd_get_selection',
      description: 'fillImage.description2',
    },
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
    title: 'listFonts.title',
    description:
      '按家族名过滤、分页列出可用字体与各族的可用字型(返回 families 与 fonts:[{family,styles}])。**默认只回第一页**(50 族,上限 500):字体库规模随平台差一个量级——MasterGo 实测约 1900 族 / 整表 322 KB,整表必然撑爆上下文。结果里的 total 是过滤后的家族总数、truncated 表示还有下一页;按名字找字体传 family(不区分大小写的子串),翻页传 offset/limit。写 fontName 时 family 用 fonts[].family 原样、style 用同一项的**全名**(如 SourceHanSansCN-Bold,不是简称 "Bold")——组合不存在时不报错、会静默退回默认字面(命中时结果 warnings 点名);引擎解析成功会把 family/style 规范化成短名,回读短名属正常',
    method: 'list_fonts',
    // 入参 schema 必须挂:没有它时 MCP 侧按空对象校验,family/offset/limit 会被
    // **静默丢掉**(实测:传了 family/limit,插件收到的是空 params,分页/过滤双双失效)
    inputSchema: listFontsSchema,
    outputSchema: listFontsResultSchema,
    annotations: { readOnlyHint: true },
    followUp: {
      type: 'tool',
      tool: 'jsd_set_text',
      description: 'listFonts.description',
    },
  });

  return [
    exportTool(server, bridge, i18n),
    fillImage(server, bridge, i18n),
    listFonts(server, bridge, i18n),
  ];
}
