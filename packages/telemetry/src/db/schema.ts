import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const telemetryUsers = pgTable(
  'telemetry_users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** 匿名安装标识:发送端 `~/.text-to-design/install-id` 的随机 UUID,非浏览器指纹 */
    fingerprint: text('fingerprint').notNull(),
    clientVersion: text('client_version'),
    mcpVersion: text('mcp_version'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('telemetry_users_fingerprint_key').on(t.fingerprint)],
);

export const errorReports = pgTable(
  'error_reports',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /**
     * 发送端条目级 id:重发同一批时它**没变** → 该批的 count 已计过,不重复累加
     * (rollup 的幂等水位,见 src/index.ts 的 ON CONFLICT)。老客户端不传 → NULL。
     */
    errorId: text('error_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => telemetryUsers.id),
    level: text('level').notNull().default('error'),
    message: text('message').notNull(),
    stack: text('stack'),
    context: jsonb('context').$type<Record<string, unknown>>(),
    /** 同一错误的聚合次数(发送端去重累加,默认 1) */
    count: integer('count').notNull().default(1),
    /**
     * 分组键 `scope|code|subject|归一化 message`(shared/dicts/error-report,两侧同一份实现)。
     * 跨窗口 rollup 靠它 —— 客户端窗口内去重、服务端跨窗口去重,同一错误最终只有一行。
     */
    fingerprint: text('fingerprint'),
    /** 错误类别(ERROR_CODES);老客户端不传 → NULL */
    code: text('code'),
    /** 来源档位(bridge/tool/daemon);老客户端不传 → NULL */
    scope: text('scope'),
    /** 工具名 / 插件方法名 */
    subject: text('subject'),
    /** 该分组最近一次出现;created_at 是首见 */
    lastSeen: timestamp('last_seen', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('error_reports_created_at_idx').on(t.createdAt),
    index('error_reports_user_id_idx').on(t.userId),
    // 一行 = 一个 (安装, 错误形状):冲突只抬 count / last_seen,不再插新行
    uniqueIndex('error_reports_user_fingerprint_key').on(
      t.userId,
      t.fingerprint,
    ),
  ],
);
