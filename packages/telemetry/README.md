# text-to-design-telemetry

遥测/错误收集后端。Hono + Drizzle,纯 Vite 打包,产物不绑任何运行时。

## API

| 路由 | 说明 |
| --- | --- |
| `GET /healthz` | 存活检查,免鉴权 |
| `POST /v1/errors` | 批量错误上报,1–50 条/次 |
| `GET /v1/errors/summary` | 按 `code / scope / subject` 聚合的错误排行(`?hours=24&limit=50`) |

`/v1/*` 需 `Authorization: Bearer <TELEMETRY_API_KEY>`;CORS 放开供插件 iframe 直连。

```bash
curl -X POST http://localhost:8787/v1/errors \
  -H 'Authorization: Bearer <key>' -H 'Content-Type: application/json' \
  -d '{"user":{"fingerprint":"a1b2c3","clientVersion":"0.13.3","mcpVersion":"0.13.3"},"errors":[{"message":"boom","stack":"...","context":{"tool":"get_selection"}}]}'
```

## 本地开发

本地配置集中放仓库根 `.env.local`(模板见根 `.env.local.example`)。Compose 从 `packages/telemetry/Dockerfile` 构建单镜像,包含 PostgreSQL 16 和遥测 Node 服务:

```bash
cp .env.local.example .env.local
docker compose up -d --build
docker compose logs -f telemetry
curl http://localhost:8787/healthz
```

容器先启动 PG,等待就绪后执行 Drizzle 增量迁移,再启动遥测。任一主进程退出则容器退出;停止容器会同时终止服务和数据库。健康检查同时检查 PG 与 `/healthz`。

端口仅绑定本机:`5433` 访问 PG、`8787` 访问遥测。数据沿用 `tdd-pg-data` 卷;`docker compose down` 保留数据,`docker compose down -v` 删除数据。旧 Compose 的 `postgres` 服务迁移到新配置时,使用 `docker compose up -d --build --remove-orphans`,避免旧容器占用端口和数据卷。

Compose 从 `.env.local` 读取 `TELEMETRY_API_KEY`;数据库用户名、密码、库名由 Compose 的 `POSTGRES_*` 配置控制,容器内 `DATABASE_URL` 自动生成并覆盖宿主机连接串。已有数据卷修改 `POSTGRES_*` 不会重置数据库账号。

需要源码热更新时,先 `docker compose stop telemetry`,再 `docker compose run -d --name text-to-design-pg-dev -p 127.0.0.1:5433:5432 --entrypoint /usr/local/bin/docker-entrypoint.sh telemetry postgres` 仅启动 PG,然后 `pnpm --filter text-to-design-telemetry dev`。结束后 `docker stop text-to-design-pg-dev && docker rm text-to-design-pg-dev`,再启动 Compose 服务。

配置源:仓库根 `.env.local` —— dev/start 用 `--env-file-if-exists=../../.env.local`,drizzle-kit 由 `drizzle.config.ts` 显式 `loadEnvFile` 同一份。**真实环境变量始终优先**,文件缺席也能跑(CI / 部署侧直接给 env)。
环境变量读取统一走 `envOf(c)`:Workers 取绑定 `c.env`,Node/Bun 取 `process.env`,绑定优先。

mcp 侧要指到本地 worker 时,根 `.env.local` 里的 `TEXT_TO_DESIGN_TELEMETRY_URL/KEY` 就是它 —— 但 mcp 是**构建期**读取(`pnpm --filter text-to-design-mcp build`),不进运行时。

## 构建

`pnpm build` → Vite 打包,无运行时特定依赖(仅 external `node:*` 内建):

- `dist/index.js` —— `export default app`(fetch handler)。Cloudflare Workers、Bun(`bun dist/index.js`)、Deno Deploy 等直接可用
- `dist/serve.js` —— Node 入口,`node dist/serve.js`(或 `pnpm start`),`PORT` 可配
- `dist/migrate.js` —— Node 迁移入口,从相邻 `drizzle/` 读取 SQL,容器启动时自动执行

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
- `error_reports`:**一行 = 一个 (安装, 错误形状)** —— user_id → telemetry_users(id) / **fingerprint(分组键 `scope|code|subject|归一化 message`,唯一 (user_id, fingerprint))** / code(ERROR_CODES)/ scope(bridge/tool/daemon)/ subject(工具名或插件方法名)/ level / message(首次出现那条,给人看)/ stack / context(jsonb) / **count(累计次数)** / **last_seen(最近一次)** / created_at(首见)。`error_id` 是**幂等水位**,不再是唯一索引

一次上报 = 一个事务:upsert 用户,再按 `(user_id, fingerprint)` upsert 错误行 —— 同形状冲突时 `count = count + excluded.count`、`last_seen = now()`;**重发同一批时 `error_id` 没变,该批已计过,不重复累加**。不存通用遥测事件。

分类口径在 `shared/dicts/error-report`:客户端(daemon)用它做窗口内去重,worker 用同一份算分组键 —— 两边必须得出同一个串。`message` 只作展示与样本,分类/聚合一律读 `code / scope / subject`。
