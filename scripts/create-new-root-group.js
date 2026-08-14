#!/usr/bin/env node
/**
 * Creates a new top-level ("root", parent_group_id: null) group and seeds its owner(s).
 * Owner selection:
 *   - If exactly one user exists in the system, that user becomes the sole owner.
 *   - Otherwise, the owner(s) of the most recently created root group become owners
 *     of the new group too (ownership propagates forward).
 * Usage:
 *   pnpm run create-root-group <groupName>
 */
const { Client } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectionString = process.env['DATABASE_URL'] || 'postgres://postgres:postgres@localhost:5433/agentic_client_server_base';

async function main() {
  const groupName = process.argv[2];
  if (!groupName) {
    console.error('Usage: pnpm run create-root-group <groupName>');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows: users } = await client.query('SELECT id FROM users');
    let ownerUserIds;

    if (users.length === 1) {
      ownerUserIds = [users[0].id];
    } else {
      const { rows: [mostRecentRootGroup] } = await client.query(
        'SELECT id, name FROM groups WHERE parent_group_id IS NULL ORDER BY created_at DESC LIMIT 1'
      );

      if (!mostRecentRootGroup) {
        console.error(
          users.length === 0
            ? 'No users exist yet and no root group exists to inherit owners from.'
            : 'More than one user exists and no root group exists yet to inherit owners from.'
        );
        process.exit(1);
      }

      const { rows: ownerMemberships } = await client.query(
        `SELECT m.user_id FROM memberships m
         JOIN membership_roles mr ON mr.membership_id = m.id
         WHERE m.group_id = $1 AND mr.role = 'owner'`,
        [mostRecentRootGroup.id]
      );

      if (ownerMemberships.length === 0) {
        console.error(`Most recent root group "${mostRecentRootGroup.name}" (${mostRecentRootGroup.id}) has no owners to inherit.`);
        process.exit(1);
      }

      ownerUserIds = ownerMemberships.map((m) => m.user_id);
    }

    await client.query('BEGIN');
    try {
      const { rows: [group] } = await client.query(
        `INSERT INTO groups (name, parent_group_id, ancestors) VALUES ($1, NULL, '{}') RETURNING id`,
        [groupName]
      );

      for (const userId of ownerUserIds) {
        const { rows: [membership] } = await client.query(
          'INSERT INTO memberships (user_id, group_id) VALUES ($1, $2) RETURNING id',
          [userId, group.id]
        );
        await client.query(
          "INSERT INTO membership_roles (membership_id, role) VALUES ($1, 'owner')",
          [membership.id]
        );
      }

      await client.query('COMMIT');
      console.log(`Created root group "${groupName}" (${group.id}) with ${ownerUserIds.length} owner(s): ${ownerUserIds.join(', ')}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('create-new-root-group failed:', err);
  process.exit(1);
});
