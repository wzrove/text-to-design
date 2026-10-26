# text-to-design-telemetry

遥测/错误收集后端。Hono + Drizzle,纯 Vite 打包,产物不绑任何运行时。

## API

| 路由 | 说明 |
| --- | --- |
| `GET /healthz` | 存活检查,免鉴权 |
| `POST /v1/errors` | 批量错误上报,1–50 条/次 |

`/v1/*` 需 `Authorization: Bearer <TELEMETRY_API_KEY>`;CORS 放开供插件 iframe 直连。

```bash
curl -X POST http://localhost:8787/v1/errors \
  -H 'Authorization: Bearer <key>' -H 'Content-Type: application/json' \
  -d '{"user":{"fingerprint":"a1b2c3","clientVersion":"0.13.3","mcpVersion":"0.13.3"},"errors":[{"message":"boom","stack":"...","context":{"tool":"get_selection"}}]}'
```

## 本地开发

```bash
cp .env.example .env     # 填 TELEMETRY_API_KEY / DATABASE_URL
pnpm db:migrate          # 建表(drizzle-kit 自动读 .env)
pnpm dev                 # tsx watch + node --env-file,默认 :8787
```

`.env` 是唯一本地配置源:dev server、drizzle-kit、studio 都读它。
环境变量读取统一走 `envOf(c)`:Workers 取绑定 `c.env`,Node/Bun 取 `process.env`,绑定优先。

## 构建

`pnpm build` → Vite 打包,无运行时特定依赖(仅 external `node:*` 内建):

- `dist/index.js` —— `export default app`(fetch handler)。Cloudflare Workers、Bun(`bun dist/index.js`)、Deno Deploy 等直接可用
- `dist/serve.js` —— Node 入口,`node dist/serve.js`(或 `pnpm start`),`PORT` 可配

## 部署(Cloudflare Workers Builds,连 git 自动部署)

控制台建 Worker `text-to-design-telemetry` → Settings → Builds → Connect,连本仓库:

- Root directory:`packages/telemetry`
- Build command:`pnpm install`
- Deploy command:`npx wrangler deploy`

CF 路线由 wrangler 在构建机上从 `src/index.ts` 直接打包(esbuild);vite 的 `dist/` 产物只服务 Node/Bun 自托管,**不要**把 `main` 指到它(vite 的 CJS 兼容层过不了 CF 上传校验)。之后 push 到仓库即自动部署。一次性准备(控制台或 `npx wrangler` 均可):

```bash
# 1. Hyperdrive(Workers 出网到 Postgres 必须走它;用 Supabase 直连串,不走 pooler)
npx wrangler hyperdrive create text-to-design-telemetry --connection-string "<supabase-direct-url>"
# 2. 把返回的 id 填进 wrangler.jsonc 的 hyperdrive 绑定并取消注释
# 3. 密钥:控制台 Worker → Settings → Variables and Secrets,或 npx wrangler secret put TELEMETRY_API_KEY
```

迁移直接对 Supabase 跑(不经任何 Worker):`DATABASE_URL="<supabase-direct-url>" pnpm db:migrate`。

## 发送端(mcp-server daemon)

daemon 侧上报器见 `packages/mcp-server/src/telemetry.ts`。**冲刷是事件驱动的**(dec 1a135e6a),无常驻定时器:

- 空队列 = 零 timer;首条错误入队才挂一个 10s 聚合窗口,窗口内不重置,持续错误流也按期成批
- 队列达 50 条立即冲;成功后归零退避,队列还有剩就接着排空
- 失败按指数退避 + jitter 重挂,封顶 5 分钟
- `uncaughtException` / `unhandledRejection` 冲 3s 后按 Node 默认语义退出;shutdown 冲 1.5s

门控顺序:endpoint/key 配置 → 用户同意(面板 `⋯` 菜单,默认关)→ 才采集/上报;匿名安装标识存 `~/.text-to-design/install-id`。`DEFAULT_ENDPOINT` / `DEFAULT_API_KEY` 已填真值,env 覆盖用于轮换期新旧并行:

```bash
TEXT_TO_DESIGN_TELEMETRY_URL=https://<worker>.workers.dev/v1/errors
TEXT_TO_DESIGN_TELEMETRY_KEY=<与 Workers secret 同值>
```

## 表

- `telemetry_users`:fingerprint(唯一,= `~/.text-to-design/install-id` 的随机 UUID,非浏览器指纹) / client_version / mcp_version / created_at(首见) / updated_at(最近活跃)。同指纹重复上报走 upsert,未带的版本不覆盖旧值
- `error_reports`:user_id → telemetry_users(id) / **error_id(发送端条目级 id,唯一;重试重发同一批靠它幂等)** / level / message / stack / context(jsonb) / **count(同一错误聚合次数,发送端去重累加,默认 1)** / created_at

一次上报 = 一个事务:upsert 用户,再挂错记录(同 `error_id` 冲突只抬 count,不插重复行)。不存通用遥测事件。
