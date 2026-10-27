import { valueAtPath } from '../documents/data-path.ts';
import { objectValue } from './json-value.ts';
import type { DocumentData, JsonValue } from '../definition.ts';

export function candidateSibling(
  data: DocumentData,
  path: string,
  options: { self?: boolean } = {},
): {
  value: JsonValue | undefined;
  siblingData: DocumentData;
  blockData: DocumentData | undefined;
} {
  const segments = path.split('.');
  if (!options.self) segments.pop();
  const parent = segments.length === 0 ? data : valueAtPath(data, segments.join('.'));
  let blockData: DocumentData | undefined;
  for (let { length } = segments; length > 0; length -= 1) {
    const value = valueAtPath(data, segments.slice(0, length).join('.'));
    if (objectValue(value) && typeof value['blockType'] === 'string') {
      blockData = value;
      break;
    }
  }
  return {
    value: valueAtPath(data, path),
    siblingData: objectValue(parent) ? parent : {},
    blockData,
  };
}
