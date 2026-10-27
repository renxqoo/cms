import { contentOperations } from '../operations.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import { itemOperation } from './execute-item.ts';
import { visibleFor } from './discovery-policy.ts';
import type { DiscoveryPolicy } from './discovery-policy.ts';
import { visibleDocuments } from '../adapters/postgres/discovery-sql.ts';
import type { DiscoverySql } from '../adapters/postgres/discovery-sql.ts';

export interface ContentDiscoveryInput {
  state: ContentState;
  runtime: ContentRuntime;
  policy: DiscoveryPolicy;
  sql: DiscoverySql;
}

export async function contentJobEligibility(input: ContentDiscoveryInput) {
  const items: string[] = [];
  for (const source of ['content.batch', 'content.schedulePublication'])
    items.push(...(await itemEligibility(input, source)));
  const extensions = await extensionEligibility(input);
  return {
    items: items.length > 0 ? items.join(' OR ') : 'false',
    extensions: extensions.length > 0 ? extensions.join(' OR ') : 'false',
  };
}

async function extensionEligibility(input: ContentDiscoveryInput): Promise<string[]> {
  const { state, policy, sql } = input;
  const sources = contentOperations
    .filter((operation) => operation.method !== 'GET')
    .map((operation) => operation.id);
  const scopes = await state.tx.query<{ source: string; locale: string }>(
    "SELECT DISTINCT source_operation AS source,source_locale AS locale FROM content_jobs WHERE collection_id=$1 AND action='extension' AND source_operation=ANY($2::text[]) AND source_locale=ANY($3::text[])",
    [state.collection.id, sources, state.collection.locales.supported],
  );
  const extensions: string[] = [];
  for (const { source, locale } of scopes.rows) {
    const extension = await visibleFor(state, {
      policy,
      locale,
      inheritPredicate: false,
      operations: [
        { id: state.operationId, locale },
        { id: 'content.getJob', locale },
        { id: source, locale },
        { id: 'documents.get', locale },
      ],
    });
    if (extension === false) continue;
    const documents = visibleDocuments(input, extension);
    extensions.push(
      `(j.source_operation=${sql.parameter(source)} AND j.source_locale=${sql.parameter(locale)} AND j.document_id IN (${documents}))`,
    );
  }
  return extensions;
}

async function itemEligibility(input: ContentDiscoveryInput, source: string): Promise<string[]> {
  const result: string[] = [];
  const { state, policy, sql } = input;
  const actions =
    source === 'content.schedulePublication'
      ? (['publish', 'unpublish'] as const)
      : (['update', 'copy', 'archive', 'restoreTrash'] as const);
  for (const action of actions) {
    for (const locale of state.collection.locales.supported) {
      const operation = itemOperation(action);
      const visibility = await visibleFor(state, {
        policy,
        operations: [
          { id: state.operationId, locale },
          { id: 'content.getJob', locale },
          { id: source, locale },
          { id: operation, locale },
        ],
        locale,
        inheritPredicate: false,
        includeTrashed: true,
      });
      if (visibility === false) continue;
      const documents = visibleDocuments(input, visibility);
      const readable = await visibleFor(state, {
        policy,
        operations: [{ id: 'documents.get', locale }],
        locale,
        includeTrashed: true,
        inheritPredicate: false,
      });
      const results = visibleDocuments(input, readable);
      result.push(
        `(j.source_operation=${sql.parameter(source)} AND i.payload->>'action'=${sql.parameter(action)} AND i.payload->>'locale'=${sql.parameter(locale)} AND i.document_id IN (${documents}) AND COALESCE(i.result_document_id,i.document_id) IN (${results}))`,
      );
    }
  }
  return result;
}
