import { expect, it } from 'vitest';
import {
  contentJobSchema,
  jobDetailSchema,
  jobPageSchema,
  uploadPageSchema,
  batchResultSchema,
} from '../jobs';
import { cleanupPageSchema, cleanupRetryReceiptSchema } from '../cleanups';

const id = '11111111-1111-4111-8111-111111111111';
const time = '2026-10-26T00:00:00.000Z';

it('validates safe content and asset discovery pages with distinct result kinds', () => {
  const content = {
    kind: 'content',
    id,
    collection: 'articles',
    action: 'publication',
    status: 'queued',
    executeAt: time,
    createdAt: time,
    finishedAt: null,
    documentId: id,
    expectedRevision: 4,
    requestedVersionId: id,
    total: 1,
    succeeded: 0,
    failed: 0,
  };
  const asset = {
    kind: 'asset',
    id,
    collection: 'media',
    action: 'process',
    status: 'running',
    attempts: 1,
    failureCode: null,
    uploadId: id,
    documentId: null,
    createdAt: time,
    finishedAt: null,
  };
  expect(
    jobPageSchema
      .parse({ rows: [content, asset], total: 2, page: 1, pageSize: 20 })
      .rows.map((row) => row.kind),
  ).toEqual(['content', 'asset']);
  expect(
    jobPageSchema.safeParse({
      rows: [{ ...asset, status: 'partial' }],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success,
  ).toBe(false);
  const detail = {
    ...content,
    items: [{ position: 0, id, status: 'failed', error: { code: 'version_conflict' } }],
  };
  expect(contentJobSchema.parse(detail).items[0]?.error?.code).toBe('version_conflict');
  expect(
    jobDetailSchema.safeParse({
      id,
      collection: 'media',
      action: 'process',
      status: 'succeeded',
      attempts: 1,
      failureCode: null,
      uploadId: id,
      manifest: null,
    }).success,
  ).toBe(true);
  expect(
    batchResultSchema.safeParse({
      jobId: id,
      status: 'queued',
      location: '/v1/collections/articles/jobs/x',
    }).success,
  ).toBe(true);
  expect(
    contentJobSchema.safeParse({ ...detail, items: [{ position: -1, id, status: 'queued' }] })
      .success,
  ).toBe(false);
});

it('does not require private manifests in upload summaries or accept invalid byte declarations', () => {
  const upload = {
    id,
    collection: 'media',
    filename: 'report.pdf',
    declaredMimeType: 'application/pdf',
    declaredBytes: 12,
    createdAt: time,
    purpose: 'create',
    documentId: null,
    revision: null,
    status: 'pending',
    expiresAt: time,
    failureCode: null,
    jobId: null,
  };
  expect(
    uploadPageSchema.safeParse({ rows: [upload], total: 1, page: 1, pageSize: 20 }).success,
  ).toBe(true);
  expect(
    uploadPageSchema.safeParse({
      rows: [{ ...upload, declaredBytes: -12 }],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success,
  ).toBe(false);
});

it('keeps cleanup receipts distinct from ledger deletion state and drops provider fields', () => {
  expect(
    cleanupRetryReceiptSchema.parse({ id, accepted: true, location: '/v1/asset-cleanups/x' }),
  ).toEqual({ id, accepted: true, location: '/v1/asset-cleanups/x' });
  expect(cleanupRetryReceiptSchema.safeParse({ id, accepted: false }).success).toBe(false);
  const page = cleanupPageSchema.parse({
    rows: [
      {
        id,
        state: 'deleting',
        blocked: false,
        attempts: 3,
        failureCode: null,
        retainUntil: time,
        writeDeadline: null,
        nextCleanupAt: time,
        createdAt: time,
        objectKey: 'private/object',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  });
  expect(page.rows[0]).not.toHaveProperty('objectKey');
  expect(
    cleanupPageSchema.safeParse({ ...page, rows: [{ ...page.rows[0], retainUntil: 'yesterday' }] })
      .success,
  ).toBe(false);
});
