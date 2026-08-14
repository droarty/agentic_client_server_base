import { createDb, type Database } from '@agentic-client-server-base/db-schema';
import type { Pool } from 'pg';
import { env } from '../config/env';

// A lazy accessor (rather than a bare exported constant) so tests can point
// this at a per-file embedded-postgres instance via their own connectDB(url)
// call before any service code runs — the connection string isn't known
// until after that instance starts, which happens after this module loads.
let current: { db: Database; pool: Pool } | undefined;

export function getDb(): Database {
  if (!current) throw new Error('Database not connected — call connectDB() first');
  return current.db;
}

export async function connectDB(connectionString: string = env.DATABASE_URL): Promise<void> {
  const created = createDb(connectionString);
  await created.pool.query('SELECT 1');
  current = created;
  console.log('Postgres connected');
}

export async function disconnectDB(): Promise<void> {
  await current?.pool.end();
  current = undefined;
}
