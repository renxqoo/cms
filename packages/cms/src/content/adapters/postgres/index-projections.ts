import { bulkStatements } from './revision-data.ts';
import { ownValue } from '../../fields/json-value.ts';
import { identifier } from '@new-cms/database/codegen';
import type { SqlExecutor } from '@new-cms/database/client';
import type { ContentLimits, DocumentData, JsonValue } from '../../definition.ts';
import type { ContentMapping, IndexMapping } from '../../model.ts';
import { objectValue } from '../../fields/json-value.ts';
import { readRevisionDataBatch } from './read-data-batch.ts';
function atPath(
  data: DocumentData,
  field: IndexMapping['fields'][number],
): { value: JsonValue | undefined; barrier: boolean } {
  const chain = [field];
  let { parent } = field;
  while (parent) {
    chain.unshift(parent);
    ({ parent } = parent);
  }
  let value: JsonValue | undefined = data;
  let barrier = false;
  for (const step of chain) {
    value = objectValue(value) ? ownValue(value, String(step.field.name)) : undefined;
    if (step !== field && step.localized && value !== undefined) barrier = true;
  }
  return { value, barrier };
}

function rowValues(
  index: IndexMapping,
  input: { data: DocumentData; mapping: ContentMapping },
): unknown[] {
  const values: unknown[] = [];
  for (const field of index.fields) {
    const { value, barrier } = atPath(input.data, field);
    let stored: unknown = value ?? null;
    if (field.columnType === 'uuid') stored = objectValue(value) ? value['id'] : null;
    if (field.columnType === 'jsonb' && stored !== null) stored = JSON.stringify(stored);
    values.push(stored, value !== undefined, barrier);
    if (field.columnType === 'uuid')
      values.push(
        objectValue(value) && typeof value['collection'] === 'string'
          ? input.mapping.get(value['collection']).definition.id
          : null,
      );
  }
  return values;
}
export async function writeIndexProjections(
  tx: SqlExecutor,
  input: {
    mapping: ContentMapping;
    limits: ContentLimits;
    collection: string;
    documentId: string;
    versionId: string;
    schemaVersion: number;
    dataByLocale?: Readonly<Record<string, DocumentData>>;
  },
): Promise<void> {
  const collection = input.mapping.get(input.collection, input.schemaVersion);
  if (collection.indexes.length === 0) return;
  const items = collection.definition.locales.supported.map((locale) => ({
    documentId: input.documentId,
    versionId: input.versionId,
    locale,
  }));
  const datasets = await projectionDatasets(tx, input, items);
  const statements: { sql: string; values: unknown[] }[] = [];
  for (const index of collection.indexes) {
    const columns = ['revision_id', 'document_id', 'locale'];
    index.fields.forEach((field, position) => {
      columns.push(`k${position}`, `p${position}`, `b${position}`);
      if (field.columnType === 'uuid') columns.push(`c${position}`);
    });
    const values: unknown[] = [];
    const tuples = datasets.map(
      ({ locale, data }) =>
        `(${[
          input.versionId,
          input.documentId,
          locale,
          ...rowValues(index, { data, mapping: input.mapping }),
        ]
          .map((value) => {
            values.push(value);
            return `$${values.length}`;
          })
          .join(',')})`,
    );
    statements.push({
      sql: `INSERT INTO ${identifier(index.table)} (${columns.map(identifier).join(',')}) VALUES ${tuples.join(',')} ON CONFLICT(revision_id,locale) DO NOTHING`,
      values,
    });
  }
  await bulkStatements(tx, statements);
}

async function projectionDatasets(
  tx: SqlExecutor,
  input: Parameters<typeof writeIndexProjections>[1],
  items: Parameters<typeof readRevisionDataBatch>[1]['items'],
) {
  return input.dataByLocale
    ? Object.entries(input.dataByLocale).map(([locale, data]) => ({ locale, data }))
    : await readRevisionDataBatch(tx, { ...input, items });
}
