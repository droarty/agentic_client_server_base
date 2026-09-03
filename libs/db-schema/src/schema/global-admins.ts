import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

// Flat allow-list of global admins. userId is itself the primary key,
// guaranteeing at most one row per user — no separate surrogate id needed.
export const globalAdmins = pgTable('global_admins', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
