#!/usr/bin/env node
/**
 * Migrates existing artifacts to the new channels collection.
 * Creates one Channel document per artifact (using the artifact's currentChannelId if present).
 * Idempotent — safe to re-run; artifacts already present in channels are skipped.
 *
 * Run after upgrading to the channels collection:
 *   node scripts/seed-channels.js
 */
const { MongoClient, ObjectId } = require('mongodb');
const { randomUUID } = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/agentic_client_server_base';

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  try {
    // Ensure indexes exist
    await db.collection('channels').createIndex({ channelId: 1 }, { unique: true });
    await db.collection('channels').createIndex({ artifactId: 1 }, { unique: true, sparse: true });
    await db.collection('channels').createIndex({ workflowType: 1, userId: 1, groupId: 1 }, { unique: true, sparse: true });

    const artifacts = await db.collection('artifacts').find({}).toArray();
    console.log(`Found ${artifacts.length} artifact(s) to migrate.`);

    let created = 0;
    let skipped = 0;

    for (const artifact of artifacts) {
      const artifactId = artifact._id;

      // Skip if channel already exists for this artifact
      const existing = await db.collection('channels').findOne({ artifactId });
      if (existing) {
        skipped++;
        continue;
      }

      // Use the artifact's currentChannelId if it still has one, otherwise generate a new UUID
      const channelId = artifact.currentChannelId || randomUUID();

      // If a channel already exists with that channelId (from a different artifact), generate a new one
      const channelIdConflict = await db.collection('channels').findOne({ channelId });
      const finalChannelId = channelIdConflict ? randomUUID() : channelId;

      const now = new Date();
      await db.collection('channels').insertOne({
        channelId: finalChannelId,
        workflowType: artifact.type,
        userId: artifact.userId,
        artifactId,
        groupId: artifact.groupId ?? undefined,
        createdAt: artifact.createdAt ?? now,
        updatedAt: now,
      });

      created++;
    }

    console.log(`Migration complete: ${created} channel(s) created, ${skipped} already existed.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('seed-channels failed:', err);
  process.exit(1);
});
