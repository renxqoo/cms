import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { admins } from './identity.ts';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    actorKind: varchar('actor_kind', { length: 16 }).notNull(),
    actorId: uuid('actor_id').references(() => admins.id, { onDelete: 'restrict' }),
    operationId: varchar('operation_id', { length: 128 }).notNull(),
    targetType: varchar('target_type', { length: 64 }).notNull(),
    targetId: varchar('target_id', { length: 160 }),
    requestId: varchar('request_id', { length: 128 }).notNull(),
    detail: jsonb('detail').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('audit_actor_kind_check', sql`${t.actorKind} IN ('system','admin')`),
    check('audit_actor_id_check', sql`${t.actorKind}<>'admin' OR ${t.actorId} IS NOT NULL`),
    index('audit_created_idx').on(t.createdAt, t.id),
    index('audit_actor_idx').on(t.actorId, t.createdAt),
    index('audit_target_idx').on(t.targetType, t.targetId, t.createdAt),
  ],
);
