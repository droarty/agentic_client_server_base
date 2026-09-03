import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export * from './schema';
export * from './pg-array';

export type Database = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString });
  // pg.Pool re-emits backend connection errors (e.g. an admin/fast shutdown
  // racing with in-flight teardown) as its own 'error' event — with no
  // listener, Node treats that as an unhandled exception and crashes the
  // process. This is a no-op: real errors are still surfaced through query
  // rejections; this only stops teardown-time noise from being fatal.
  pool.on('error', () => {});
  const db = drizzle(pool, { schema });
  return { db, pool };
}
