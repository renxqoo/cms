import type { ContentRuntime, ContentState } from '../types.ts';
import type { DiscoveryPolicy } from './discovery-policy.ts';
import { visibleFor } from './discovery-policy.ts';
import { visibleDocuments } from '../adapters/postgres/discovery-sql.ts';
import type { DiscoverySql } from '../adapters/postgres/discovery-sql.ts';

export interface AssetEligibility {
  state: ContentState;
  runtime: ContentRuntime;
  policy: DiscoveryPolicy;
  sql: DiscoverySql;
  alias: string;
  document: string;
  revision: string;
  operationId: string;
}

export async function assetEligibility(input: AssetEligibility): Promise<string> {
  const { state, policy, operationId, alias, document, revision, sql } = input;
  const allowed = await policy.policy(operationId, state.locale);
  if (allowed === false) return 'false';
  const create = await policy.policy('documents.create', state.locale);
  const withoutDocument =
    create === true && allowed === true && state.predicate === undefined
      ? `${document} IS NULL AND ${alias}.purpose='create'`
      : 'false';
  const visibility = await visibleFor(state, {
    policy,
    operations: [{ id: 'documents.get' }, { id: operationId }, { id: 'assets.download' }],
  });
  const documents = visibleDocuments(input, visibility);
  const historical = await visibleFor(state, {
    policy,
    operations: [
      { id: 'documents.get' },
      { id: operationId },
      { id: 'assets.download' },
      { id: 'versions.get' },
    ],
  });
  const versions = visibleDocuments(input, historical);
  const collection = sql.parameter(state.collection.id);
  return `((${withoutDocument}) OR (${document} IS NOT NULL AND EXISTS (
    SELECT 1 FROM content_documents ad JOIN content_revisions av
      ON av.id=COALESCE(${revision},ad.current_version_id) AND av.document_id=ad.id AND av.collection_id=${collection}
    WHERE ad.id=${document} AND ad.collection_id=${collection} AND ad.id IN (${documents})
      AND EXISTS(SELECT 1 FROM discovery_file_bindings fb WHERE fb."documentId"=ad.id AND fb."revisionId"=av.id)
      AND (${revision} IS NULL OR av.id=ad.current_version_id OR EXISTS(SELECT 1 FROM content_publications p WHERE p.document_id=ad.id AND p.version_id=av.id) OR ad.id IN (${versions}))
  )))`;
}

export async function assetJobEligibility(
  input: Omit<AssetEligibility, 'alias' | 'document' | 'revision' | 'operationId'>,
): Promise<string> {
  if (!input.state.collection.upload) return 'false';
  const conditions: string[] = [];
  for (const action of ['process', 'reprocess'] as const) {
    const eligible = await assetEligibility({
      ...input,
      alias: 'a',
      document: 'COALESCE(a."boundDocumentId",a."uploadDocumentId",a."documentId")',
      revision: 'a."boundRevisionId"',
      operationId: action === 'process' ? 'assets.completeUpload' : 'assets.reprocess',
    });
    conditions.push(`(a.action=${input.sql.parameter(action)} AND ${eligible})`);
  }
  return conditions.join(' OR ');
}
