import { pgTable, uuid, text, timestamp, jsonb, primaryKey, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from './users';
import { groups } from './groups';
import { accessLevelEnum, permissionManagerModeEnum } from './enums';

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // The "workflowType" — which workflow config JSON drives this artifact's behavior.
  type: text('type').notNull(),
  // Resolved to a real FK: Mongo stored this as a plain string, inconsistent with
  // memberships.userId being a real ObjectId (see plan's field-type inconsistency note).
  userId: uuid('user_id').notNull().references(() => users.id),
  groupId: uuid('group_id').references(() => groups.id),
  parentId: uuid('parent_id').references((): AnyPgColumn => artifacts.id),
  permissionManagerMode: permissionManagerModeEnum('permission_manager_mode').notNull().default('owner'),
  // Arbitrary workflow-engine-owned JSON blob — the one genuinely schemaless piece,
  // deliberately left as JSONB rather than normalized.
  state: jsonb('state'),
  // Nullable — most artifacts never expire. Set for short-lived, hidden
  // artifacts (e.g. a Google Photos picker session) so a future cleanup job
  // has something to act on. No such job exists yet; this only records intent.
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Replaces the embedded `permissions: [{groupId, access}]` array on the Artifact model.
export const artifactGroupPermissions = pgTable('artifact_group_permissions', {
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  access: accessLevelEnum('access').notNull(),
}, (table) => [
  primaryKey({ columns: [table.artifactId, table.groupId] }),
]);

// Replaces the embedded `userPermissions: [{userId, access}]` array on the Artifact model.
export const artifactUserPermissions = pgTable('artifact_user_permissions', {
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  access: accessLevelEnum('access').notNull(),
}, (table) => [
  primaryKey({ columns: [table.artifactId, table.userId] }),
]);
