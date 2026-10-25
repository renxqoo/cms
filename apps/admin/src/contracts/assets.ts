import { z } from 'zod';

export const imageVariantSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: z.enum(['cover', 'contain', 'inside']),
  format: z.enum(['jpeg', 'png', 'webp']),
  quality: z.number().int().min(1).max(100),
});

export const imageRecipeSchema = z.strictObject({
  variants: z.array(imageVariantSchema),
  focalPoint: z
    .strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .optional(),
  crop: z
    .strictObject({
      left: z.number().int().nonnegative(),
      top: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
});

export type ImageRecipe = z.infer<typeof imageRecipeSchema>;
export type ImageVariant = z.infer<typeof imageVariantSchema>;
