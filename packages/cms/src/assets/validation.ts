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
    'audio/mpeg',
    'audio/wav',
    'video/mp4',
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
  const binary = binaryMediaMime(bytes, head);
  if (binary) return binary;
  if (mpegAudio(bytes)) return 'audio/mpeg';
  return fail('unsupported_media_type');
}
function mpegAudio(bytes: Uint8Array): boolean {
  let offset = 0;
  if (Buffer.from(bytes.subarray(0, 3)).toString() === 'ID3') {
    if (bytes.length < 10 || ![3, 4].includes(bytes[3] ?? 0)) return false;
    const size = [...bytes.subarray(6, 10)];
    if (size.some((value) => value > 127)) return false;
    offset = 10 + size.reduce((total, value) => total * 128 + value, 0);
  }
  const a = bytes[offset];
  const b = bytes[offset + 1];
  const c = bytes[offset + 2];
  return (
    a === 255 &&
    b !== undefined &&
    c !== undefined &&
    (b & 224) === 224 &&
    (b & 24) !== 8 &&
    (b & 6) !== 0 &&
    (c & 240) !== 0 &&
    (c & 240) !== 240 &&
    (c & 12) !== 12 &&
    bytes.length >= offset + 4
  );
}

export function failureCode(error: unknown): string {
  return error instanceof CmsError ? error.code : 'temporarily_unavailable';
}

function binaryMediaMime(bytes: Uint8Array, head: Buffer): string | null {
  if (
    head.subarray(0, 4).toString() === 'RIFF' &&
    head.subarray(8, 12).toString() === 'WAVE' &&
    bytes.length >= 44 &&
    head.readUInt32LE(4) + 8 === bytes.length
  )
    return 'audio/wav';
  if (
    bytes.length >= 16 &&
    head.subarray(4, 8).toString() === 'ftyp' &&
    head.readUInt32BE(0) >= 16 &&
    head.readUInt32BE(0) <= bytes.length &&
    ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(head.subarray(8, 12).toString())
  )
    return 'video/mp4';
  return null;
}
