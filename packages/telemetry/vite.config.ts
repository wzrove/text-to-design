import { defineConfig } from 'vite';

export default defineConfig({
  // ssr 目标 = node 平台:依赖全量打包,内建模块真 external(不被浏览器 stub 替换)
  ssr: { noExternal: true },
  build: {
    ssr: true,
    target: 'node20',
    outDir: 'dist',
    minify: false,
    rollupOptions: {
      input: { index: 'src/index.ts', serve: 'src/serve.ts' },
      external: [/^node:/],
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
      },
    },
  },
});
