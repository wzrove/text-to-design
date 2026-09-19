import { defineConfig } from 'vitest/config';

/**
 * 工作区统一测试入口。
 *
 * 覆盖范围有意分成两处,对应两类不变式:
 * - 各包的 src 目录 —— 包内不变式,随 `tsc --noEmit` 一起类型检查;
 * - 仓库根的 tests 目录 —— **跨包**不变式(如二进制编解码的两侧互逆),
 *   放进任一单包都会造成错误的依赖方向(shared 不能反向依赖 ui)。
 *
 * 注意:本文件的 glob 不能写成星号紧跟斜杠,否则会提前闭合这个块注释。
 */
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.tsx',
      'tests/**/*.test.ts',
    ],
    // 默认 workers 即可:这里没有真正的并发争用需要覆盖
    reporters: ['default'],
  },
});
