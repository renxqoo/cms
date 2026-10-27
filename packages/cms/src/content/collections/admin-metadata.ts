import { invalidMetadataURL } from './admin-metadata-urls.ts';
import { z } from 'zod';
import { objectValue } from '../fields/json-value.ts';
import { resolveLabel } from './labels.ts';
import type { DocumentData, JsonValue } from '../definition.ts';
import type { AdminMetadataDefinition } from './admin-types.ts';
const keys = new Set([
  'metadataBase',
  'title',
  'description',
  'applicationName',
  'authors',
  'generator',
  'keywords',
  'referrer',
  'themeColor',
  'colorScheme',
  'viewport',
  'creator',
  'publisher',
  'robots',
  'alternates',
  'icons',
  'manifest',
  'openGraph',
  'twitter',
  'facebook',
  'pinterest',
  'verification',
  'appleWebApp',
  'formatDetection',
  'itunes',
  'abstract',
  'appLinks',
  'archives',
  'assets',
  'bookmarks',
  'pagination',
  'category',
  'classification',
  'other',
  'titleSuffix',
  'defaultOGImageType',
]);
const fields = Object.fromEntries([...keys].map((key) => [key, z.json().optional()]));
export const adminMetadataSchema = z.strictObject(fields).superRefine((value, context) => {
  for (const key of Object.keys(value))
    if (!keys.has(key))
      context.addIssue({ code: 'custom', message: 'Invalid metadata option', path: [key] });
  const invalid = invalidMetadataURL(value);
  if (invalid) context.addIssue({ code: 'custom', message: 'Invalid metadata URL', path: invalid });
  const mode = value['defaultOGImageType'];
  if (
    mode !== undefined &&
    (typeof mode !== 'string' || !['dynamic', 'static', 'off'].includes(mode))
  )
    context.addIssue({
      code: 'custom',
      message: 'Invalid image mode',
      path: ['defaultOGImageType'],
    });
});
function stringMap(value: JsonValue): value is Record<string, string> {
  return objectValue(value) && Object.values(value).every((entry) => typeof entry === 'string');
}
export function resolveAdminMetadata(
  metadata: AdminMetadataDefinition | undefined,
  input: { locale: string; fallbackLocale: string },
): DocumentData | undefined {
  if (!metadata) return undefined;
  const result: DocumentData = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    result[key] = structuredClone(value);
    if (
      ['title', 'description', 'titleSuffix'].includes(key) &&
      stringMap(value) &&
      !['default', 'template', 'absolute'].some((entry) => Object.hasOwn(value, entry))
    )
      result[key] = resolveLabel(
        value,
        input.locale,
        resolveLabel(value, input.fallbackLocale, ''),
      );
  }
  return result;
}
