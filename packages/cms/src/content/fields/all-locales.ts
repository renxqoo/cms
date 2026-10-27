import { dataFields, fieldPaths } from './structure.ts';
import { objectValue, ownValue } from './json-value.ts';
import type { ContentRegistry, DocumentData, FieldDefinition, JsonValue } from '../definition.ts';

type Locales = Readonly<Record<string, DocumentData>>;
function nested(values: Locales, name: string): Locales {
  return Object.fromEntries(
    Object.entries(values).flatMap(([locale, data]) => {
      const value = ownValue(data, name);
      return objectValue(value) ? [[locale, value]] : [];
    }),
  );
}
function expandedArray(
  value: JsonValue[],
  localized: Readonly<Record<string, JsonValue | undefined>>,
  registry: ContentRegistry,
): JsonValue[] {
  return value.map((item) =>
    expanded(
      item,
      Object.fromEntries(
        Object.entries(localized).map(([locale, candidate]) => [
          locale,
          Array.isArray(candidate) && objectValue(item)
            ? candidate.find(
                (row) =>
                  objectValue(row) &&
                  row['id'] === item['id'] &&
                  row['collection'] === item['collection'],
              )
            : undefined,
        ]),
      ),
      registry,
    ),
  );
}

function expanded(
  value: JsonValue,
  localized: Readonly<Record<string, JsonValue | undefined>>,
  registry: ContentRegistry,
): JsonValue {
  if (Array.isArray(value)) return expandedArray(value, localized, registry);
  if (objectValue(value) && Array.isArray(value['rows'])) {
    return {
      ...value,
      rows: expanded(
        value['rows'],
        Object.fromEntries(
          Object.entries(localized).map(([locale, candidate]) => [
            locale,
            objectValue(candidate) ? candidate['rows'] : undefined,
          ]),
        ),
        registry,
      ),
    };
  }
  if (!objectValue(value) || typeof value['collection'] !== 'string' || !objectValue(value['data']))
    return value;
  const collection = registry.get(value['collection']);
  const entries = Object.fromEntries(
    Object.entries(localized).flatMap(([locale, candidate]) =>
      objectValue(candidate) &&
      candidate['id'] === value['id'] &&
      candidate['collection'] === value['collection'] &&
      objectValue(candidate['data'])
        ? [[locale, candidate['data']]]
        : [],
    ),
  );
  return {
    ...value,
    data: allLocaleData({
      fields: collection.fields,
      base: value['data'],
      values: entries,
      registry,
    }),
  };
}
function rows(
  field: FieldDefinition,
  base: JsonValue[],
  input: { values: Readonly<Record<string, JsonValue | undefined>>; registry: ContentRegistry },
): JsonValue[] {
  const { values, registry } = input;
  return base.map((row) => {
    if (!objectValue(row)) return row;
    const fields =
      field.type === 'blocks'
        ? (field.blocks?.find((block) => block.key === row['blockType'])?.fields ?? [])
        : (field.fields ?? []);
    const locales = Object.fromEntries(
      Object.entries(values).flatMap(([locale, candidate]) => {
        const match = Array.isArray(candidate)
          ? candidate.find(
              (entry) =>
                objectValue(entry) &&
                entry['id'] === row['id'] &&
                entry['blockType'] === row['blockType'],
            )
          : undefined;
        return objectValue(match) ? [[locale, match]] : [];
      }),
    );
    return {
      ...(row['id'] === undefined ? {} : { id: row['id'] }),
      ...(row['blockType'] === undefined ? {} : { blockType: row['blockType'] }),
      ...allLocaleData({ fields, base: row, values: locales, registry }),
    };
  });
}

function localizedJoin(field: FieldDefinition, registry: ContentRegistry): boolean {
  if (!field.join) return false;
  const targets =
    typeof field.join.collection === 'string' ? [field.join.collection] : field.join.collection;
  return targets.some((key) =>
    fieldPaths(registry.get(key).fields).some(
      (entry) =>
        entry.field.localized &&
        (entry.path === field.join?.field || field.join?.field.startsWith(`${entry.path}.`)),
    ),
  );
}

export function allLocaleData(input: {
  fields: readonly FieldDefinition[];
  base: DocumentData;
  values: Locales;
  registry: ContentRegistry;
}): DocumentData {
  const result: DocumentData = {};
  for (const field of dataFields(input.fields)) {
    const name = String(field.name);
    const base = ownValue(input.base, name);
    if (field.localized || localizedJoin(field, input.registry)) {
      const entries = Object.entries(input.values).flatMap<[string, JsonValue]>(
        ([locale, data]) => {
          const value = ownValue(data, name);
          return value === undefined ? [] : [[locale, value]];
        },
      );
      if (entries.length > 0) result[name] = Object.fromEntries(entries);
      continue;
    }
    if (base === undefined) continue;
    const values = Object.fromEntries(
      Object.entries(input.values).map(([locale, data]) => [locale, ownValue(data, name)]),
    );
    if (field.type === 'group' && objectValue(base))
      result[name] = allLocaleData({
        ...input,
        fields: field.fields ?? [],
        base,
        values: nested(input.values, name),
      });
    else if (['array', 'blocks'].includes(field.type) && Array.isArray(base))
      result[name] = rows(field, base, { values, registry: input.registry });
    else if (['relationship', 'upload', 'join'].includes(field.type))
      result[name] = expanded(base, values, input.registry);
    else result[name] = base;
  }
  return result;
}
