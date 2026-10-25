import { array, id, integer, nullable, object, reference, text } from './schema.ts';
import type { Schema } from './schema.ts';

function recipeSchema(): Schema {
  const variant = object({
    name: text,
    width: integer,
    height: integer,
    fit: { enum: ['cover', 'contain', 'inside'] },
    format: { enum: ['jpeg', 'png', 'webp'] },
    quality: integer,
  });
  return object(
    { variants: array(variant) },
    {
      focalPoint: object({ x: { type: 'number' }, y: { type: 'number' } }),
      crop: object({ left: integer, top: integer, width: integer, height: integer }),
    },
  );
}
function manifestSchema(): Schema {
  return object({
    id,
    filename: text,
    mimeType: text,
    bytes: integer,
    digest: text,
    width: nullable(integer),
    height: nullable(integer),
    orientation: nullable(integer),
    processorVersion: text,
    recipe: recipeSchema(),
    objects: array(
      object({
        name: text,
        bytes: integer,
        digest: text,
        mimeType: text,
        width: nullable(integer),
        height: nullable(integer),
      }),
    ),
  });
}
function uploadSchema(): Schema {
  return object({
    id,
    collection: text,
    purpose: { enum: ['create', 'replace'] },
    filename: text,
    declaredMimeType: text,
    declaredBytes: integer,
    createdAt: { type: 'string', format: 'date-time' },
    documentId: nullable(id),
    revision: nullable(integer),
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
    expiresAt: { type: 'string', format: 'date-time' },
    failureCode: nullable(text),
    manifest: nullable(reference('AssetManifest')),
    jobId: nullable(id),
  });
}
function jobSchema(): Schema {
  return object({
    id,
    collection: text,
    action: { enum: ['process', 'reprocess'] },
    status: { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] },
    attempts: integer,
    failureCode: nullable(text),
    uploadId: nullable(id),
    manifest: nullable(reference('AssetManifest')),
  });
}
export function assetResponseSchemas(): Record<string, Schema> {
  return {
    AssetManifest: manifestSchema(),
    AssetUpload: uploadSchema(),
    AssetJob: jobSchema(),
    AssetProcessingAccepted: object({ jobId: id, uploadId: id }),
    AssetUploadWritten: object({ uploadId: id, bytes: integer, digest: text }),
  };
}
