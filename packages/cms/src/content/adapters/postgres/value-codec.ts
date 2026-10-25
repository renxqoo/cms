import { ownValue } from '../../fields/json-value.ts';
import type { DocumentData, JsonValue } from '../../definition.ts';
import type { ContentMapping, FieldMapping } from '../../model.ts';
import { objectValue, isJsonValue } from '../../fields/json-value.ts';

export interface ValueRow {
  revision_id: string;
  document_id: string;
  locale: string;
  parent_path: string;
  position: number;
  state: string;
  value: unknown;
  item_id?: string | null;
  block_type?: string | null;
  target_collection_id?: string | null;
}
export interface EncodedRow {
  locale: string;
  parentPath: string;
  position: number;
  state: string;
  value: unknown;
  itemId: string | null;
  blockType: string | null;
  targetCollectionId: string | null;
}
export function childPath(parent: string, field: FieldMapping, item?: string): string {
  return `${parent}/${field.field.id}${item ? `/${item}` : ''}`;
}
function encodedRow(
  mapping: FieldMapping,
  input: {
    locale: string;
    parentPath: string;
    position?: number;
    state: string;
    value?: unknown;
    itemId?: string;
    blockType?: string;
    targetCollectionId?: string;
  },
): EncodedRow {
  return {
    locale: mapping.localized ? input.locale : '_',
    parentPath: input.parentPath,
    position: input.position ?? -1,
    state: input.state,
    value: input.value ?? null,
    itemId: input.itemId ?? null,
    blockType: input.blockType ?? null,
    targetCollectionId: input.targetCollectionId ?? null,
  };
}
function scalarRow(
  mapping: FieldMapping,
  value: JsonValue,
  input: { locale: string; parentPath: string; position?: number; mapping: ContentMapping },
): EncodedRow {
  if (mapping.columnType === 'uuid' && objectValue(value))
    return encodedRow(mapping, {
      ...input,
      state: 'value',
      value: value['id'],
      targetCollectionId: input.mapping.get(
        typeof value['collection'] === 'string' ? value['collection'] : '',
      ).definition.id,
    });
  return encodedRow(mapping, { ...input, state: value === null ? 'null' : 'value', value });
}
function encodeValue(
  mapping: FieldMapping,
  value: JsonValue,
  input: {
    locale: string;
    parentPath: string;
    mapping: ContentMapping;
    output: Map<string, EncodedRow[]>;
  },
): void {
  const { output } = input;
  const rows = output.get(mapping.table) ?? [];
  output.set(mapping.table, rows);
  if (value === null) {
    rows.push(encodedRow(mapping, { ...input, state: 'null' }));
    return;
  }
  if (mapping.structural) {
    rows.push(encodedRow(mapping, { ...input, state: 'container' }));
    if (mapping.field.type === 'group' && objectValue(value))
      encodeFields(mapping.children, value, {
        ...input,
        parentPath: childPath(input.parentPath, mapping),
      });
    else if (Array.isArray(value))
      value.forEach((item, position) => {
        if (!objectValue(item)) return;
        const itemId = typeof item['id'] === 'string' ? item['id'] : '';
        const blockType = typeof item['blockType'] === 'string' ? item['blockType'] : undefined;
        rows.push(
          encodedRow(mapping, {
            ...input,
            position,
            state: 'item',
            itemId,
            ...(blockType ? { blockType } : {}),
          }),
        );
        encodeFields(
          mapping.children.filter((child) => !child.blockKey || child.blockKey === blockType),
          item,
          { ...input, parentPath: childPath(input.parentPath, mapping, itemId) },
        );
      });
  } else if (mapping.field.hasMany && Array.isArray(value)) {
    rows.push(encodedRow(mapping, { ...input, state: 'array' }));
    value.forEach((item, position) => rows.push(scalarRow(mapping, item, { ...input, position })));
  } else rows.push(scalarRow(mapping, value, input));
}
export function encodeFields(
  fields: readonly FieldMapping[],
  data: DocumentData,
  input: {
    locale: string;
    parentPath: string;
    mapping: ContentMapping;
    output: Map<string, EncodedRow[]>;
  },
): void {
  for (const mapping of fields) {
    const value = ownValue(data, String(mapping.field.name));
    if (value !== undefined) encodeValue(mapping, value, input);
  }
}
function scalarData(row: ValueRow, field: FieldMapping, mapping: ContentMapping): JsonValue {
  if (row.state === 'null') return null;
  if (field.columnType === 'uuid')
    return {
      id: String(row.value),
      collection:
        mapping.collections.findLast(
          (collection) => collection.definition.id === row.target_collection_id,
        )?.definition.key ?? '',
    };
  if (field.columnType === 'timestamptz')
    return (row.value instanceof Date ? row.value : new Date(String(row.value))).toISOString();
  if (!isJsonValue(row.value)) throw new Error('Invalid persisted field value');
  return row.value;
}
function chosenRows(
  rows: readonly ValueRow[],
  input: {
    field: FieldMapping;
    versionId: string;
    parentPath: string;
    locale: string;
    fallback: readonly string[];
  },
): ValueRow[] {
  const matches = rows.filter(
    (row) => row.revision_id === input.versionId && row.parent_path === input.parentPath,
  );
  const locales = input.field.localized ? [input.locale, ...input.fallback] : ['_'];
  for (const locale of locales) {
    const selected = matches.filter((row) => row.locale === locale);
    if (selected.length > 0) return selected.toSorted((a, b) => a.position - b.position);
  }
  return [];
}
interface DecodeInput {
  fields: readonly FieldMapping[];
  rows: ReadonlyMap<string, readonly ValueRow[]>;
  mapping: ContentMapping;
  versionId: string;
  parentPath: string;
  locale: string;
  fallback: readonly string[];
}
function decodeValue(field: FieldMapping, rows: ValueRow[], input: DecodeInput): JsonValue {
  const marker = rows.find((row) => row.position === -1);
  if (marker?.state === 'null') return null;
  if (field.field.type === 'group')
    return decodeFields({
      ...input,
      fields: field.children,
      parentPath: childPath(input.parentPath, field),
    });
  if (field.structural)
    return rows
      .filter((row) => row.state === 'item')
      .map((row) => ({
        id: String(row.item_id),
        ...(row.block_type ? { blockType: row.block_type } : {}),
        ...decodeFields({
          ...input,
          fields: field.children.filter(
            (child) => !child.blockKey || child.blockKey === row.block_type,
          ),
          parentPath: childPath(input.parentPath, field, String(row.item_id)),
          locale: row.locale === '_' ? input.locale : row.locale,
          fallback: field.localized ? [] : input.fallback,
        }),
      }));
  if (field.field.hasMany)
    return rows
      .filter((row) => row.position >= 0)
      .map((row) => scalarData(row, field, input.mapping));
  const [value] = rows;
  return value ? scalarData(value, field, input.mapping) : null;
}
export function decodeFields(input: DecodeInput): DocumentData {
  const result: DocumentData = {};
  for (const field of input.fields) {
    const rows = chosenRows(input.rows.get(field.table) ?? [], {
      field,
      versionId: input.versionId,
      parentPath: input.parentPath,
      locale: input.locale,
      fallback: input.fallback,
    });
    if (rows.length === 0) continue;
    const selectedLocale = rows[0]?.locale;
    const next =
      field.localized && selectedLocale && selectedLocale !== '_'
        ? { ...input, locale: selectedLocale, fallback: [] }
        : input;
    result[String(field.field.name)] = decodeValue(field, rows, next);
  }
  return result;
}
