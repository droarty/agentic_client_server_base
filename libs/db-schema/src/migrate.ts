import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './index';

// Explicit, auditable migration step — deliberately not run automatically on app boot,
// so apps/api and apps/event-processor can't race to migrate simultaneously on startup.
async function main() {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set to run migrations');
  }
  const { db, pool } = createDb(connectionString);
  await migrate(db, { migrationsFolder: 'libs/db-schema/drizzle' });
  await pool.end();
  console.log('Migrations applied');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
