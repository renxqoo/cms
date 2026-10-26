import { fail } from '@new-cms/cms/platform/contracts';
import { objectValue } from '../fields/json-value.ts';
import type { PublicJson, PublicObject, PublicModel } from './contracts.ts';
import type { DocumentData } from '../definition.ts';

export function publicObject(value: unknown): PublicObject {
  if (!objectValue(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicValue(item)]));
}
function publicValue(value: unknown): PublicJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(publicValue);
  if (objectValue(value)) return publicObject(value);
  return fail('temporarily_unavailable');
}
export function pick(data: DocumentData, keys: readonly string[]): PublicObject {
  return publicObject(
    Object.fromEntries(
      keys.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]]),
    ),
  );
}
export function modelCategory(value: unknown): PublicModel['primaryCategory'] {
  if (
    value === 'text' ||
    value === 'image' ||
    value === 'video' ||
    value === 'embedding' ||
    value === 'audio'
  )
    return value;
  return fail('temporarily_unavailable');
}
