import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // Nullable — absent for pure-SSO accounts, matching Mongoose's optional password field.
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Replaces the embedded ssoProviders[] array on the Mongoose User model.
export const ssoProviders = pgTable('sso_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerId: text('provider_id').notNull(),
  email: text('email').notNull(),
  displayName: text('display_name'),
}, (table) => [
  unique('sso_providers_provider_provider_id_key').on(table.provider, table.providerId),
]);
