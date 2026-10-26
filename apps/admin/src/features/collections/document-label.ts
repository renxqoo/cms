import type { Collection, Document } from '../../contracts/content';
import type { JsonValue } from '../fields/types';
export function pathValue(
  data: Readonly<Record<string, JsonValue>>,
  path: string,
): JsonValue | undefined {
  let value: JsonValue | undefined = data;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = value[key];
  }
  return value;
}
export function documentTitle(document: Document, collection: Collection) {
  for (const field of collection.fields) {
    if (!['text', 'textarea', 'email'].includes(field.type)) continue;
    const value = pathValue(document.data, field.path);
    if (typeof value === 'string' && value) return value;
  }
  return document.file?.filename ?? document.id;
}
export function cellValue(value: JsonValue | undefined) {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? '✓' : '—';
  return JSON.stringify(value);
}
