import { pgTable, integer, uuid, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

// Generic, extensible representation of an external asset (Google Photos to
// start; future providers reuse this table via a new assetType value rather
// than a schema change).
export const assets = pgTable('assets', {
  // Internal-only sequential PK — never exposed to clients. First table in
  // this codebase to use this instead of a uuid id (see publicId below).
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // External-facing identifier — this is what API/WS responses and any
  // future URLs reference. Generated at insert time, immutable thereafter.
  publicId: uuid('public_id').notNull().defaultRandom().unique(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Plain text discriminator (not pgEnum), same rationale as artifacts.type —
  // future asset types shouldn't require an enum migration.
  assetType: text('asset_type').notNull(),
  name: text('name'),
  // Source's URL for the asset at import time — for Google Photos this is a
  // baseUrl that expires ~60 minutes after being minted, so it's a snapshot,
  // not a durable link.
  sourceUrl: text('source_url'),
  // Stable identifier at the source, independent of sourceUrl's staleness —
  // used to dedupe re-imports of the same item.
  sourceId: text('source_id'),
  // Arbitrary provider-specific payload — deliberately schemaless, same
  // rationale as artifacts.state.
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('assets_user_asset_type_source_id_key')
    .on(table.userId, table.assetType, table.sourceId)
    .where(sql`${table.sourceId} IS NOT NULL`),
]);
