import { pgTable, uuid, text, timestamp, boolean, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { groups } from './groups';
import { artifacts } from './artifacts';

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The app-level public identifier (was a plain UUID string on the Mongoose model).
  channelId: uuid('channel_id').notNull().unique().defaultRandom(),
  workflowType: text('workflow_type').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  // One-to-one for document-backed channels — unique + cascade delete fixes today's
  // non-atomic two-delete artifact/channel cleanup (see DatabasePersistor plan notes).
  artifactId: uuid('artifact_id').unique().references(() => artifacts.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => groups.id),
  // Loosely reference other channels by their public channel_id (not the PK), matching
  // today's Mongo-side reference-by-app-UUID pattern — but now with real referential
  // integrity, which Mongo never enforced here.
  targetChannelId: uuid('target_channel_id').references((): AnyPgColumn => channels.channelId),
  parentChannelId: uuid('parent_channel_id').references((): AnyPgColumn => channels.channelId),
  responseHandler: text('response_handler'),
  isSessionChannel: boolean('is_session_channel').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Mirrors Mongo's partial unique index (`partialFilterExpression: { isSessionChannel: true }`)
  // — only one stateless "session" channel per (workflowType, userId, groupId, targetChannelId).
  uniqueIndex('channels_session_uniqueness')
    .on(table.workflowType, table.userId, table.groupId, table.targetChannelId)
    .where(sql`${table.isSessionChannel} = true`),
]);
