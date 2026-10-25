import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { admins } from './identity.ts';

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    operationId: varchar('operation_id', { length: 128 }).notNull(),
    scopeRef: text('scope_ref').notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    fingerprint: char('fingerprint', { length: 64 }).notNull(),
    result: jsonb('result'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique().on(t.actorId, t.operationId, t.scopeRef, t.key),
    check('idempotency_expiry_check', sql`${t.expiresAt}>${t.createdAt}`),
    index('idempotency_expires_idx').on(t.expiresAt),
  ],
);

export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    key: varchar('key', { length: 128 }).primaryKey(),
    count: integer('count').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('rate_count_check', sql`${t.count}>0`),
    index('rate_limit_expires_idx').on(t.expiresAt),
  ],
);
