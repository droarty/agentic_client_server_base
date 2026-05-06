#!/usr/bin/env node
/**
 * Drops dev collections that were renamed as part of the ChatDocument → Artifact migration.
 * Run once after pulling this change: node scripts/drop-dev-collections.js
 */
const { MongoClient } = require('mongodb');

const uri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/multiplayer_base';

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  for (const name of ['chatdocuments', 'workflowlogs']) {
    const exists = await db.listCollections({ name }).hasNext();
    if (exists) {
      await db.collection(name).drop();
      console.log(`Dropped: ${name}`);
    } else {
      console.log(`Not found (skipping): ${name}`);
    }
  }

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
