import {
  boolean,
  char,
  foreignKey,
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { admins } from './identity.ts';
import { contentDocuments, contentRevisions } from './content.ts';
import type { PgTableExtraConfigValue } from 'drizzle-orm/pg-core';

export const assetObjects = pgTable('asset_objects', {
  id: uuid('id').primaryKey(),
  objectKey: text('object_key').notNull().unique(),
  state: text('state').notNull(),
  digest: char('digest', { length: 64 }),
  bytes: bigint('bytes', { mode: 'number' }),
  mimeType: text('mime_type'),
  retainUntil: timestamp('retain_until', { withTimezone: true }).notNull(),
  writeDeadline: timestamp('write_deadline', { withTimezone: true }),
  nextCleanupAt: timestamp('next_cleanup_at', { withTimezone: true }),
  cleanupAttempts: integer('cleanup_attempts').notNull().default(0),
  cleanupFailureCode: text('cleanup_failure_code'),
  cleanupBlocked: boolean('cleanup_blocked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetManifests = pgTable('asset_manifests', {
  id: uuid('id').primaryKey(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  bytes: bigint('bytes', { mode: 'number' }).notNull(),
  digest: char('digest', { length: 64 }).notNull(),
  width: integer('width'),
  height: integer('height'),
  orientation: integer('orientation'),
  processorVersion: text('processor_version').notNull(),
  recipe: jsonb('recipe').notNull(),
  state: text('state').notNull(),
  retainUntil: timestamp('retain_until', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetManifestObjects = pgTable(
  'asset_manifest_objects',
  {
    manifestId: uuid('manifest_id')
      .notNull()
      .references(() => assetManifests.id),
    objectId: uuid('object_id')
      .notNull()
      .references(() => assetObjects.id),
    name: text('name').notNull(),
    width: integer('width'),
    height: integer('height'),
  },
  (table) => [
    primaryKey({ columns: [table.manifestId, table.name] }),
    unique().on(table.manifestId, table.objectId),
  ],
);

export const assetUploads = pgTable(
  'asset_uploads',
  {
    id: uuid('id').primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => admins.id),
    collectionKey: text('collection_key').notNull(),
    purpose: text('purpose').notNull(),
    documentId: uuid('document_id'),
    expectedRevision: integer('expected_revision'),
    filename: text('filename').notNull(),
    declaredType: text('declared_type').notNull(),
    declaredBytes: bigint('declared_bytes', { mode: 'number' }).notNull(),
    settings: jsonb('settings').notNull(),
    status: text('status').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    generation: integer('generation').notNull(),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    manifestId: uuid('manifest_id').references(() => assetManifests.id),
    boundDocumentId: uuid('bound_document_id'),
    boundRevisionId: uuid('bound_revision_id'),
    originalObjectId: uuid('original_object_id').references(() => assetObjects.id),
    failureCode: text('failure_code'),
    jobId: uuid('job_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: 'asset_uploads_job_fk',
      columns: [table.jobId],
      foreignColumns: [assetJobs.id],
    }).onDelete('restrict'),
  ],
);

export const assetReferences = pgTable(
  'asset_references',
  {
    id: uuid('id').primaryKey(),
    revisionId: uuid('revision_id').notNull(),
    documentId: uuid('document_id').notNull(),
    collectionKey: text('collection_key').notNull(),
    sourcePath: text('source_path').notNull(),
    mediaDocumentId: uuid('media_document_id')
      .notNull()
      .references(() => contentDocuments.id, { onDelete: 'restrict' }),
    mediaCollectionKey: text('media_collection_key').notNull(),
    manifestId: uuid('manifest_id')
      .notNull()
      .references(() => assetManifests.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.revisionId, table.sourcePath),
    foreignKey({
      columns: [table.revisionId, table.documentId],
      foreignColumns: [contentRevisions.id, contentRevisions.documentId],
    }).onDelete('cascade'),
    index('asset_references_manifest_idx').on(table.manifestId),
  ],
);

export const assetJobs = pgTable('asset_jobs', {
  id: uuid('id').primaryKey(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => admins.id),
  collectionKey: text('collection_key').notNull(),
  action: text('action').notNull(),
  uploadId: uuid('upload_id')
    .notNull()
    .references(() => assetUploads.id),
  documentId: uuid('document_id'),
  expectedRevision: integer('expected_revision'),
  recipe: jsonb('recipe').notNull(),
  status: text('status').notNull(),
  owner: uuid('owner'),
  generation: integer('generation').notNull(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  attempts: integer('attempts').notNull(),
  failureCode: text('failure_code'),
  manifestId: uuid('manifest_id').references(() => assetManifests.id),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const assetJobObjects = pgTable(
  'asset_job_objects',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => assetJobs.id),
    generation: integer('generation').notNull(),
    objectId: uuid('object_id')
      .notNull()
      .references(() => assetObjects.id),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.generation, table.objectId] })],
);
