import type { SqlExecutor } from '@new-cms/database/client';
import type { AssetDiscoverySources } from '@new-cms/cms/assets/composition';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../../types.ts';
import type { DiscoveryPage, UploadSummary } from '../../jobs/contracts.ts';
import { createDiscoveryPolicy } from '../../jobs/discovery-policy.ts';
import { assetEligibility } from '../../jobs/asset-discovery-policy.ts';
import { discoveryOffset, discoverySql } from './discovery-sql.ts';

export interface UploadDiscoveryQuery {
  page: number;
  pageSize: number;
  status?: UploadSummary['status'] | undefined;
  purpose?: UploadSummary['purpose'] | undefined;
  documentId?: string | undefined;
}

async function statement(
  input: { state: ContentState; runtime: ContentRuntime; sources: AssetDiscoverySources },
  query: UploadDiscoveryQuery,
) {
  const offsetValue = discoveryOffset(query);
  const { state, runtime, sources } = input;
  const policy = createDiscoveryPolicy(state, runtime);
  await policy.require('assets.readUpload');
  if ((await policy.policy('assets.readUpload', state.locale)) === false) fail('forbidden');
  const sql = discoverySql();
  const condition = state.collection.upload
    ? await assetEligibility({
        ...input,
        policy,
        sql,
        alias: 'u',
        document: 'COALESCE(u."boundDocumentId",u."documentId")',
        revision: 'u."boundRevisionId"',
        operationId: 'assets.readUpload',
      })
    : 'false';
  const files = sql.relation(sources.fileBindings),
    uploads = sql.relation(sources.uploads);
  const filters = [condition];
  if (query.status) filters.push(`u.status=${sql.parameter(query.status)}`);
  if (query.purpose) filters.push(`u.purpose=${sql.parameter(query.purpose)}`);
  if (query.documentId)
    filters.push(`COALESCE(u."boundDocumentId",u."documentId")=${sql.parameter(query.documentId)}`);
  const limit = sql.parameter(query.pageSize),
    offset = sql.parameter(offsetValue);
  const ctes = [
    ...sql.ctes,
    `discovery_file_bindings AS NOT MATERIALIZED (${files})`,
    `discovery_uploads AS NOT MATERIALIZED (${uploads})`,
    `discovery_matches AS MATERIALIZED (SELECT u."authorizationLocale" AS locale,u.id,u.collection,u.purpose,u."documentId",u.revision,u.status,u."expiresAt",u."failureCode",u."jobId",u.filename,u."declaredMimeType",u."declaredBytes",u."createdAt" FROM discovery_uploads u WHERE ${filters.join(' AND ')})`,
  ];
  return {
    sql: `WITH ${ctes.join(',')} SELECT (SELECT COALESCE(jsonb_agg(p ORDER BY p."createdAt" DESC,p.id DESC),'[]'::jsonb) FROM (SELECT * FROM discovery_matches ORDER BY "createdAt" DESC,id DESC LIMIT ${limit} OFFSET ${offset}) p) AS rows,(SELECT count(*)::text FROM discovery_matches) AS total`,
    values: sql.values,
  };
}

export async function queryUploads(
  tx: SqlExecutor,
  input: {
    state: ContentState;
    runtime: ContentRuntime;
    sources: AssetDiscoverySources;
    query: UploadDiscoveryQuery;
  },
): Promise<DiscoveryPage<UploadSummary>> {
  const compiled = await statement(input, input.query);
  const result = await tx.query<{ rows: UploadSummary[]; total: string }>(
    compiled.sql,
    compiled.values,
  );
  const [row] = result.rows;
  if (!row || !Number.isSafeInteger(Number(row.total))) fail('capacity_exceeded');
  return {
    rows: row.rows.map((upload) => ({
      ...upload,
      createdAt: new Date(upload.createdAt).toISOString(),
      expiresAt: new Date(upload.expiresAt).toISOString(),
    })),
    total: Number(row.total),
    page: input.query.page,
    pageSize: input.query.pageSize,
  };
}
