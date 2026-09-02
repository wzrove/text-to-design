import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin, type UserConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import solid from 'vite-plugin-solid';
import manifestPlugin from './scripts/vite-plugin-manifest.js';

function reorderCss(): Plugin {
  const out = resolve(import.meta.dirname, 'dist/ui.html');
  return {
    name: 'reorder-css',
    closeBundle() {
      const html = readFileSync(out, 'utf-8');
      const styleRe = /<style[^>]*>[\s\S]*?<\/style>/;
      const match = html.match(styleRe);
      if (!match) return;
      const without = html.replace(styleRe, '');
      const titleEnd = without.indexOf('</title>');
      if (titleEnd === -1) return;
      const insertAt = titleEnd + '</title>'.length;
      const reordered =
        without.slice(0, insertAt) +
        '\n    ' +
        match[0] +
        without.slice(insertAt);
      writeFileSync(out, reordered);
    },
  };
}

export default defineConfig(({ mode }): UserConfig => {
  if (mode === 'jsdesign' || mode === 'figma') {
    const platform = mode;
    return {
      plugins: [manifestPlugin(platform)],
      define: {
        global: '{}',
      },
      build: {
        outDir: `dist/${platform}`,
        emptyOutDir: false,
        sourcemap: false,
        target: 'es6',
        minify: true,
        rolldownOptions: {
          input: {
            code: resolve(
              import.meta.dirname,
              platform === 'figma'
                ? 'src/code/figma/entry.ts'
                : 'src/code/jsdesign/entry.ts',
            ),
          },
          output: {
            entryFileNames: 'code.js',
          },
        },
      },
    };
  }

  // 默认(development/production) → UI 面板构建
  return {
    plugins: [solid(), viteSingleFile(), reorderCss()],
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'es6',
      sourcemap: false,
      assetsInlineLimit: 100000000,
      rolldownOptions: {
        input: resolve(import.meta.dirname, 'ui.html'),
      },
    },
  };
});
