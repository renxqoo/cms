import { sql } from 'drizzle-orm';
import {
  pgTable,
  boolean,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  unique,
  index,
  foreignKey,
  check,
  char,
  varchar,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import { admins } from './identity.ts';
export const contentFolders = pgTable(
  'content_folders',
  {
    id: uuid('id').primaryKey(),
    collectionId: text('collection_id').notNull(),
    parentId: uuid('parent_id'),
    name: varchar('name', { length: 128 }).notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique().on(t.id, t.collectionId),
    foreignKey({
      columns: [t.parentId, t.collectionId],
      foreignColumns: [contentFolders.id, contentFolders.collectionId],
    }).onDelete('restrict'),
    check('content_folder_version_check', sql`${t.version}>0`),
    check('content_folder_parent_check', sql`${t.parentId} IS NULL OR ${t.parentId}<>${t.id}`),
    uniqueIndex('content_folders_siblings_uq').on(
      t.collectionId,
      sql`coalesce(${t.parentId},'00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.name})`,
    ),
  ],
);
export const contentDocuments = pgTable(
  'content_documents',
  {
    id: uuid('id').primaryKey(),
    collectionId: text('collection_id').notNull(),
    revision: integer('revision').notNull().default(0),
    currentVersionId: uuid('current_version_id'),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
    folderId: uuid('folder_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique().on(t.id, t.collectionId),
    foreignKey({
      name: 'content_document_folder_fk',
      columns: [t.folderId, t.collectionId],
      foreignColumns: [contentFolders.id, contentFolders.collectionId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'content_current_version_fk',
      columns: [t.currentVersionId, t.id, t.collectionId],
      foreignColumns: [
        contentRevisions.id,
        contentRevisions.documentId,
        contentRevisions.collectionId,
      ],
    }),
    check('content_revision_check', sql`${t.revision}>=0`),
    index('content_documents_collection_idx').on(t.collectionId, t.trashedAt, t.createdAt, t.id),
  ],
);
export const contentRevisions = pgTable(
  'content_revisions',
  {
    id: uuid('id').primaryKey(),
    documentId: uuid('document_id').notNull(),
    collectionId: text('collection_id').notNull(),
    revision: integer('revision').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    kind: text('kind').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique().on(t.id, t.documentId, t.collectionId),
    unique().on(t.id, t.documentId),
    unique().on(t.documentId, t.revision),
    foreignKey({
      columns: [t.documentId, t.collectionId],
      foreignColumns: [contentDocuments.id, contentDocuments.collectionId],
    }).onDelete('cascade'),
    index('content_revisions_document_idx').on(t.documentId, t.createdAt, t.id),
    index('content_revisions_schema_idx').on(t.collectionId, t.schemaVersion, t.id),
    check('content_revisions_positive', sql`${t.revision}>0 AND ${t.schemaVersion}>0`),
  ],
);
export const contentPublications = pgTable(
  'content_publications',
  {
    documentId: uuid('document_id').notNull(),
    collectionId: text('collection_id').notNull(),
    locale: text('locale').notNull(),
    versionId: uuid('version_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.locale] }),
    check('content_publication_locale_check', sql`${t.locale}='*' OR ${t.locale}~'^[a-zA-Z][a-zA-Z0-9-]{0,31}$'`),
    foreignKey({ name: 'content_publication_document_fk', columns: [t.documentId, t.collectionId], foreignColumns: [contentDocuments.id, contentDocuments.collectionId] }).onDelete('cascade'),
    foreignKey({ name: 'content_publication_revision_fk', columns: [t.versionId, t.documentId, t.collectionId], foreignColumns: [contentRevisions.id, contentRevisions.documentId, contentRevisions.collectionId] }).onDelete('restrict'),
    index('content_publications_version_idx').on(t.versionId),
  ],
);
export const contentReferences = pgTable(
  'content_references',
  {
    sourceRevisionId: uuid('source_revision_id').notNull(),
    sourceDocumentId: uuid('source_document_id').notNull(),
    sourceCollectionId: text('source_collection_id').notNull(),
    projectionSchemaVersion: integer('projection_schema_version').notNull(),
    fieldId: text('field_id').notNull(),
    sourcePath: text('source_path').notNull(),
    targetDocumentId: uuid('target_document_id').notNull(),
    targetCollectionId: text('target_collection_id').notNull(),
    onDelete: text('on_delete').notNull(),
    media: boolean('media').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({
      columns: [t.sourceRevisionId, t.projectionSchemaVersion, t.sourcePath, t.targetDocumentId],
    }),
    foreignKey({
      columns: [t.sourceRevisionId, t.sourceDocumentId, t.sourceCollectionId],
      foreignColumns: [
        contentRevisions.id,
        contentRevisions.documentId,
        contentRevisions.collectionId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.targetDocumentId, t.targetCollectionId],
      foreignColumns: [contentDocuments.id, contentDocuments.collectionId],
    }).onDelete('restrict'),
    index('content_references_target_idx').on(t.targetDocumentId, t.sourceRevisionId),
  ],
);
export const contentSchemaManifests = pgTable('content_schema_manifests', {
  fingerprint: char('fingerprint', { length: 64 }).primaryKey(),
  plan: jsonb('plan').notNull(),
  status: text('status').notNull().default('ready'),
  installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contentSchemaControl = pgTable('content_schema_control', {
  collectionId: text('collection_id').primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
  preparedSchemaVersion: integer('prepared_schema_version'),
  preparedFingerprint: char('prepared_fingerprint', { length: 64 }),
});
export const contentSchemaVersions = pgTable(
  'content_schema_versions',
  {
    collectionId: text('collection_id').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    dataFingerprint: char('data_fingerprint', { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.schemaVersion] })],
);
export const contentSchemaBackfills = pgTable(
  'content_schema_backfills',
  {
    revisionId: uuid('revision_id').notNull(),
    documentId: uuid('document_id').notNull(),
    collectionId: text('collection_id').notNull(),
    targetSchemaVersion: integer('target_schema_version').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.targetSchemaVersion] }),
    foreignKey({
      columns: [t.revisionId, t.documentId, t.collectionId],
      foreignColumns: [
        contentRevisions.id,
        contentRevisions.documentId,
        contentRevisions.collectionId,
      ],
    }).onDelete('cascade'),
  ],
);
export const contentSchemaDocumentBackfills = pgTable(
  'content_schema_document_backfills',
  {
    documentId: uuid('document_id').notNull(),
    collectionId: text('collection_id').notNull(),
    targetSchemaVersion: integer('target_schema_version').notNull(),
    revision: integer('revision').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.targetSchemaVersion] }),
    foreignKey({
      columns: [t.documentId, t.collectionId],
      foreignColumns: [contentDocuments.id, contentDocuments.collectionId],
    }).onDelete('cascade'),
  ],
);
