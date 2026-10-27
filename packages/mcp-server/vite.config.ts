import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

/**
 * 遥测上报的默认值(见 src/telemetry.ts)在**构建期**从**仓库根** `.env.local` 读取后烤进产物
 * (集中放,见根 .env.local.example)。
 *
 * 为什么烤:终端用户不会配 env,而 key 随 npm 包公开分发、解包即得 —— 它不是真秘密
 * (挡扫描器的口令,真防护靠后端限流与轮换),所以「不进 git、只进 dist」是这里能拿到的
 * 最好状态(与 UI 的 `__APP_VERSION__` 同一套,见 dec 0016)。
 *
 * 优先序:真实环境变量(CI secret)> 仓库根 `.env.local`。两者都没有 = 空串
 * = 上报链路整体 no-op(三重门第一道)。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(import.meta.dirname, '../..'), '');
  const telemetryUrl = env.TEXT_TO_DESIGN_TELEMETRY_URL ?? '';
  const telemetryKey = env.TEXT_TO_DESIGN_TELEMETRY_KEY ?? '';
  if (process.env.CI && (telemetryUrl === '' || telemetryKey === '')) {
    console.warn(
      '[text-to-design-mcp] 未注入 TEXT_TO_DESIGN_TELEMETRY_URL / TEXT_TO_DESIGN_TELEMETRY_KEY,本次产物遥测关闭',
    );
  }
  return {
    define: {
      __TELEMETRY_DEFAULT_URL__: JSON.stringify(telemetryUrl),
      __TELEMETRY_DEFAULT_KEY__: JSON.stringify(telemetryKey),
    },
    build: {
      ssr: 'src/index.ts',
      outDir: 'dist',
      minify: true,
    },
  };
});
