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
    /** 发送端条目级 id:重试重发同一批时靠它幂等(dec 1a135e6a)。老客户端不传 → NULL,Postgres 唯一索引对 NULL 不去重 */
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('error_reports_created_at_idx').on(t.createdAt),
    index('error_reports_user_id_idx').on(t.userId),
    uniqueIndex('error_reports_error_id_key').on(t.errorId),
  ],
);
