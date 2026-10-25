import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { roles } from './access.ts';
import { bytea, timestamps, version } from './columns.ts';

export const admins = pgTable(
  'admins',
  {
    id: uuid('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    displayName: varchar('display_name', { length: 64 }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    version: version(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    check('admins_email_check', sql`${t.email}=lower(btrim(${t.email})) AND length(${t.email})>0`),
    check('admins_status_check', sql`${t.status} IN ('active','disabled','archived')`),
    check('admins_version_check', sql`${t.version}>0`),
    index('admins_role_id_idx').on(t.roleId),
    index('admins_created_idx').on(t.createdAt, t.id),
  ],
);

export const credentials = pgTable(
  'credentials',
  {
    adminId: uuid('admin_id')
      .primaryKey()
      .references(() => admins.id, { onDelete: 'restrict' }),
    passwordHash: text('password_hash').notNull(),
    version: version(),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps(),
  },
  (t) => [check('credentials_version_check', sql`${t.version}>0`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    tokenHash: bytea('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    check('sessions_hash_check', sql`octet_length(${t.tokenHash})=32`),
    check('sessions_expiry_check', sql`${t.expiresAt}>${t.createdAt}`),
    check('sessions_revoked_check', sql`${t.revokedAt} IS NULL OR ${t.revokedAt}>=${t.createdAt}`),
    index('sessions_admin_idx').on(t.adminId, t.createdAt, t.id),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const actionTokens = pgTable(
  'action_tokens',
  {
    id: uuid('id').primaryKey(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    purpose: varchar('purpose', { length: 24 }).notNull(),
    tokenHash: bytea('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    check('action_tokens_purpose_check', sql`${t.purpose} IN ('invitation','password_reset')`),
    check('action_tokens_hash_check', sql`octet_length(${t.tokenHash})=32`),
    check('action_tokens_expiry_check', sql`${t.expiresAt}>${t.createdAt}`),
    check('action_tokens_terminal_check', sql`${t.consumedAt} IS NULL OR ${t.revokedAt} IS NULL`),
    check(
      'action_tokens_consumed_check',
      sql`${t.consumedAt} IS NULL OR ${t.consumedAt}>=${t.createdAt}`,
    ),
    check(
      'action_tokens_revoked_check',
      sql`${t.revokedAt} IS NULL OR ${t.revokedAt}>=${t.createdAt}`,
    ),
    uniqueIndex('action_tokens_one_live')
      .on(t.adminId, t.purpose)
      .where(sql`${t.consumedAt} IS NULL AND ${t.revokedAt} IS NULL`),
    index('action_tokens_expires_idx').on(t.expiresAt),
  ],
);

export const emailDeliveries = pgTable(
  'email_deliveries',
  {
    id: uuid('id').primaryKey(),
    actionTokenId: uuid('action_token_id')
      .notNull()
      .unique()
      .references(() => actionTokens.id, { onDelete: 'restrict' }),
    recipient: varchar('recipient', { length: 255 }).notNull(),
    template: varchar('template', { length: 24 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    failureCode: varchar('failure_code', { length: 32 }),
    ...timestamps(),
  },
  (t) => [
    check('email_template_check', sql`${t.template} IN ('invitation','password_reset')`),
    check(
      'email_status_check',
      sql`${t.status} IN ('pending','sending','accepted','failed','unknown')`,
    ),
    check(
      'email_failure_check',
      sql`${t.failureCode} IS NULL OR ${t.failureCode} IN ('capacity','transport_rejected','transport_timeout','transport_unknown','state_unconfirmed','interrupted')`,
    ),
    check('email_started_check', sql`${t.startedAt} IS NULL OR ${t.startedAt}>=${t.createdAt}`),
    check('email_finished_check', sql`${t.finishedAt} IS NULL OR ${t.finishedAt}>=${t.createdAt}`),
    check(
      'email_time_order_check',
      sql`${t.finishedAt} IS NULL OR ${t.startedAt} IS NULL OR ${t.finishedAt}>=${t.startedAt}`,
    ),
    check(
      'email_deliveries_state_shape',
      sql`(${t.status}='pending' AND ${t.startedAt} IS NULL AND ${t.finishedAt} IS NULL AND ${t.failureCode} IS NULL) OR (${t.status}='sending' AND ${t.startedAt} IS NOT NULL AND ${t.finishedAt} IS NULL AND ${t.failureCode} IS NULL) OR (${t.status}='accepted' AND ${t.startedAt} IS NOT NULL AND ${t.finishedAt} IS NOT NULL AND ${t.failureCode} IS NULL) OR (${t.status} IN ('failed','unknown') AND ${t.finishedAt} IS NOT NULL AND ${t.failureCode} IS NOT NULL)`,
    ),
    index('email_deliveries_state_idx').on(t.status, t.createdAt),
  ],
);
