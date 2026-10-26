import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { getDb } from './db';
import { errorReports, telemetryUsers } from './db/schema';
import { type Env, envOf } from './env';

const userInput = z.object({
  fingerprint: z.string().min(1).max(200),
  clientVersion: z.string().min(1).max(50).optional(),
  mcpVersion: z.string().min(1).max(50).optional(),
});

const errorInput = z.object({
  /** 发送端条目级 id;老客户端不传 → 存 NULL,唯一索引对 NULL 不去重(dec 1a135e6a) */
  id: z.string().min(1).max(100).optional(),
  level: z.enum(['fatal', 'error', 'warn']).default('error'),
  message: z.string().min(1).max(8000),
  stack: z.string().max(20000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  count: z.number().int().min(1).max(1_000_000).default(1),
});

const errorsBody = z.object({
  user: userInput,
  errors: z.array(errorInput).min(1).max(50),
});

const app = new Hono<{ Bindings: Env }>();

app.get('/healthz', (c) => c.json({ ok: true }));

app.use(
  '/v1/*',
  cors({
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['POST', 'GET'],
    maxAge: 86_400,
  }),
);

const requireAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  // 未设密钥必须拒绝,否则写入端点对公网裸奔
  const { TELEMETRY_API_KEY } = envOf(c);
  if (!TELEMETRY_API_KEY) {
    return c.json({ error: 'TELEMETRY_API_KEY unset' }, 500);
  }
  if (c.req.header('Authorization') !== `Bearer ${TELEMETRY_API_KEY}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

app.use('/v1/*', requireAuth);

app.post('/v1/errors', async (c) => {
  const parsed = errorsBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid body' }, 400);
  }
  const { user, errors } = parsed.data;
  const db = getDb(envOf(c));

  const userId = await db.transaction(async (tx) => {
    // 同指纹重复上报只更新版本与时间;未带的版本不覆盖旧值
    const [row] = await tx
      .insert(telemetryUsers)
      .values({
        fingerprint: user.fingerprint,
        clientVersion: user.clientVersion ?? null,
        mcpVersion: user.mcpVersion ?? null,
      })
      .onConflictDoUpdate({
        target: telemetryUsers.fingerprint,
        set: {
          clientVersion: sql`coalesce(excluded.client_version, telemetry_users.client_version)`,
          mcpVersion: sql`coalesce(excluded.mcp_version, telemetry_users.mcp_version)`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: telemetryUsers.id });
    if (!row) {
      throw new Error('user upsert returned no row');
    }
    await tx
      .insert(errorReports)
      .values(
        errors.map((e) => ({
          errorId: e.id ?? null,
          userId: row.id,
          level: e.level,
          message: e.message,
          stack: e.stack ?? null,
          context: e.context ?? null,
          count: e.count,
        })),
      )
      // 重发同一批(客户端没收到 2xx)不得插重复行;count 只许抬不许降(dec 1a135e6a)
      .onConflictDoUpdate({
        target: errorReports.errorId,
        set: { count: sql`greatest(${errorReports.count}, excluded.count)` },
      });
    return row.id;
  });

  return c.json({ ok: true, accepted: errors.length, userId });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal' }, 500);
});

export default app;
