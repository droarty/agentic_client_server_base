import { pgTable, uuid, text, timestamp, uniqueIndex, primaryKey, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from './users';
import { membershipRoleEnum } from './enums';

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  parentGroupId: uuid('parent_group_id').references((): AnyPgColumn => groups.id),
  // Denormalized full-ancestor-chain array (materialized-path style), matching the Mongoose
  // `ancestors` field — computed once at creation, not maintained afterward. Kept as a plain
  // array rather than normalized into a join table or recursive CTE for now (lowest-risk 1:1
  // port); see plan's open risks re: revisiting if group trees turn out to be deep/wide.
  ancestors: uuid('ancestors').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('memberships_user_id_group_id_key').on(table.userId, table.groupId),
]);

// Replaces the Mongo `roles: [String]` array on Membership — a small closed enum, and
// genuinely relational data, so normalized into a real join table rather than a Postgres
// array column (this is exactly the "structured data" motivation behind this migration).
export const membershipRoles = pgTable('membership_roles', {
  membershipId: uuid('membership_id').notNull().references(() => memberships.id, { onDelete: 'cascade' }),
  role: membershipRoleEnum('role').notNull(),
}, (table) => [
  primaryKey({ columns: [table.membershipId, table.role] }),
]);
