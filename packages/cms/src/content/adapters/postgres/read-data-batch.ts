import type { ValueRow } from './value-codec.ts';
import { historicalReadContext } from '../../fields/remap-locale.ts';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLimits, DocumentData } from '../../definition.ts';
import type { ContentMapping } from '../../model.ts';
import { revisionProjection, loadValueRows, migrateData, dataSchemaSql } from './revision-data.ts';
import type { DataRevision } from './revision-data.ts';
import { decodeFields } from './value-codec.ts';
export interface RevisionDataRequest {
  documentId: string;
  versionId: string;
  locale: string;
  fallback?: readonly string[];
}
export interface RevisionDataResult {
  documentId: string;
  versionId: string;
  locale: string;
  data: DocumentData;
}
export async function readRevisionDataBatch(
  tx: SqlExecutor,
  input: {
    mapping: ContentMapping;
    limits: ContentLimits;
    collection: string;
    items: readonly RevisionDataRequest[];
  },
): Promise<RevisionDataResult[]> {
  if (input.items.length > input.limits.maxExpandNodes) fail('capacity_exceeded');
  if (input.items.length === 0) return [];
  const found = await tx.query<DataRevision>(
    `SELECT ${revisionProjection},${dataSchemaSql('content_revisions', input.mapping.get(input.collection).definition.schemaVersion)} AS "dataSchemaVersion" FROM content_revisions WHERE id=ANY($1::uuid[]) AND collection_id=$2`,
    [
      [...new Set(input.items.map((item) => item.versionId))],
      input.mapping.get(input.collection).definition.id,
    ],
  );
  const revisions = new Map(found.rows.map((row) => [row.id, row]));
  const versions = new Set(found.rows.map((row) => row.dataSchemaVersion));
  const result: RevisionDataResult[] = [];
  for (const version of versions) {
    const collection = input.mapping.get(input.collection, version);
    const origin = (item: RevisionDataRequest) =>
      historicalReadContext({
        current: input.mapping.get(input.collection).definition,
        schemaVersion: version,
        locale: item.locale,
        fallback: item.fallback,
      });
    const ids = found.rows.filter((row) => row.dataSchemaVersion === version).map((row) => row.id);
    const rows = await loadValueRows(tx, {
      collection,
      versionIds: ids,
      limits: input.limits,
      locales: [
        ...new Set(input.items.flatMap((item) => [origin(item).locale, ...origin(item).fallback])),
      ],
    });
    result.push(...decodeBatch({ input, version, rows, revisions }));
  }
  if (result.length !== input.items.length) fail('not_found');
  return result;
}

function decodeBatch(context: {
  input: Parameters<typeof readRevisionDataBatch>[1];
  version: number;
  rows: ReadonlyMap<string, readonly ValueRow[]>;
  revisions: ReadonlyMap<string, DataRevision>;
}): RevisionDataResult[] {
  const { input, version, rows, revisions } = context;
  const collection = input.mapping.get(input.collection, version);
  const result: RevisionDataResult[] = [];
  const origin = (item: RevisionDataRequest) =>
    historicalReadContext({
      current: input.mapping.get(input.collection).definition,
      schemaVersion: version,
      locale: item.locale,
      fallback: item.fallback,
    });
  for (const item of input.items) {
    const revision = revisions.get(item.versionId);
    if (!revision || revision.documentId !== item.documentId) fail('not_found');
    if (revision.dataSchemaVersion !== version) continue;
    const data = decodeFields({
      fields: collection.fields,
      rows,
      mapping: input.mapping,
      versionId: item.versionId,
      parentPath: 'root',
      ...origin(item),
    });
    result.push({ ...item, data: migrateData({ ...input, schemaVersion: version, data }) });
  }
  return result;
}
