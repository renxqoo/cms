import type { JsonValue } from '../definition.ts';
import { objectValue, ownValue } from '../fields/json-value.ts';

export function virtualPath(data: JsonValue, path: readonly string[]): JsonValue | undefined {
  if (path.length === 0) return structuredClone(data);
  if (Array.isArray(data))
    return data.flatMap((item) => {
      const value = virtualPath(item, path);
      return value === undefined ? [] : [value];
    });
  if (!objectValue(data)) return undefined;
  const [segment, ...rest] = path;
  if (!segment) return undefined;
  let value = ownValue(data, segment);
  if (
    value === undefined &&
    typeof data['id'] === 'string' &&
    typeof data['collection'] === 'string' &&
    objectValue(data['data'])
  )
    value = ownValue(data['data'], segment);
  return value === undefined ? undefined : virtualPath(value, rest);
}
