import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getRuntimeKey } from 'hono/adapter';
import { Client, Pool } from 'pg';
import type { Env } from '../env';
import * as schema from './schema';

const timeouts = { connectionTimeoutMillis: 2_000, query_timeout: 4_000 };
const pools = new Map<string, Pool>();

function logConnectionError(error: Error): void {
  console.error(error);
}

export async function withDb<T>(
  env: Env,
  run: (db: NodePgDatabase<typeof schema>) => PromiseLike<T>,
): Promise<T> {
  const connectionString = env.DB?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('no database: bind Hyperdrive DB or set DATABASE_URL');
  }
  const options = { connectionString, ...timeouts };
  if (env.DB || getRuntimeKey() === 'workerd') {
    // Workers 在请求结束时回收连接，Hyperdrive 管理底层池。
    const client = new Client(options);
    client.on('error', logConnectionError);
    await client.connect();
    return run(drizzle(client, { schema }));
  }

  let pool = pools.get(connectionString);
  if (pool == null) {
    pool = new Pool(options);
    pool.on('error', logConnectionError);
    pools.set(connectionString, pool);
  }
  const client = await pool.connect();
  client.on('error', logConnectionError);
  let discard = true;
  try {
    const result = await run(drizzle(client, { schema }));
    discard = false;
    return result;
  } finally {
    client.off('error', logConnectionError);
    client.release(discard);
  }
}

export function withTransaction<T>(
  env: Env,
  run: (db: NodePgDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
  return withDb(env, async (db) => {
    await db.execute(sql`begin`);
    try {
      const result = await run(db);
      await db.execute(sql`commit`);
      return result;
    } catch (error) {
      try {
        await db.execute(sql`rollback`);
      } catch (rollbackError) {
        console.error('Telemetry transaction rollback failed', rollbackError);
      }
      throw error;
    }
  });
}
