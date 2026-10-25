import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { AssetLimits, ImageRecipe, UploadSettings } from './types.ts';

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) fail('invalid_input');
  return result.data;
}

export function validateLimits(limits: AssetLimits): void {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) fail('invalid_input');
  }
  if (limits.leaseMs <= limits.processingTimeoutMs) fail('invalid_input');
}

export function validateRecipe(recipe: ImageRecipe, limits: AssetLimits): void {
  if (recipe.variants.length > limits.maxVariants) fail('invalid_input');
  const names = new Set<string>();
  for (const variant of recipe.variants) {
    if (names.has(variant.name) || variant.name === 'original') fail('invalid_input');
    if (variant.width > limits.maxWidth || variant.height > limits.maxHeight) fail('invalid_input');
    if (variant.width * variant.height > limits.maxPixels) fail('invalid_input');
    names.add(variant.name);
  }
}

export function validateSettings(settings: UploadSettings, limits: AssetLimits): void {
  if (!Number.isSafeInteger(settings.maxBytes) || settings.maxBytes < 1) fail('invalid_input');
  if (settings.maxBytes > limits.maxUploadBytes || settings.mimeTypes.length === 0)
    fail('invalid_input');
  const supported = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ]);
  if (settings.mimeTypes.some((type) => !supported.has(type))) fail('invalid_input');
  validateRecipe(settings.recipe, limits);
}

export function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function detectMime(bytes: Uint8Array): string {
  const head = Buffer.from(bytes.subarray(0, 16));
  if (head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (head[0] === 255 && head[1] === 216 && head[2] === 255) return 'image/jpeg';
  if (head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  if (['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString())) return 'image/gif';
  if (head.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return fail('unsupported_media_type');
}

export function failureCode(error: unknown): string {
  return error instanceof CmsError ? error.code : 'temporarily_unavailable';
}
