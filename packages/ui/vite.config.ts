import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PluginPlatform } from 'text-to-design-shared';
import { defineConfig, type Plugin, type UserConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import solid from 'vite-plugin-solid';
import manifestPlugin from './scripts/vite-plugin-manifest.js';
import zodSandboxFix from './scripts/vite-plugin-zod-sandbox.js';

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

/** 平台 mode → 引擎入口(新增平台在此加一行;与 vite-plugin-manifest 的平台分支同源) */
const PLATFORM_ENTRIES: Record<string, string> = {
  jsdesign: 'src/code/jsdesign/entry.ts',
  figma: 'src/code/figma/entry.ts',
  mastergo: 'src/code/mastergo/entry.ts',
};

export default defineConfig(({ mode }): UserConfig => {
  const entry = PLATFORM_ENTRIES[mode];
  if (entry != null) {
    const platform = mode as PluginPlatform;
    // jsDesign 沙箱(Proxy 作用域,决策 0012)用 zodSandboxFix 把模块顶层
    // globalThis.__zod_globalConfig/Registry 替换为模块局部 const 宿主,
    // 绕开沙箱对全局标识符的拦截。figma / mastergo 沙箱不拦截,无需挂载。
    const platformPlugins: Plugin[] = [manifestPlugin(platform)];
    if (platform === 'jsdesign') {
      platformPlugins.push(zodSandboxFix());
    }
    return {
      plugins: platformPlugins,
      define: {
        global: '{}',
      },
      build: {
        outDir: `dist/${platform}`,
        emptyOutDir: false,
        sourcemap: false,
        target: 'es2017',
        minify: true,
        rolldownOptions: {
          input: {
            code: resolve(import.meta.dirname, entry),
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
      target: 'es2017',
      sourcemap: false,
      assetsInlineLimit: 100000000,
      rolldownOptions: {
        input: resolve(import.meta.dirname, 'ui.html'),
      },
    },
  };
});
