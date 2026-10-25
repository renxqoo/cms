import type { DocumentData, JsonValue } from '../definition.ts';
export function objectValue(value: unknown): value is DocumentData {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return objectValue(value) && Object.values(value).every(isJsonValue);
}

export function ownValue(value: DocumentData, key: string): JsonValue | undefined {
  return Object.hasOwn(value, key) ? value[key] : undefined;
}
