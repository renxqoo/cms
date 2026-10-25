import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentMapping } from '../../model.ts';
import { dataFingerprint } from '../../collections/data-fingerprint.ts';
export function currentCollections(mapping: ContentMapping) {
  const collections = new Map(
    mapping.collections.map((collection) => [collection.definition.id, collection]),
  );
  return [...collections.values()];
}
export async function verifySchemaState(tx: SqlExecutor, mapping: ContentMapping): Promise<void> {
  const expected = mapping.collections.map(({ definition }) => ({
    collection_id: definition.id,
    schema_version: definition.schemaVersion,
    data_fingerprint: dataFingerprint(definition),
  }));
  const result = await tx.query<{ valid: boolean }>(
    `SELECT NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($1::jsonb) x(collection_id text,schema_version integer,data_fingerprint text) LEFT JOIN content_schema_versions v USING(collection_id,schema_version) WHERE v.data_fingerprint IS DISTINCT FROM x.data_fingerprint) AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($2::jsonb) x(collection_id text,schema_version integer) LEFT JOIN content_schema_control c USING(collection_id) WHERE c.schema_version IS DISTINCT FROM x.schema_version) AS valid`,
    [
      JSON.stringify(expected),
      JSON.stringify(
        currentCollections(mapping).map(({ definition }) => ({
          collection_id: definition.id,
          schema_version: definition.schemaVersion,
        })),
      ),
    ],
  );
  if (result.rows[0]?.valid !== true) fail('temporarily_unavailable');
}
export async function requireWritableSchema(
  tx: SqlExecutor,
  input: { mapping: ContentMapping; collection: string },
): Promise<void> {
  const { definition } = input.mapping.get(input.collection);
  const result = await tx.query<{ schema_version: number; data_fingerprint: string }>(
    `SELECT c.schema_version,v.data_fingerprint FROM content_schema_control c JOIN content_schema_versions v USING(collection_id,schema_version) WHERE c.collection_id=$1 FOR SHARE OF c`,
    [definition.id],
  );
  const [row] = result.rows;
  if (
    !row ||
    row.schema_version !== definition.schemaVersion ||
    row.data_fingerprint !== dataFingerprint(definition)
  )
    fail('temporarily_unavailable');
}
export async function lockPreparedSchema(
  tx: SqlExecutor,
  input: { mapping: ContentMapping; collection: string; to: number; exclusive?: boolean },
): Promise<void> {
  const { definition } = input.mapping.get(input.collection);
  if (definition.schemaVersion !== input.to) fail('invalid_input');
  const result = await tx.query<{
    schema_version: number;
    prepared_schema_version: number | null;
    prepared_fingerprint: string | null;
  }>(
    `SELECT schema_version,prepared_schema_version,prepared_fingerprint FROM content_schema_control WHERE collection_id=$1 FOR ${input.exclusive ? 'UPDATE' : 'SHARE'}`,
    [definition.id],
  );
  const [row] = result.rows;
  if (
    row?.prepared_schema_version !== null &&
    row?.prepared_schema_version !== undefined &&
    (row.prepared_schema_version !== input.to ||
      row.prepared_fingerprint !== input.mapping.fingerprint)
  )
    fail('temporarily_unavailable');
  if (
    !row ||
    (row.schema_version !== input.to &&
      (row.prepared_schema_version !== input.to ||
        row.prepared_fingerprint !== input.mapping.fingerprint))
  )
    fail('temporarily_unavailable');
  const stamp = await tx.query(
    'SELECT 1 FROM content_schema_versions WHERE collection_id=$1 AND schema_version=$2 AND data_fingerprint=$3',
    [definition.id, input.to, dataFingerprint(definition)],
  );
  if (stamp.rowCount !== 1) fail('temporarily_unavailable');
  await verifyDefinitionStamps(tx, input.mapping);
}

interface ControlRow {
  collection_id: string;
  schema_version: number;
  prepared_schema_version: number | null;
  prepared_fingerprint: string | null;
}
function assertPrepared(row: ControlRow, to: number, fingerprint: string): void {
  if (
    row.prepared_schema_version !== null &&
    (row.prepared_schema_version !== to || row.prepared_fingerprint !== fingerprint)
  )
    fail('temporarily_unavailable');
  if (row.schema_version !== to && row.prepared_schema_version !== to)
    fail('temporarily_unavailable');
}
export async function verifyDefinitionStamps(
  tx: SqlExecutor,
  mapping: ContentMapping,
): Promise<void> {
  const expected = mapping.collections.map(({ definition }) => ({
    collection_id: definition.id,
    schema_version: definition.schemaVersion,
    data_fingerprint: dataFingerprint(definition),
  }));
  const result = await tx.query<{ valid: boolean }>(
    `SELECT NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($1::jsonb) x(collection_id text,schema_version integer,data_fingerprint text) LEFT JOIN content_schema_versions v USING(collection_id,schema_version) WHERE v.data_fingerprint IS DISTINCT FROM x.data_fingerprint) AS valid`,
    [JSON.stringify(expected)],
  );
  if (result.rows[0]?.valid !== true) fail('temporarily_unavailable');
}
export async function lockPreparedSchemas(tx: SqlExecutor, mapping: ContentMapping): Promise<void> {
  const expected = currentCollections(mapping).map(({ definition }) => ({
    collection_id: definition.id,
    schema_version: definition.schemaVersion,
  }));
  const result = await tx.query<ControlRow>(
    `SELECT c.* FROM content_schema_control c JOIN jsonb_to_recordset($1::jsonb) x(collection_id text,schema_version integer) USING(collection_id) ORDER BY c.collection_id FOR UPDATE OF c`,
    [JSON.stringify(expected)],
  );
  if (result.rows.length !== expected.length) fail('temporarily_unavailable');
  for (const row of result.rows) {
    const target = expected.find((item) => item.collection_id === row.collection_id);
    if (!target) fail('temporarily_unavailable');
    assertPrepared(row, target.schema_version, mapping.fingerprint);
  }
  await verifyDefinitionStamps(tx, mapping);
}
