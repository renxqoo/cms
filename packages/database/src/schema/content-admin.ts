import { sql } from 'drizzle-orm';
import {
  pgTable,
  bigint,
  numeric,
  unique,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  foreignKey,
  primaryKey,
  check,
  char,
  varchar,
} from 'drizzle-orm/pg-core';
import { admins, credentialGrants } from './identity.ts';
import { contentDocuments, contentRevisions, contentSchemaControl } from './content.ts';
export const contentQueryPresets = pgTable(
  'content_query_presets',
  {
    id: uuid('id').primaryKey(),
    collectionId: text('collection_id').notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 128 }).notNull(),
    query: jsonb('query').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    access: jsonb('access').notNull(),
  },
  (t) => [
    check('content_query_presets_version_check', sql`${t.version}>0`),
    check('content_query_presets_query_check', sql`jsonb_typeof(${t.query})='object'`),
    check(
      'content_query_presets_access_check',
      sql`coalesce((jsonb_typeof(${t.access})='object' AND jsonb_typeof(${t.access}->'read')='object' AND jsonb_typeof(${t.access}->'read'->'constraint')='string' AND jsonb_typeof(${t.access}->'update')='object' AND jsonb_typeof(${t.access}->'update'->'constraint')='string' AND jsonb_typeof(${t.access}->'delete')='object' AND jsonb_typeof(${t.access}->'delete'->'constraint')='string'),false)`,
    ),
    index('content_query_presets_collection_idx').on(t.collectionId, t.createdAt, t.id),
    index('content_query_presets_owner_idx').on(t.collectionId, t.ownerId),
  ],
);
export const contentQueryPresetReferences = pgTable(
  'content_query_preset_references',
  {
    presetId: uuid('preset_id').notNull(),
    fieldId: text('field_id').notNull(),
    sourcePath: text('source_path').notNull(),
    targetDocumentId: uuid('target_document_id').notNull(),
    targetCollectionId: text('target_collection_id').notNull(),
  },
  (t) => [
    primaryKey({
      name: 'content_query_preset_references_pkey',
      columns: [t.presetId, t.sourcePath, t.targetDocumentId],
    }),
    foreignKey({
      name: 'content_query_preset_references_preset_fk',
      columns: [t.presetId],
      foreignColumns: [contentQueryPresets.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'content_query_preset_references_document_fk',
      columns: [t.targetDocumentId, t.targetCollectionId],
      foreignColumns: [contentDocuments.id, contentDocuments.collectionId],
    }).onDelete('restrict'),
    index('content_query_preset_references_target_idx').on(t.targetDocumentId),
  ],
);
export const contentOrderControl = pgTable(
  'content_order_control',
  {
    collectionId: text('collection_id').notNull(),
    version: uuid('version').notNull().defaultRandom(),
    lastPosition: numeric('last_position').notNull().default('0'),
    scopeKey: text('scope_key').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.scopeKey] }),
    check(
      'content_order_control_position_check',
      sql`${t.lastPosition}>=0 AND ${t.lastPosition}<'Infinity'::numeric`,
    ),
  ],
);
export const contentDocumentOrder = pgTable(
  'content_document_order',
  {
    documentId: uuid('document_id').notNull(),
    collectionId: text('collection_id').notNull(),
    position: numeric('position').notNull(),
    scopeKey: text('scope_key').notNull().default(''),
    initialPosition: numeric('initial_position'),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.scopeKey] }),
    foreignKey({
      name: 'content_document_order_document_fk',
      columns: [t.documentId, t.collectionId],
      foreignColumns: [contentDocuments.id, contentDocuments.collectionId],
    }).onDelete('cascade'),
    check(
      'content_document_order_position_check',
      sql`${t.position} NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)`,
    ),
    unique('content_document_order_position_uq').on(t.collectionId, t.scopeKey, t.position),
    unique('content_document_order_initial_uq').on(t.collectionId, t.initialPosition),
    check(
      'content_document_order_initial_check',
      sql`(${t.scopeKey}='' AND ${t.initialPosition} IS NOT NULL AND ${t.initialPosition} NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)) OR (${t.scopeKey}<>'' AND ${t.initialPosition} IS NULL)`,
    ),
  ],
);
export const contentDocumentLeases = pgTable(
  'content_document_leases',
  {
    documentId: uuid('document_id')
      .primaryKey()
      .references(() => contentDocuments.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    displayName: varchar('display_name', { length: 64 }),
    editorId: uuid('editor_id').notNull(),
    locale: varchar('locale', { length: 32 }).notNull(),
    generation: integer('generation').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    delegationId: uuid('delegation_id').references(() => credentialGrants.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [check('content_document_leases_generation_check', sql`${t.generation}>0`)],
);

export const contentHierarchyValidation = pgTable('content_hierarchy_validation', {
  collectionId: text('collection_id')
    .primaryKey()
    .references(() => contentSchemaControl.collectionId, { onDelete: 'cascade' }),
  epoch: bigint('epoch', { mode: 'bigint' }).notNull().default(0n),
  validatedEpoch: bigint('validated_epoch', { mode: 'bigint' }),
  configuration: char('configuration', { length: 64 }),
  validationToken: uuid('validation_token'),
  validatingConfiguration: char('validating_configuration', { length: 64 }),
  validatedAt: timestamp('validated_at', { withTimezone: true }),
  validationExpiresAt: timestamp('validation_expires_at', { withTimezone: true }),
});
export const contentPreviewGrants = pgTable(
  'content_preview_grants',
  {
    id: uuid('id').primaryKey(),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    issuerId: uuid('issuer_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    collectionId: text('collection_id').notNull(),
    documentId: uuid('document_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    locale: text('locale').notNull(),
    clientOrigin: text('client_origin').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: 'content_preview_revision_fk',
      columns: [t.revisionId, t.documentId, t.collectionId],
      foreignColumns: [
        contentRevisions.id,
        contentRevisions.documentId,
        contentRevisions.collectionId,
      ],
    }).onDelete('cascade'),
    check(
      'content_preview_lifetime',
      sql`${t.expiresAt}>${t.createdAt} AND ${t.expiresAt}<=${t.createdAt}+interval '600 seconds'`,
    ),
    check('content_preview_locale', sql`${t.locale}~'^[a-zA-Z][a-zA-Z0-9-]{0,31}$'`),
    check('content_preview_digest', sql`${t.tokenHash}~'^[0-9a-f]{64}$'`),
    index('content_preview_grants_expiry_idx').on(t.expiresAt, t.id),
    index('content_preview_grants_issuer_idx')
      .on(t.issuerId, t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);
