import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

type Platform = 'jsdesign' | 'figma';

export default function manifestPlugin(platform: Platform) {
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
              documentAccess: 'dynamic-page',
              networkAccess: {
                allowedDomains: ['none'],
                devAllowedDomains: [
                  'ws://localhost:47812',
                  'wss://localhost:47812',
                  'http://localhost',
                  'https://localhost',
                ],
              },
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
