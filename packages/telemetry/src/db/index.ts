import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Env } from '../env';
import * as schema from './schema';

let cached: NodePgDatabase<typeof schema> | undefined;

export function getDb(env: Env): NodePgDatabase<typeof schema> {
  const connectionString = env.DB?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('no database: bind Hyperdrive DB or set DATABASE_URL');
  }
  cached ??= drizzle(new Pool({ connectionString }), { schema });
  return cached;
}
