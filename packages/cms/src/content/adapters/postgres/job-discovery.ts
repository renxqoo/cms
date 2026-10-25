import type { Where } from '../../definition.ts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { AssetDiscoverySources } from '@new-cms/cms/assets/composition';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../../types.ts';
import { createDiscoveryPolicy } from '../../jobs/discovery-policy.ts';
import { contentJobEligibility } from '../../jobs/content-discovery-policy.ts';
import { assetJobEligibility } from '../../jobs/asset-discovery-policy.ts';
import { discoveryOffset, discoverySql } from './discovery-sql.ts';
import type { DiscoverySql } from './discovery-sql.ts';
import type { DiscoveryPage, JobAction, JobStatus, JobSummary } from '../../jobs/contracts.ts';

export interface JobDiscoveryQuery {
  page: number;
  pageSize: number;
  action?: JobAction | undefined;
  status?: JobStatus | undefined;
  documentId?: string | undefined;
}

interface QueryDependencies {
  state: ContentState;
  runtime: ContentRuntime;
  sources: AssetDiscoverySources;
}

async function statement(input: QueryDependencies, query: JobDiscoveryQuery) {
  const { state, runtime, sources } = input;
  const sql = discoverySql();
  const policy = createDiscoveryPolicy(state, runtime);
  await policy.require('content.getJob');
  if ((await policy.policy('content.getJob', state.locale)) === false) fail('forbidden');
  const content = await contentJobEligibility({ ...input, policy, sql });
  const getPolicy = await policy.policy('content.getJob', state.locale);
  const predicates = [
    state.predicate,
    typeof getPolicy === 'object' ? getPolicy : undefined,
  ].filter((value): value is Where => value !== undefined);
  const predicate: Where | undefined = predicates.length > 1 ? { and: predicates } : predicates[0];
  const assetState = { ...state, ...(predicate ? { predicate } : {}) };
  const asset = await assetJobEligibility({ ...input, state: assetState, policy, sql });
  const files = sql.relation(sources.fileBindings);
  const assets = sql.relation(sources.jobs);
  const collection = sql.parameter(state.collection.id);
  const ctes = [
    ...sql.ctes,
    `discovery_file_bindings AS NOT MATERIALIZED (${files})`,
    `discovery_assets AS NOT MATERIALIZED (${assets})`,
    `discovery_content AS NOT MATERIALIZED (SELECT * FROM content_jobs WHERE collection_id=${collection})`,
    `discovery_items AS MATERIALIZED (SELECT i.job_id,i.document_id,i.result_document_id,i.status FROM content_job_items i JOIN discovery_content j ON j.id=i.job_id WHERE ${content.items})`,
    `discovery_counts AS (SELECT job_id,count(*) AS total,count(*) FILTER(WHERE status='succeeded') AS succeeded,count(*) FILTER(WHERE status='failed') AS failed,count(*) FILTER(WHERE status='queued') AS queued FROM discovery_items GROUP BY job_id)`,
    contentProjection(content.extensions),
    assetProjection(asset),
    `discovery_all AS (SELECT * FROM discovery_content_rows UNION ALL SELECT * FROM discovery_asset_rows)`,
  ];
  return pageStatement(sql, ctes, query);
}

function contentProjection(extensions: string): string {
  const status = `CASE WHEN j.action='extension' OR j.status='cancelled' THEN j.status WHEN c.queued>0 THEN CASE WHEN j.status='running' THEN 'running' ELSE 'queued' END WHEN c.failed=0 THEN 'succeeded' WHEN c.failed=c.total THEN 'failed' ELSE 'partial' END`;
  return `discovery_content_rows AS (SELECT j.id,'content'::text AS kind,j.created_at AS created_at,j.action,${status} AS status,j.document_id AS document_id,
    jsonb_build_object('kind','content','id',j.id,'collection',j.collection_key,'action',j.action,'status',${status},'executeAt',j.execute_at,'createdAt',j.created_at,'finishedAt',j.finished_at,'documentId',j.document_id,'expectedRevision',j.expected_revision,'requestedVersionId',j.requested_version_id,'total',COALESCE(c.total,0),'succeeded',COALESCE(c.succeeded,0),'failed',COALESCE(c.failed,0)) AS item
    FROM discovery_content j LEFT JOIN discovery_counts c ON c.job_id=j.id
    WHERE (j.action<>'extension' AND c.total>0) OR (j.action='extension' AND (${extensions})))`;
}

function assetProjection(condition: string): string {
  const document = 'COALESCE(a."boundDocumentId",a."uploadDocumentId",a."documentId")';
  return `discovery_asset_rows AS (SELECT a.id,'asset'::text AS kind,a."createdAt" AS created_at,a.action,a.status,${document} AS document_id,
    jsonb_build_object('kind','asset','id',a.id,'collection',a.collection,'action',a.action,'status',a.status,'attempts',a.attempts,'failureCode',a."failureCode",'uploadId',a."uploadId",'documentId',${document},'createdAt',a."createdAt",'finishedAt',a."finishedAt") AS item
    FROM discovery_assets a WHERE ${condition})`;
}

function pageStatement(sql: DiscoverySql, ctes: string[], query: JobDiscoveryQuery) {
  const filters: string[] = [];
  if (query.action) filters.push(`action=${sql.parameter(query.action)}`);
  if (query.status) filters.push(`status=${sql.parameter(query.status)}`);
  if (query.documentId) {
    const id = sql.parameter(query.documentId);
    filters.push(
      `(document_id=${id} OR (kind='content' AND EXISTS(SELECT 1 FROM discovery_items di WHERE di.job_id=discovery_all.id AND (di.document_id=${id} OR di.result_document_id=${id}))))`,
    );
  }
  ctes.push(
    `discovery_matches AS MATERIALIZED (SELECT * FROM discovery_all${filters.length > 0 ? ` WHERE ${filters.join(' AND ')}` : ''})`,
  );
  const limit = sql.parameter(query.pageSize),
    offset = sql.parameter(discoveryOffset(query));
  return {
    sql: `WITH ${ctes.join(',')} SELECT (SELECT COALESCE(jsonb_agg(p.item ORDER BY p.created_at DESC,p.id DESC,p.kind ASC),'[]'::jsonb) FROM (SELECT * FROM discovery_matches ORDER BY created_at DESC,id DESC,kind ASC LIMIT ${limit} OFFSET ${offset}) p) AS rows,(SELECT count(*)::text FROM discovery_matches) AS total`,
    values: sql.values,
  };
}

export async function queryJobs(
  tx: SqlExecutor,
  input: QueryDependencies & { query: JobDiscoveryQuery },
): Promise<DiscoveryPage<JobSummary>> {
  const compiled = await statement(input, input.query);
  const result = await tx.query<{ rows: JobSummary[]; total: string }>(
    compiled.sql,
    compiled.values,
  );
  const [row] = result.rows;
  if (!row || !Number.isSafeInteger(Number(row.total))) fail('capacity_exceeded');
  return {
    rows: row.rows.map((job) => ({
      ...job,
      createdAt: new Date(job.createdAt).toISOString(),
      finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
      ...(job.kind === 'content' ? { executeAt: new Date(job.executeAt).toISOString() } : {}),
    })),
    total: Number(row.total),
    page: input.query.page,
    pageSize: input.query.pageSize,
  };
}
