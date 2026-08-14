import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workflowLogTypeEnum } from './enums';

// Only touched via raw queries in QueryExecutor.ts — the Mongoose model wrapping this
// collection (WorkflowConfigModel) was confirmed dead code and is not being ported.
export const workflowConfigs = pgTable('workflow_configs', {
  name: text('name').primaryKey(),
  displayName: text('display_name').notNull(),
  version: text('version').notNull(),
  initialState: jsonb('initial_state').notNull().default({}),
  handlers: jsonb('handlers').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// No TTL index equivalent in Postgres — 7-day retention is enforced by an app-level
// periodic cleanup job in event-processor (see Phase 4), not schema-level DDL.
export const workflowLogs = pgTable('workflow_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel: text('channel').notNull(),
  docType: text('doc_type').notNull(),
  handlerName: text('handler_name').notNull(),
  logType: workflowLogTypeEnum('log_type').notNull(),
  executionId: uuid('execution_id'),
  parentExecutionId: uuid('parent_execution_id'),
  stepIndex: integer('step_index'),
  message: jsonb('message'),
  user: jsonb('user'),
  handlerConfig: jsonb('handler_config'),
  // Mongo's `route` field is either a string or string[] depending on the step —
  // stored as JSONB rather than text to preserve that shape without stringifying it.
  route: jsonb('route'),
  resolvedMessage: jsonb('resolved_message'),
  errorMessage: text('error_message'),
  errorDetail: jsonb('error_detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('workflow_logs_channel_execution_id_idx').on(table.channel, table.executionId),
  index('workflow_logs_channel_parent_execution_id_idx').on(table.channel, table.parentExecutionId),
  index('workflow_logs_created_at_idx').on(table.createdAt),
]);
