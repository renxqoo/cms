import { extname } from 'node:path';
import { fail } from '@new-cms/cms/platform/contracts';

export function validateRename(original: string, filename: string): void {
  if (
    filename.trim().length === 0 ||
    filename.length > 255 ||
    filename === '.' ||
    filename === '..' ||
    filename === original ||
    Array.from(filename).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159) || character === '/' || character === '\\';
    }) ||
    extname(filename).toLowerCase() !== extname(original).toLowerCase()
  )
    fail('invalid_input');
}

export function downloadFilename(input: {
  filename: string;
  variant?: string;
  mimeType: string;
}): string {
  if (!input.variant || input.variant === 'original') return input.filename;
  const extension = variantExtension(input.mimeType);
  const old = extname(input.filename);
  return `${input.filename.slice(0, input.filename.length - old.length)}-${input.variant}.${extension}`;
}

function variantExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return fail('unsupported_media_type');
}
