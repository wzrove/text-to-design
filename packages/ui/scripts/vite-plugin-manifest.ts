import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import type { PluginPlatform } from 'text-to-design-shared';

export default function manifestPlugin(platform: PluginPlatform) {
  const root = resolve(process.cwd(), '../..');
  const outDir = resolve(process.cwd(), 'dist', platform);
  return {
    name: `emit-manifest-${platform}`,
    buildStart() {
      const base =
        platform === 'figma'
          ? {
              name: 'text-to-design MCP Bridge',
              api: '1.0.0',
              editorType: ['figma'],
              permissions: ['activeusers'],
              id: '1681227053598939040',
              // documentAccess: 'dynamic-page'(决策 0011)。
              // 该模式下同步文档访问 API(getNodeById / getLocal*Styles /
              // node.mainComponent / variables.getLocal*)会无条件抛异常 ——
              // core 已按 0011 完成异步化:解析与加载收口在 shared/core/access.ts
              // (resolveNodes / resolveMainComponent / listStylesAsync),
              // 属性管线(0001/0004)保持同步。改回 legacy 前先确认这些入口没被改回同步。
              networkAccess: {
                // 插件桥接依赖本机 daemon 的 WS/HTTP;allowedDomains 对
                // 发布态同样生效,devAllowedDomains 仅覆盖开发调试。
                allowedDomains: [
                  'ws://localhost:47812',
                  'wss://localhost:47812',
                  'http://localhost',
                  'https://localhost',
                ],
                devAllowedDomains: [
                  'ws://localhost:47812',
                  'wss://localhost:47812',
                  'http://localhost',
                  'https://localhost',
                ],
                reasoning:
                  '该插件需要连接本地API服务以同步处理数据，若不开放localhost访问则核心功能将无法运行。',
              },
              documentAccess: 'dynamic-page',
            }
          : JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
      const manifest = { ...base, main: 'code.js', ui: 'ui.html' };
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolve(outDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );
    },
    closeBundle() {
      const uiHtml = resolve(process.cwd(), 'dist', 'ui.html');
      if (existsSync(uiHtml)) {
        mkdirSync(outDir, { recursive: true });
        copyFileSync(uiHtml, resolve(outDir, 'ui.html'));
      }
    },
  };
}
