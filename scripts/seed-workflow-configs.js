#!/usr/bin/env node
/**
 * Seeds the workflow_configs table from scripts/workflow-seeds/.
 * Idempotent — safe to re-run; existing configs are updated in place.
 * Run after first install or to migrate an existing instance:
 *   node scripts/seed-workflow-configs.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectionString = process.env['DATABASE_URL'] || 'postgres://postgres:postgres@localhost:5433/agentic_client_server_base';
const seedDir = path.join(__dirname, 'workflow-seeds');

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows: [firstUser] } = await client.query(
      'SELECT id FROM users ORDER BY created_at ASC LIMIT 1'
    );
    const createdBy = firstUser ? firstUser.id : null;

    const files = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const typeName = file.replace('.json', '');
      const raw = JSON.parse(fs.readFileSync(path.join(seedDir, file), 'utf-8'));

      await client.query(
        `INSERT INTO workflow_configs (name, display_name, version, initial_state, handlers, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           version = EXCLUDED.version,
           initial_state = EXCLUDED.initial_state,
           handlers = EXCLUDED.handlers,
           created_by = EXCLUDED.created_by,
           updated_at = now()`,
        [
          typeName,
          raw.displayName || typeName,
          raw.version || '1.0.0',
          JSON.stringify(raw.initialState || {}),
          JSON.stringify(raw.handlers || {}),
          createdBy,
        ]
      );

      console.log(`  upserted: ${typeName}`);
    }

    console.log('Done.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
