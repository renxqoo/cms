import { z } from 'zod';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';

const collection = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const id = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const variant = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: z.enum(['cover', 'contain', 'inside']),
  format: z.enum(['jpeg', 'png', 'webp']),
  quality: z.number().int().min(1).max(100),
});
export const imageRecipeSchema = z.strictObject({
  variants: z.array(variant),
  focalPoint: z
    .strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .optional(),
  crop: z
    .strictObject({
      left: z.number().int().min(0),
      top: z.number().int().min(0),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
});

const resourceSchemas = {
  'assets.createUpload': z.strictObject({
    collection,
    purpose: z.enum(['create', 'replace']),
    documentId: id.optional(),
    revision: revision.optional(),
    filename: z
      .string()
      .min(1)
      .max(255)
      .refine((value) =>
        Array.from(value).every((character) => {
          const code = character.charCodeAt(0);
          return code >= 32 && code !== 127 && character !== '/' && character !== '\\';
        }),
      ),
    mimeType: z.string().min(1).max(127),
    bytes: z.number().int().positive(),
  }),
  'assets.writeUpload': z.strictObject({ collection, uploadId: id }),
  'assets.completeUpload': z.strictObject({ collection, uploadId: id }),
  'assets.readUpload': z.strictObject({ collection, uploadId: id }),
  'assets.cancelUpload': z.strictObject({ collection, uploadId: id }),
  'assets.download': z.strictObject({
    collection,
    id,
    versionId: id.optional(),
    variant: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/)
      .optional(),
    mode: z.enum(['editing', 'published']).default('editing'),
  }),
  'assets.downloadBinding': z.strictObject({
    collection,
    id,
    bindingId: id,
    versionId: id.optional(),
    variant: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/)
      .optional(),
    mode: z.enum(['editing', 'published']).default('editing'),
  }),
  'assets.reprocess': z.strictObject({ collection, id, revision, recipe: imageRecipeSchema }),
};

export function assetsInputSchemas(policy: Pick<CmsPolicy, 'defaultPageSize' | 'maxPageSize'>) {
  const page = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1);
  const pageSize = z.number().int().min(1).max(policy.maxPageSize).default(policy.defaultPageSize);
  return {
    ...resourceSchemas,
    'assets.listUploads': z.strictObject({
      collection,
      page,
      pageSize,
      status: z
        .enum([
          'pending',
          'uploading',
          'processing',
          'ready',
          'consumed',
          'failed',
          'cancelled',
          'expired',
        ])
        .optional(),
      purpose: z.enum(['create', 'replace']).optional(),
      documentId: id.optional(),
    }),
    'assets.listCleanup': z.strictObject({
      page,
      pageSize,
      blocked: z.boolean().default(true),
      state: z.enum(['pending', 'ready', 'deleting', 'deleted']).optional(),
    }),
    'assets.getCleanup': z.strictObject({ id }),
    'assets.retryCleanup': z.strictObject({ id }),
  };
}
