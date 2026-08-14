import * as path from 'path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, type Database } from './index';
import { startTestPostgres, type TestPostgresHandle } from './test-helpers/embedded-postgres';
import type { Pool } from 'pg';

let pgHandle: TestPostgresHandle;
let db: Database;
let pool: Pool;

beforeAll(async () => {
  pgHandle = await startTestPostgres('db_schema_test');
  const created = createDb(pgHandle.connectionString);
  db = created.db;
  pool = created.pool;
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', 'drizzle') });
}, 60000);

afterAll(async () => {
  // Close the pg pool before stopping the server — otherwise the abrupt shutdown
  // surfaces as an unhandled connection-terminated error on the still-open pool.
  await pool?.end();
  await pgHandle?.stop();
}, 30000);

const EXPECTED_TABLES = [
  'users',
  'sso_providers',
  'groups',
  'memberships',
  'membership_roles',
  'artifacts',
  'artifact_group_permissions',
  'artifact_user_permissions',
  'channels',
  'workflow_configs',
  'workflow_logs',
];

describe('migrations produce the expected schema', () => {
  test.each(EXPECTED_TABLES)('table "%s" exists', async (tableName) => {
    const result = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    `);
    expect(result.rows).toHaveLength(1);
  });

  test('artifacts.state column is jsonb', async () => {
    const result = await db.execute(sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'artifacts' AND column_name = 'state'
    `);
    expect(result.rows[0]?.['data_type']).toBe('jsonb');
  });

  test('foreign keys with ON DELETE CASCADE are present on artifact_group_permissions', async () => {
    const result = await db.execute(sql`
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name = 'artifact_group_permissions'
    `);
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row['delete_rule']).toBe('CASCADE');
    }
  });
});

describe('channels partial unique index (session-channel uniqueness)', () => {
  // NULL columns are never equal to each other in SQL uniqueness checks (unlike
  // Mongo's partialFilterExpression behavior), so a fair test of the constraint
  // needs concrete, non-null group_id/target_channel_id values — a real gap
  // between the two engines' semantics, not an oversight in this test.
  async function insertUser(): Promise<string> {
    const result = await db.execute(sql`
      INSERT INTO users (email) VALUES (${`u-${Math.random()}@test.com`}) RETURNING id
    `);
    return result.rows[0]?.['id'] as string;
  }

  async function insertGroup(): Promise<string> {
    const result = await db.execute(sql`INSERT INTO groups (name) VALUES ('test-group') RETURNING id`);
    return result.rows[0]?.['id'] as string;
  }

  async function insertTargetChannel(userId: string): Promise<string> {
    const result = await db.execute(sql`
      INSERT INTO channels (workflow_type, user_id) VALUES ('target-workflow', ${userId}) RETURNING channel_id
    `);
    return result.rows[0]?.['channel_id'] as string;
  }

  test('rejects a second is_session_channel=true row with the same (workflow_type, user_id, group_id, target_channel_id)', async () => {
    const userId = await insertUser();
    const groupId = await insertGroup();
    const targetChannelId = await insertTargetChannel(userId);
    await db.execute(sql`
      INSERT INTO channels (workflow_type, user_id, group_id, target_channel_id, is_session_channel)
      VALUES ('test-workflow', ${userId}, ${groupId}, ${targetChannelId}, true)
    `);

    await expect(
      db.execute(sql`
        INSERT INTO channels (workflow_type, user_id, group_id, target_channel_id, is_session_channel)
        VALUES ('test-workflow', ${userId}, ${groupId}, ${targetChannelId}, true)
      `)
    ).rejects.toThrow();
  });

  test('allows duplicate (workflow_type, user_id, group_id, target_channel_id) when is_session_channel=false', async () => {
    const userId = await insertUser();
    const groupId = await insertGroup();
    const targetChannelId = await insertTargetChannel(userId);
    await db.execute(sql`
      INSERT INTO channels (workflow_type, user_id, group_id, target_channel_id, is_session_channel)
      VALUES ('test-workflow-2', ${userId}, ${groupId}, ${targetChannelId}, false)
    `);

    await expect(
      db.execute(sql`
        INSERT INTO channels (workflow_type, user_id, group_id, target_channel_id, is_session_channel)
        VALUES ('test-workflow-2', ${userId}, ${groupId}, ${targetChannelId}, false)
      `)
    ).resolves.toBeDefined();
  });
});
