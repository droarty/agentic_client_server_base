#!/usr/bin/env node
/**
 * Deletes all artifacts with type 'chat' from MongoDB.
 * Run once after pulling this change: node scripts/delete-chat-artifacts.js
 */
const { MongoClient } = require('mongodb');

const uri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/multiplayer_base';

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const result = await db.collection('artifacts').deleteMany({ type: 'chat' });
  console.log(`Deleted ${result.deletedCount} artifact(s) with type 'chat'`);

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
