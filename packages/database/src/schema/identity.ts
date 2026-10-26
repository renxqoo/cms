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
  jsonb,
  integer,
  boolean,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
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

export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    redirectUris: jsonb('redirect_uris').notNull(),
    grantTypes: text('grant_types').array().notNull(),
    scopes: text('scopes').array().notNull(),
    native: boolean('native').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    check('oauth_clients_redirect_uris_check', sql`jsonb_typeof(${t.redirectUris})='array'`),
    check('oauth_clients_name_check', sql`length(${t.name})>0 AND length(${t.name})<=80`),
  ],
);

export const credentialGrants = pgTable(
  'credential_grants',
  {
    id: uuid('id').primaryKey(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => credentialGrants.id, {
      onDelete: 'restrict',
    }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    resource: text('resource').notNull(),
    clientId: text('client_id').references(() => oauthClients.id, { onDelete: 'restrict' }),
    keyHash: bytea('key_hash').unique(),
    prefix: text('prefix'),
    grants: jsonb('grants').notNull(),
    depth: integer('depth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    check('credential_grants_kind_check', sql`${t.kind} IN ('api_key','oauth')`),
    check('credential_grants_name_check', sql`length(${t.name})>0 AND length(${t.name})<=80`),
    check('credential_grants_resource_check', sql`${t.resource} IN ('api','mcp')`),
    check('credential_grants_grants_check', sql`jsonb_typeof(${t.grants})='array'`),
    check('credential_grants_depth_check', sql`${t.depth}>0`),
    check('credential_grants_expiry_check', sql`${t.expiresAt}>${t.createdAt}`),
    check(
      'credential_grants_shape_check',
      sql`(${t.kind}='api_key' AND ${t.keyHash} IS NOT NULL AND octet_length(${t.keyHash})=32 AND ${t.prefix} IS NOT NULL AND ${t.clientId} IS NULL AND ${t.resource}='mcp') OR (${t.kind}='oauth' AND ${t.keyHash} IS NULL AND ${t.prefix} IS NULL AND ${t.clientId} IS NOT NULL)`,
    ),
    check('credential_grants_parent_check', sql`${t.parentId} IS NULL OR ${t.parentId}<>${t.id}`),
    index('credential_grants_admin_idx').on(t.adminId, t.createdAt, t.id),
    index('credential_grants_parent_idx').on(t.parentId),
    index('credential_grants_client_idx').on(t.adminId, t.clientId),
    index('credential_grants_expiry_idx').on(t.expiresAt, t.id),
  ],
);

export const credentialTokens = pgTable(
  'credential_tokens',
  {
    id: uuid('id').primaryKey(),
    grantId: uuid('grant_id')
      .notNull()
      .references(() => credentialGrants.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    resource: text('resource').notNull(),
    tokenHash: bytea('token_hash').notNull().unique(),
    scopes: text('scopes').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [
    check('credential_tokens_kind_check', sql`${t.kind} IN ('access','refresh')`),
    check('credential_tokens_resource_check', sql`${t.resource} IN ('api','mcp')`),
    check('credential_tokens_token_hash_check', sql`octet_length(${t.tokenHash})=32`),
    check('credential_tokens_expiry_check', sql`${t.expiresAt}>${t.createdAt}`),
    check(
      'credential_tokens_consumption_check',
      sql`${t.kind}='refresh' OR ${t.consumedAt} IS NULL`,
    ),
    index('credential_tokens_grant_idx').on(t.grantId, t.kind, t.expiresAt, t.id),
    index('credential_tokens_expiry_idx').on(t.expiresAt, t.id),
  ],
);

export const oauthRequests = pgTable(
  'oauth_requests',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'restrict' }),
    redirectUri: text('redirect_uri').notNull(),
    issuer: text('issuer').notNull(),
    resourceUri: text('resource_uri').notNull(),
    resource: text('resource').notNull(),
    scopes: text('scopes').array().notNull(),
    state: text('state'),
    codeChallenge: text('code_challenge').notNull(),
    status: text('status').notNull(),
    codeHash: bytea('code_hash').unique(),
    grantId: uuid('grant_id').references(() => credentialGrants.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('oauth_requests_resource_check', sql`${t.resource} IN ('api','mcp')`),
    check(
      'oauth_requests_status_check',
      sql`${t.status} IN ('pending','approved','denied','consumed')`,
    ),
    check(
      'oauth_requests_code_hash_check',
      sql`${t.codeHash} IS NULL OR octet_length(${t.codeHash})=32`,
    ),
    check(
      'oauth_requests_shape_check',
      sql`(${t.status}='pending' AND ${t.codeHash} IS NULL AND ${t.grantId} IS NULL) OR (${t.status}='denied' AND ${t.codeHash} IS NULL AND ${t.grantId} IS NULL) OR (${t.status} IN ('approved','consumed') AND ${t.codeHash} IS NOT NULL AND ${t.grantId} IS NOT NULL)`,
    ),
    index('oauth_requests_expiry_idx').on(t.expiresAt, t.id),
    index('oauth_requests_grant_idx').on(t.grantId),
  ],
);
