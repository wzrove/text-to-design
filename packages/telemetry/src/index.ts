import { desc, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import {
  ERROR_CODES,
  ERROR_REPORT_LEVELS,
  LOG_SCOPES,
  TELEMETRY_LIMITS,
} from 'text-to-design-shared';
import { z } from 'zod';
import { getDb } from './db';
import { errorReports, telemetryUsers } from './db/schema';
import { type Env, envOf } from './env';
import { mergeBatchByFingerprint } from './merge-batch';

const userInput = z.object({
  fingerprint: z.string().min(1).max(200),
  clientVersion: z.string().min(1).max(50).optional(),
  mcpVersion: z.string().min(1).max(50).optional(),
});

const errorInput = z
  .object({
    /** 发送端条目级 id;重发同一批时它不变 → rollup 不重复计数(见下方 ON CONFLICT) */
    id: z.string().min(1).max(TELEMETRY_LIMITS.idMax).optional(),
    level: z.enum(ERROR_REPORT_LEVELS).default('error'),
    message: z.string().min(1).max(TELEMETRY_LIMITS.messageMax),
    stack: z.string().max(TELEMETRY_LIMITS.stackMax).optional(),
    /** 字节上限见 .refine:键数不限,但序列化后不得超过 contextMaxBytes */
    context: z.record(z.string(), z.unknown()).optional(),
    count: z.number().int().min(1).max(1_000_000).default(1),
    /** 分类三元组:老客户端不传 → NULL,分组退化成只按归一化 message */
    code: z.enum(ERROR_CODES).optional(),
    scope: z.enum(LOG_SCOPES).optional(),
    subject: z.string().min(1).max(TELEMETRY_LIMITS.subjectMax).optional(),
  })
  .refine(
    (v) =>
      v.context == null ||
      Buffer.byteLength(JSON.stringify(v.context), 'utf8') <=
        TELEMETRY_LIMITS.contextMaxBytes,
    { message: 'context too large', path: ['context'] },
  );

const errorsBody = z.object({
  user: userInput,
  errors: z.array(errorInput).min(1).max(TELEMETRY_LIMITS.batchMax),
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
  // content-length 早拒:zod 校验在 c.req.json() **之后**,不先看长度就是把整个 body
  // 读进内存再判。单条 context 无键数上限,放大面就在这。
  const declared = Number(c.req.header('content-length') ?? '');
  if (Number.isFinite(declared) && declared > TELEMETRY_LIMITS.bodyMaxBytes) {
    return c.json({ error: 'body too large' }, 413);
  }
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
    // 批内先按指纹合并,理由见 mergeBatchByFingerprint 的注释。
    const rows = mergeBatchByFingerprint(errors, row.id);
    await tx
      .insert(errorReports)
      .values([...rows.values()])
      // 一行 = 一个 (安装, 错误形状):跨窗口累加 count。重发同一批时 error_id 没变 →
      // 该批已计过,不重复累加 —— 幂等靠 error_id 水位,不靠唯一索引(dec 1a135e6a)
      .onConflictDoUpdate({
        target: [errorReports.userId, errorReports.fingerprint],
        set: {
          count: sql`case when ${errorReports.errorId} = excluded.error_id then ${errorReports.count} else ${errorReports.count} + excluded.count end`,
          errorId: sql`excluded.error_id`,
          code: sql`coalesce(excluded.code, ${errorReports.code})`,
          scope: sql`coalesce(excluded.scope, ${errorReports.scope})`,
          subject: sql`coalesce(excluded.subject, ${errorReports.subject})`,
          lastSeen: sql`now()`,
        },
      });
    return row.id;
  });

  return c.json({ ok: true, accepted: errors.length, userId });
});

/** 查询参数夹取:数字乱填不该 500,夹到合法区间即可 */
function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/**
 * 读侧:按 (code, scope, subject) 聚合的排行榜。分类已经落在列上,这里不再扫 message ——
 * 客户端在窗口内聚合、服务端按 fingerprint 跨窗口 rollup,查询只需 sum(count)。
 */
app.get('/v1/errors/summary', async (c) => {
  const db = getDb(envOf(c));
  const params = new URL(c.req.url).searchParams;
  const hours = clampInt(Number(params.get('hours') ?? 24), 1, 24 * 30);
  const limit = clampInt(Number(params.get('limit') ?? 50), 1, 200);
  const since = new Date(Date.now() - hours * 3_600_000);
  const groups = await db
    .select({
      code: errorReports.code,
      scope: errorReports.scope,
      subject: errorReports.subject,
      total: sql<number>`sum(${errorReports.count})::int`,
      users: sql<number>`count(distinct ${errorReports.userId})::int`,
      lastSeen: sql<string>`max(${errorReports.lastSeen})`,
      sample: sql<string>`(array_agg(${errorReports.message} order by ${errorReports.lastSeen} desc))[1]`,
    })
    .from(errorReports)
    .where(gte(errorReports.lastSeen, since))
    .groupBy(errorReports.code, errorReports.scope, errorReports.subject)
    .orderBy(desc(sql`sum(${errorReports.count})`))
    .limit(limit);
  return c.json({ hours, limit, groups });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal' }, 500);
});

export default app;
