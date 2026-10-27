import { valueAtPath } from '../documents/data-path.ts';
import { objectValue, ownValue } from '../fields/json-value.ts';
import type { DocumentData, JsonValue } from '../definition.ts';

export function assignJoinValue(data: DocumentData, path: string, value?: JsonValue) {
  const segments = path.split('.');
  const key = segments.pop();
  if (!key) return;
  let parent: JsonValue = data;
  for (const segment of segments) {
    if (Array.isArray(parent)) {
      const next = valueAtPath({ rows: parent }, `rows.${segment}`);
      if (next === undefined) return;
      parent = next;
    } else if (objectValue(parent)) {
      const next = ownValue(parent, segment);
      if (next === undefined) {
        const group: DocumentData = {};
        parent[segment] = group;
        parent = group;
      } else parent = next;
    } else return;
  }
  if (objectValue(parent)) {
    if (value === undefined) Reflect.deleteProperty(parent, key);
    else parent[key] = value;
  }
}
