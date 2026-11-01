// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), kind: text('kind').notNull(),
  patient: text('patient'), fingerprint: text('fingerprint'), data: text('data').notNull(), created: text('created').notNull(),
}, table => [uniqueIndex('unique_upload').on(table.owner,table.kind,table.patient,table.fingerprint)]);
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), query: text('query').notNull(),
  channel: text('channel').notNull(), status: text('status').notNull(), attempts: integer('attempts').notNull().default(0),
  next: integer('next').notNull().default(0), data: text('data').notNull(),
}, table => [uniqueIndex('query_channel').on(table.query, table.channel)]);
