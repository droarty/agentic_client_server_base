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
  // URL to our own persisted copy of the media (set once transformStatus
  // reaches 'done') — null until then. Never the source's own transient URL
  // (e.g. Google's baseUrl, which expires ~60 minutes after being minted and
  // needs an auth header anyway); that lives in metadata.mediaFile.baseUrl.
  sourceUrl: text('source_url'),
  // URL to our own persisted static thumbnail image — VIDEO assets only. A
  // resized frame downloaded from the source (see planThumbnailDownload in
  // google-photos-picker.client.ts) and persisted separately from the full
  // video in sourceUrl, since the frontend needs a poster image it can show
  // immediately without decoding/playing the video. Always null for PHOTO
  // assets (their sourceUrl is already a directly-displayable static image).
  thumbnailSrc: text('thumbnail_src'),
  // Stable identifier at the source, independent of sourceUrl's staleness —
  // used to dedupe re-imports of the same item.
  sourceId: text('source_id'),
  // Arbitrary provider-specific payload — deliberately schemaless, same
  // rationale as artifacts.state.
  metadata: jsonb('metadata').notNull().default({}),
  // Lifecycle of the async work that turns a freshly-imported item into a
  // browser-servable asset (download from the source, optionally convert,
  // upload to storage). 'none' is the default for asset types that never
  // need this (or haven't started it yet); Google Photos ingestion sets
  // 'downloading' immediately at insert and resolves to 'done'/'failed'.
  transformStatus: text('transform_status').notNull().default('none'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('assets_user_asset_type_source_id_key')
    .on(table.userId, table.assetType, table.sourceId)
    .where(sql`${table.sourceId} IS NOT NULL`),
]);
