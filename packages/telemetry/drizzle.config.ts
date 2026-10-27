import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

/**
 * 配置源:仓库根的 `.env.local`(本地开发配置集中放那里,见根 .env.local.example)。
 * `process.loadEnvFile` **不覆盖**已存在的变量 —— 所以真实环境变量始终最高,
 * 文件缺席也可以(CI / 部署侧直接给 env)。
 */
const envFile = resolve(import.meta.dirname, '../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
