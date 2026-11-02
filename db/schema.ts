import {
  pgTable,
  text,
  integer,
  bigint,
  bigserial,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
export const records = pgTable(
  'records',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    kind: text('kind').notNull(),
    patient: text('patient'),
    fingerprint: text('fingerprint'),
    data: text('data').notNull(),
    created: text('created').notNull(),
  },
  (table) => [
    uniqueIndex('unique_upload').on(
      table.owner,
      table.kind,
      table.patient,
      table.fingerprint,
    ),
  ],
).enableRLS();
export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    query: text('query').notNull(),
    channel: text('channel').notNull(),
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    sequence: bigserial('sequence', { mode: 'number' }).notNull(),
    next: bigint('next', { mode: 'number' }).notNull().default(0),
    data: text('data').notNull(),
  },
  (table) => [uniqueIndex('query_channel').on(table.query, table.channel)],
).enableRLS();
