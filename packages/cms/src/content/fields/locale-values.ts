import { fail } from '@new-cms/cms/platform/contracts';
import { objectValue } from './json-value.ts';
import type {
  JsonValue,
  DocumentData,
  CollectionDefinition,
  ContentLimits,
} from '../definition.ts';
import { assertJsonBudget } from './data-budget.ts';
export function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (objectValue(value))
    return `{${Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function consistent<T extends JsonValue>(values: readonly T[]): T | undefined {
  const [first] = values;
  if (first !== undefined && values.some((value) => canonical(value) !== canonical(first)))
    fail('invalid_input');
  return first;
}
export function candidates(
  frames: readonly {
    explicit: boolean;
    patch?: JsonValue | undefined;
    current?: JsonValue | undefined;
  }[],
): { values: JsonValue[]; explicit: boolean } {
  const supplied = frames.filter((frame) => frame.explicit);
  const source =
    supplied.length > 0
      ? supplied.map((frame) => frame.patch)
      : frames.map((frame) => frame.current);
  return {
    values: source.filter((value): value is JsonValue => value !== undefined),
    explicit: supplied.length > 0,
  };
}

export function assertMap(
  value: unknown,
  input: { collection: CollectionDefinition; limits: ContentLimits },
): asserts value is Readonly<Record<string, DocumentData>> {
  if (!objectValue(value)) fail('invalid_input');
  assertJsonBudget(value, {
    maxDepth: input.limits.maxFieldDepth * 2 + input.limits.maxRichTextDepth * 2 + 2,
    maxBytes: input.limits.maxStorageBytes,
    maxNodes: input.limits.maxStorageBytes,
  });
  for (const [locale, data] of Object.entries(value))
    if (!input.collection.locales.supported.includes(locale) || !objectValue(data))
      fail('invalid_input');
}
