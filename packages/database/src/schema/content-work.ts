import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { admins } from './identity.ts';
import { contentRevisions } from './content.ts';

export const contentJobs = pgTable(
  'content_jobs',
  {
    id: uuid('id').primaryKey(),
    collectionId: text('collection_id').notNull(),
    collectionKey: text('collection_key').notNull(),
    action: text('action').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    documentId: uuid('document_id'),
    expectedRevision: integer('expected_revision'),
    versionId: uuid('version_id'),
    handlerName: text('handler_name'),
    sourceOperation: text('source_operation').notNull(),
    requestedVersionId: uuid('requested_version_id'),
    resultRevisionId: uuid('result_revision_id'),
    executeAt: timestamp('execute_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('queued'),
    owner: uuid('owner'),
    generation: integer('generation').notNull().default(0),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    delegationId: uuid('delegation_id'),
  },
  (t) => [
    foreignKey({
      columns: [t.versionId, t.documentId, t.collectionId],
      foreignColumns: [
        contentRevisions.id,
        contentRevisions.documentId,
        contentRevisions.collectionId,
      ],
    }).onDelete('restrict'),
    index('content_jobs_due_idx').on(t.status, t.executeAt, t.leaseUntil, t.id),
    index('content_jobs_document_idx').on(t.documentId, t.status),
    index('content_jobs_delegation_idx')
      .on(t.delegationId)
      .where(sql`${t.delegationId} IS NOT NULL`),
    check(
      'content_job_revision_check',
      sql`${t.expectedRevision} IS NULL OR ${t.expectedRevision}>0`,
    ),
    check('content_job_generation_check', sql`${t.generation}>=0`),
    check('content_job_attempts_check', sql`${t.attempts}>=0`),
    check(
      'content_job_lease_shape',
      sql`(${t.status}='running' AND ${t.owner} IS NOT NULL AND ${t.leaseUntil} IS NOT NULL) OR (${t.status}<>'running' AND ${t.owner} IS NULL AND ${t.leaseUntil} IS NULL)`,
    ),
    check(
      'content_job_terminal_shape',
      sql`(${t.status} IN ('succeeded','partial','failed','cancelled') AND ${t.finishedAt} IS NOT NULL) OR (${t.status} IN ('queued','running') AND ${t.finishedAt} IS NULL)`,
    ),
    check(
      'content_job_publication_shape',
      sql`${t.action}<>'publication' OR (${t.documentId} IS NOT NULL AND ${t.expectedRevision} IS NOT NULL)`,
    ),
    check(
      'content_job_extension_shape',
      sql`${t.action}<>'extension' OR (${t.documentId} IS NOT NULL AND ${t.handlerName} IS NOT NULL)`,
    ),
    check('content_job_action_check', sql`${t.action} IN ('batch','publication','extension')`),
    check(
      'content_job_status_check',
      sql`${t.status} IN ('queued','running','succeeded','partial','failed','cancelled')`,
    ),
  ],
);

export const contentJobItems = pgTable(
  'content_job_items',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => contentJobs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    documentId: uuid('document_id').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('queued'),
    resultDocumentId: uuid('result_document_id'),
    resultRevisionId: uuid('result_revision_id'),
    errorCode: text('error_code'),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.position] }),
    check('content_job_item_position_check', sql`${t.position}>=0`),
    check('content_job_item_revision_check', sql`${t.expectedRevision}>0`),
    check(
      'content_job_item_result_shape',
      sql`(${t.status} IN ('queued','cancelled') AND ${t.errorCode} IS NULL AND ${t.resultDocumentId} IS NULL AND ${t.resultRevisionId} IS NULL) OR (${t.status}='succeeded' AND ${t.errorCode} IS NULL AND ${t.resultDocumentId} IS NOT NULL) OR (${t.status}='failed' AND ${t.errorCode} IS NOT NULL AND ${t.resultDocumentId} IS NULL AND ${t.resultRevisionId} IS NULL)`,
    ),
    check(
      'content_job_item_status_check',
      sql`${t.status} IN ('queued','succeeded','failed','cancelled')`,
    ),
  ],
);
