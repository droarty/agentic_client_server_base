#!/usr/bin/env node
/**
 * Creates a new top-level ("root", parentGroupId: null) group and seeds its owner(s).
 * Owner selection:
 *   - If exactly one user exists in the system, that user becomes the sole owner.
 *   - Otherwise, the owner(s) of the most recently created root group become owners
 *     of the new group too (ownership propagates forward).
 * Usage:
 *   pnpm run create-root-group <groupName>
 */
const { MongoClient } = require('mongodb');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/agentic_client_server_base';

async function main() {
  const groupName = process.argv[2];
  if (!groupName) {
    console.error('Usage: pnpm run create-root-group <groupName>');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  try {
    const userCount = await db.collection('users').countDocuments({});
    let ownerUserIds;

    if (userCount === 1) {
      const onlyUser = await db.collection('users').findOne({});
      ownerUserIds = [onlyUser._id];
    } else {
      const mostRecentRootGroup = await db.collection('groups')
        .find({ parentGroupId: null })
        .sort({ createdAt: -1 })
        .limit(1)
        .next();

      if (!mostRecentRootGroup) {
        console.error(
          userCount === 0
            ? 'No users exist yet and no root group exists to inherit owners from.'
            : 'More than one user exists and no root group exists yet to inherit owners from.'
        );
        process.exit(1);
      }

      const ownerMemberships = await db.collection('memberships')
        .find({ groupId: mostRecentRootGroup._id, roles: 'owner' })
        .toArray();

      if (ownerMemberships.length === 0) {
        console.error(`Most recent root group "${mostRecentRootGroup.name}" (${mostRecentRootGroup._id}) has no owners to inherit.`);
        process.exit(1);
      }

      ownerUserIds = ownerMemberships.map((m) => m.userId);
    }

    const now = new Date();
    const { insertedId: groupId } = await db.collection('groups').insertOne({
      name: groupName,
      parentGroupId: null,
      ancestors: [],
      createdAt: now,
      updatedAt: now,
    });

    await db.collection('memberships').insertMany(
      ownerUserIds.map((userId) => ({
        userId,
        groupId,
        roles: ['owner'],
        joinedAt: now,
      }))
    );

    console.log(`Created root group "${groupName}" (${groupId}) with ${ownerUserIds.length} owner(s): ${ownerUserIds.join(', ')}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('create-new-root-group failed:', err);
  process.exit(1);
});
