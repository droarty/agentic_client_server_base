import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

// Google Photos is the first consumer; other external-service OAuth
// connections (e.g. Dropbox, OneDrive) reuse this same table via a new
// tokenType value rather than a new table.
export const GOOGLE_PHOTOS_TOKEN_TYPE = 'google_photos' as const;

// One row per (user, tokenType) — a user can have at most one connection per
// service. accessToken/refreshToken are stored in plaintext for this phase
// (no encryption-at-rest utility exists in this codebase yet); see the
// "assets" feature plan for the tracked follow-up.
export const serviceTokens = pgTable('service_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Plain text discriminator (not pgEnum), same rationale as assets.assetType
  // — future service connections shouldn't require an enum migration.
  tokenType: text('token_type').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  scope: text('scope').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('service_tokens_user_id_token_type_key').on(table.userId, table.tokenType),
]);
