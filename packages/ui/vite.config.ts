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
    // 必须挂 writeBundle:closeBundle 在 vite 8 / rolldown 下会早于产物落盘,
    // readFileSync 直接 ENOENT(实测)。writeBundle 拿到的是已写入磁盘的产物。
    writeBundle() {
      let html: string;
      try {
        html = readFileSync(out, 'utf-8');
      } catch {
        // 产物缺失不该让整个构建红;这条只是把 <style> 提到 <title> 之后
        // 的观感优化(见 0012 的样式顺序),拿不到就跳过
        return;
      }
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
    // zodSandboxFix 处理两类「沙箱缺宿主设施」:① 裸 globalThis 标识符被
    // jsDesign 的 Proxy scoped evaluator 影子化(决策 0012,仅 jsdesign);
    // ② `BigInt` 全局三平台都缺,而 zod 顶层 `BIGINT_FORMAT_RANGES` 直接
    // 裸调 `BigInt(...)`(决策 0027)。②是三平台共有,所以三个分支统一挂载。
    const platformPlugins: Plugin[] = [manifestPlugin(platform)];
    platformPlugins.push(zodSandboxFix());
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
