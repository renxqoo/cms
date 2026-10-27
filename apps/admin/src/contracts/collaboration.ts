import { z } from 'zod';

export const editorLeaseSchema = z.strictObject({
  enabled: z.boolean(),
  owned: z.boolean(),
  durationMs: z.number().int().positive().nullable(),
  heartbeatMs: z.number().int().positive().nullable(),
  lease: z
    .strictObject({
      actorId: z.uuid(),
      displayName: z.string().nullable(),
      generation: z.number().int().positive(),
      expiresAt: z.iso.datetime(),
    })
    .nullable(),
});

export const documentPreviewSchema = z
  .strictObject({
    url: z.url(),
    origin: z.url(),
    live: z.boolean(),
    devices: z
      .array(
        z.strictObject({
          name: z.string(),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
        }),
      )
      .min(1),
  })
  .refine((value) => {
    const url = new URL(value.url);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.origin === value.origin
    );
  });

export type EditorLease = z.infer<typeof editorLeaseSchema>;
export type DocumentPreview = z.infer<typeof documentPreviewSchema>;
