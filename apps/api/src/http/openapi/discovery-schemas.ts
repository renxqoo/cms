import { id, integer, nullable, object, page, reference, text, time } from './schema.ts';
import type { Schema } from './schema.ts';

function contentJobSummary(): Schema {
  return object(
    {
      kind: { const: 'content' },
      id,
      collection: text,
      action: { enum: ['batch', 'publication', 'extension'] },
      status: { enum: ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'] },
      executeAt: time,
      createdAt: time,
      finishedAt: nullable(time),
      documentId: nullable(id),
      expectedRevision: nullable(integer),
      requestedVersionId: nullable(id),
      total: integer,
      succeeded: integer,
      failed: integer,
    },
    {
      publicationAction: { enum: ['publish', 'unpublish'] },
      locale: text,
    },
  );
}

function assetJobSummary(): Schema {
  return object({
    kind: { const: 'asset' },
    id,
    collection: text,
    action: { enum: ['process', 'reprocess'] },
    status: { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] },
    attempts: integer,
    failureCode: nullable(text),
    uploadId: id,
    documentId: nullable(id),
    createdAt: time,
    finishedAt: nullable(time),
  });
}

function uploadSummary(): Schema {
  return object({
    locale: nullable(text),
    id,
    collection: text,
    purpose: { enum: ['create', 'replace'] },
    documentId: nullable(id),
    revision: nullable(integer),
    filename: text,
    declaredMimeType: text,
    declaredBytes: integer,
    createdAt: time,
    status: {
      enum: [
        'pending',
        'uploading',
        'processing',
        'ready',
        'consumed',
        'failed',
        'cancelled',
        'expired',
      ],
    },
    expiresAt: time,
    failureCode: nullable(text),
    jobId: nullable(id),
  });
}

export function discoveryResponseSchemas(): Record<string, Schema> {
  return {
    ContentJobSummary: contentJobSummary(),
    AssetJobSummary: assetJobSummary(),
    DiscoveredJob: { anyOf: [reference('ContentJobSummary'), reference('AssetJobSummary')] },
    DiscoveredJobPage: page('DiscoveredJob'),
    UploadSummary: uploadSummary(),
    UploadSummaryPage: page('UploadSummary'),
  };
}
