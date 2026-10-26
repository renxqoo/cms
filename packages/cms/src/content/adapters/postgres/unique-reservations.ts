import { readRevisionDataBatch } from './read-data-batch.ts';
import { bulkStatements } from './revision-data.ts';
import { ownValue } from '../../fields/json-value.ts';
import { identifier } from '@new-cms/database/codegen';
import type { SqlExecutor } from '@new-cms/database/client';
import type { ContentLimits, DocumentData, JsonValue } from '../../definition.ts';
import type { ContentMapping, FieldMapping } from '../../model.ts';
import { reservationDefinitions, reservationTableName } from './compile-schema.ts';
import { readDocument } from './document-store.ts';
import { objectValue } from '../../fields/json-value.ts';

function valuesAt(data: JsonValue, path: readonly string[]): JsonValue[] {
  if (path.length === 0) return [data];
  if (Array.isArray(data)) return data.flatMap((item) => valuesAt(item, path));
  if (!objectValue(data)) return [];
  const [key, ...rest] = path;
  const value = key ? ownValue(data, key) : undefined;
  return value === undefined ? [] : valuesAt(value, rest);
}
function normalized(value: JsonValue, field: FieldMapping): unknown {
  if (field.columnType === 'uuid' && objectValue(value)) return value['id'];
  if (field.columnType === 'jsonb') return JSON.stringify(value);
  return value;
}
function reserve(input: {
  table: string;
  documentId: string;
  entries: readonly { locale: string; values: unknown[] }[];
}): { sql: string; values: unknown[] } | null {
  const unique = new Map(input.entries.map((entry) => [JSON.stringify(entry), entry]));
  if (unique.size === 0) return null;
  const [first] = input.entries;
  if (!first) return null;
  const columns = ['document_id', 'locale', ...first.values.map((_value, index) => `k${index}`)];
  const values: unknown[] = [];
  const tuples = [...unique.values()].map(
    (entry) =>
      `(${[input.documentId, entry.locale, ...entry.values]
        .map((item) => {
          values.push(item);
          return `$${values.length}`;
        })
        .join(',')})`,
  );
  return {
    sql: `INSERT INTO ${identifier(input.table)} (${columns.map(identifier).join(',')}) VALUES ${tuples.join(',')}`,
    values,
  };
}
export async function syncActiveUnique(
  tx: SqlExecutor,
  input: {
    collection: string;
    id: string;
    mapping: ContentMapping;
    limits: ContentLimits;
    preserveLegacy?: boolean;
  },
): Promise<void> {
  const collection = input.mapping.get(input.collection);
  const document = await readDocument(tx, input);
  await clearReservations(tx, input);
  const items = [
    ...new Map(
      [
        ...collection.definition.locales.supported.map((locale) => ({
          documentId: input.id,
          versionId: document.currentVersionId,
          locale,
          fallback: [],
        })),
        ...Object.entries(document.publications ?? {}).flatMap(([key, versionId]) =>
          (key === '*' ? collection.definition.locales.supported : [key]).map((locale) => ({
            documentId: input.id,
            versionId,
            locale,
            fallback: [],
          })),
        ),
      ].map((item) => [`${item.versionId}:${item.locale}`, item]),
    ).values(),
  ];
  const datasets = await readRevisionDataBatch(tx, { ...input, items });
  const statements = reservationDefinitions(collection)
    .map((reservation) =>
      reserve({
        table: reservationTableName(collection, reservation),
        documentId: input.id,
        entries: reservationEntries(
          datasets,
          reservation.fields,
          reservation.fields.some((field) => field.localized),
        ),
      }),
    )
    .filter((statement) => statement !== null);
  await bulkStatements(tx, statements);
}

function reservationEntries(
  datasets: readonly { locale: string; data: DocumentData }[],
  fields: readonly FieldMapping[],
  localized: boolean,
) {
  return datasets.flatMap(({ locale, data }) => {
    const values = fields.map((field) =>
      valuesAt(data, field.path.split('.'))
        .flatMap((value) => (field.field.hasMany && Array.isArray(value) ? value : [value]))
        .filter((value) => value !== null)
        .map((value) => normalized(value, field)),
    );
    if (values.some((items) => items.length === 0)) return [];
    if (values.length === 1)
      return (values[0] ?? []).map((value) => ({
        locale: localized ? locale : '_',
        values: [value],
      }));
    return [{ locale: localized ? locale : '_', values: values.map((items) => items[0]) }];
  });
}

async function clearReservations(
  tx: SqlExecutor,
  input: { mapping: ContentMapping; collection: string; id: string; preserveLegacy?: boolean },
): Promise<void> {
  const collection = input.mapping.get(input.collection);
  const tables = new Set(
    input.mapping.collections
      .filter(
        (item) =>
          item.definition.id === collection.definition.id &&
          (!input.preserveLegacy ||
            item.definition.schemaVersion === collection.definition.schemaVersion),
      )
      .flatMap((schema) =>
        reservationDefinitions(schema).map((reservation) =>
          reservationTableName(collection, reservation),
        ),
      ),
  );
  if (tables.size > 0) {
    const deletions = [...tables].map(
      (table, index) =>
        `d${index} AS (DELETE FROM ${identifier(table)} WHERE document_id=$1 RETURNING 1)`,
    );
    await tx.query(`WITH ${deletions.join(',')} SELECT 1`, [input.id]);
  }
}
