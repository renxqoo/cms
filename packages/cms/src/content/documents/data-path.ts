import type { DocumentData, JsonValue } from '../definition.ts';

function child(value: JsonValue | undefined, segment: string): JsonValue | undefined {
  if (Array.isArray(value))
    return (
      value.find(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          item['id'] === segment,
      ) ?? value[Number(segment)]
    );
  return value !== null && typeof value === 'object' ? value[segment] : undefined;
}

export function valueAtPath(data: DocumentData, path: string): JsonValue | undefined {
  return path
    .split('.')
    .reduce<JsonValue | undefined>((value, segment) => child(value, segment), data);
}

export function replaceAtPath(data: DocumentData, path: string, next: JsonValue): void {
  const segments = path.split('.');
  const last = segments.pop();
  if (!last) return;
  let parent: JsonValue | undefined = data;
  for (const segment of segments) parent = child(parent, segment);
  if (Array.isArray(parent)) {
    const index = parent.findIndex(
      (item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item) && item['id'] === last,
    );
    const position = index >= 0 ? index : Number(last);
    if (Number.isInteger(position) && position >= 0 && position < parent.length)
      parent[position] = next;
  } else if (parent !== null && typeof parent === 'object') parent[last] = next;
}
