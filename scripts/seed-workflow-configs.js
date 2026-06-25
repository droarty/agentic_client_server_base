#!/usr/bin/env node
/**
 * Seeds the workflowconfigs collection from scripts/workflow-seeds/.
 * Idempotent — safe to re-run; existing configs are updated in place.
 * Run after first install or to migrate an existing instance:
 *   node scripts/seed-workflow-configs.js
 */
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/agentic_client_server_base';
const seedDir = path.join(__dirname, 'workflow-seeds');

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const firstUser = await db.collection('users').findOne({}, { sort: { _id: 1 }, projection: { _id: 1 } });
  const createdBy = firstUser ? String(firstUser._id) : undefined;

  const files = fs.readdirSync(seedDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const typeName = file.replace('.json', '');
    const raw = JSON.parse(fs.readFileSync(path.join(seedDir, file), 'utf-8'));

    const doc = {
      name: typeName,
      displayName: raw.displayName || typeName,
      version: raw.version || '1.0.0',
      initialState: raw.initialState || {},
      handlers: raw.handlers || {},
      ...(createdBy ? { createdBy } : {}),
    };

    await db.collection('workflowconfigs').updateOne(
      { name: typeName },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    console.log(`  upserted: ${typeName}`);
  }

  await client.close();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
