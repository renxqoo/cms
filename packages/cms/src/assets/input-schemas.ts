import { z } from 'zod';

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

export const assetsInputSchemas = {
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
