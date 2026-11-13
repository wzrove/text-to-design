import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Env } from '../env';
import * as schema from './schema';

/**
 * 连接串 → 池。**键必须含连接串**:Workers 路线用 Hyperdrive 绑定、Node 路线用
 * `DATABASE_URL`,同进程内连接串可变(轮换凭据、多绑定);此前 `cached ??=` 只认首次,
 * 后到的请求会静默复用旧池。
 */
const pools = new Map<string, NodePgDatabase<typeof schema>>();

export function getDb(env: Env): NodePgDatabase<typeof schema> {
  const connectionString = env.DB?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('no database: bind Hyperdrive DB or set DATABASE_URL');
  }
  let db = pools.get(connectionString);
  if (db == null) {
    db = drizzle(new Pool({ connectionString }), { schema });
    pools.set(connectionString, db);
  }
  return db;
}
